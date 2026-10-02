import { contextBridge, ipcRenderer } from 'electron';
import type { AudioPreferences, AudioState } from '../shared/audio';

// Runs before Quo: its own capture calls use the shared choice, resolved in this profile.
export function installAudio(): void {
  contextBridge.executeInMainWorld({ func: audioInPage });
  ipcRenderer.on('account:audio', (_event, audio: AudioPreferences) => dispatch('policy', audio));
  ipcRenderer.on('account:audio-command', (_event, action: string) => dispatch('command', action));
  window.addEventListener('switchboard:audio-state', event => {
    try { ipcRenderer.send('account:event', { type: 'audio-state', audio: JSON.parse((event as CustomEvent<string>).detail) as AudioState }); } catch { /* Ignore malformed page events. */ }
  });
  void ipcRenderer.invoke('account:audio-policy').then(audio => dispatch('policy', audio), () => dispatch('failure', null));
  function dispatch(type: string, value: unknown): void {
    window.dispatchEvent(new CustomEvent('switchboard:audio', { detail: JSON.stringify({ type, value }) }));
  }
}

function audioInPage(): void {
  const media = navigator.mediaDevices;
  if (!media?.getUserMedia) return;
  const capture = media.getUserMedia.bind(media);
  const enumerate = media.enumerateDevices.bind(media);
  let policy: { input: string | null } = { input: null };
  let initialized = false;
  let initialize: () => void;
  const ready = new Promise<void>(resolve => { initialize = resolve; });
  const tracks = new Set<MediaStreamTrack>();
  let testStream: MediaStream | undefined;
  let testContext: AudioContext | undefined;
  let testTimer: ReturnType<typeof setTimeout> | undefined;
  let meterTimer: ReturnType<typeof setInterval> | undefined;
  let revision = 0;
  let devices: MediaDeviceInfo[] = [];
  let effective: string | null = null;
  let error: 'permission' | 'error' | undefined;
  let level = 0;
  const labels = () => devices.filter(device => device.kind === 'audioinput' && device.deviceId !== 'default' && device.deviceId !== 'communications');
  const match = () => labels().filter(device => device.label === policy.input);
  const state = () => {
    for (const track of tracks) if (track.readyState === 'ended') tracks.delete(track);
    const matches = match();
    const status = error ?? (!policy.input ? 'system' : matches.length === 1 ? 'selected' : matches.length > 1 ? 'ambiguous' : devices.some(device => device.label) ? 'missing' : 'pending');
    window.dispatchEvent(new CustomEvent('switchboard:audio-state', { detail: JSON.stringify({
      devices: [...new Set(labels().map(device => device.label).filter(Boolean))].slice(0, 64), input: policy.input, effective, status,
      capturing: [...tracks].some(track => track.readyState === 'live'), testing: !!testStream, level
    }) }));
  };
  const refresh = async () => { devices = await enumerate(); state(); };
  async function constraints(options: MediaStreamConstraints): Promise<MediaStreamConstraints> {
    await Promise.race([ready, new Promise<never>((_resolve, reject) => { const timeout = setTimeout(() => { error = 'error'; state(); reject(new DOMException('Shared microphone settings are unavailable.', 'InvalidStateError')); }, 5000); void ready.then(() => clearTimeout(timeout)); })]);
    if (!options?.audio) return options;
    await refresh();
    if (!policy.input) return { ...options, audio: { ...(typeof options.audio === 'object' ? options.audio : {}), deviceId: { exact: 'default' } } };
    const candidates = match();
    if (candidates.length !== 1) { state(); throw new DOMException(candidates.length ? 'Microphone name is ambiguous. Choose a uniquely named device.' : 'Selected microphone is unavailable. Refresh devices or choose System Default.', 'NotFoundError'); }
    return { ...options, audio: { ...(typeof options.audio === 'object' ? options.audio : {}), deviceId: { exact: candidates[0]!.deviceId } } };
  }
  media.getUserMedia = async options => {
    const selected = await constraints(options ?? {});
    try {
      const stream = await capture(selected);
      error = undefined;
      for (const track of stream.getAudioTracks()) {
        tracks.add(track);
        const stopTrack = track.stop.bind(track);
        track.stop = () => { stopTrack(); tracks.delete(track); state(); };
        effective = track.label || policy.input;
        track.addEventListener('ended', () => { tracks.delete(track); state(); }, { once: true });
      }
      await refresh().catch(() => { state(); }); return stream;
    } catch (failure) { error = failure instanceof DOMException && failure.name === 'NotAllowedError' ? 'permission' : 'error'; state(); throw failure; }
  };
  function stop(): void {
    revision++;
    clearTimeout(testTimer); clearInterval(meterTimer); testTimer = undefined; meterTimer = undefined;
    testStream?.getTracks().forEach(track => track.stop()); testStream = undefined;
    void testContext?.close().catch(() => undefined); testContext = undefined; level = 0; state();
  }
  async function command(action: string): Promise<void> {
    if (action === 'stop') { stop(); return; }
    if (action !== 'refresh' && action !== 'test') return;
    stop(); const run = revision;
    let stream: MediaStream | undefined;
    // Opening Settings alone never activates the microphone.
    try {
      stream = await capture(action === 'test' ? await constraints({ audio: true }) : { audio: true });
      if (run !== revision) { stream.getTracks().forEach(track => track.stop()); return; }
      error = undefined; await refresh();
      if (run !== revision) { stream.getTracks().forEach(track => track.stop()); return; }
      if (action === 'refresh') { stream.getTracks().forEach(track => track.stop()); state(); return; }
      testStream = stream;
      testContext = new AudioContext();
      const source = testContext.createMediaStreamSource(stream);
      const meter = testContext.createAnalyser(); meter.fftSize = 256; source.connect(meter);
      const samples = new Float32Array(meter.fftSize);
      meterTimer = setInterval(() => { meter.getFloatTimeDomainData(samples); level = Math.min(1, Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length) * 4); state(); }, 120);
      testTimer = setTimeout(stop, 10_000); state();
    } catch (failure) {
      stream?.getTracks().forEach(track => track.stop());
      if (run !== revision) return;
      stop(); error = failure instanceof DOMException && failure.name === 'NotAllowedError' ? 'permission' : 'error'; state();
    }
  }
  window.addEventListener('switchboard:audio', event => {
    try {
      const data = JSON.parse((event as CustomEvent<string>).detail);
      if (data.type === 'policy' && (data.value?.input === null || typeof data.value?.input === 'string')) {
        if (policy.input !== data.value.input) stop();
        policy = { input: data.value.input }; error = undefined;
        if (!initialized) { initialized = true; initialize!(); }
        void refresh().catch(() => { error = 'error'; state(); });
      } else if (data.type === 'failure') { error = 'error'; state(); }
      else if (data.type === 'command') void command(data.value);
    } catch { /* Ignore unrelated events. */ }
  });
  media.addEventListener('devicechange', () => { void refresh().catch(() => undefined); });
  window.addEventListener('pagehide', stop);
}
