import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validAudio, validAudioState, emptyAudio } from '../src/shared/audio';
import { emptyConfig, parseConfig } from '../src/shared/model';

test('global microphone settings migrate without touching profile identities and reject unsafe names', () => {
  const legacy = emptyConfig(); delete (legacy as Partial<typeof legacy>).audio;
  assert.deepEqual(parseConfig(legacy).audio, { input: null });
  for (const input of [42, {}, '', 'x\nspoof', 'x'.repeat(257)]) assert.equal(validAudio({ input }), false);
  const restored = parseConfig({ ...emptyConfig(), audio: { input: 'Studio USB microphone', deviceId: 'profile-specific-id' } });
  assert.deepEqual(restored.audio, { input: 'Studio USB microphone' });
  assert.equal(validAudioState({ ...emptyAudio(), devices: ['Studio USB microphone'], status: 'selected' }), true);
  for (const level of [-1, 2, NaN, Infinity]) assert.equal(validAudioState({ ...emptyAudio(), level }), false);
});
