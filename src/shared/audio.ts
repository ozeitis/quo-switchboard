export interface AudioPreferences { input: string | null }
export interface AudioState {
  devices: string[];
  input: string | null;
  effective: string | null;
  status: 'system' | 'selected' | 'missing' | 'ambiguous' | 'permission' | 'pending' | 'error';
  capturing: boolean;
  testing: boolean;
  level: number;
}
export const DEFAULT_AUDIO: AudioPreferences = { input: null };
export const emptyAudio = (): AudioState => ({ devices: [], input: null, effective: null, status: 'pending', capturing: false, testing: false, level: 0 });
export function validDeviceLabel(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 256 && !/[\u0000-\u001f\u007f]/.test(value);
}
export function validAudio(value: unknown): value is AudioPreferences {
  return !!value && typeof value === 'object' && ((value as AudioPreferences).input === null || validDeviceLabel((value as AudioPreferences).input));
}
export function validAudioState(value: unknown): value is AudioState {
  if (!value || typeof value !== 'object') return false;
  const state = value as AudioState;
  return Array.isArray(state.devices) && state.devices.length <= 64 && state.devices.every(validDeviceLabel)
    && validAudio(state) && (state.effective === null || validDeviceLabel(state.effective))
    && ['system','selected','missing','ambiguous','permission','pending','error'].includes(state.status)
    && typeof state.capturing === 'boolean' && typeof state.testing === 'boolean'
    && Number.isFinite(state.level) && state.level >= 0 && state.level <= 1;
}
