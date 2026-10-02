import { test } from 'node:test';
import assert from 'node:assert/strict';
import { channels, contrast, resolveTheme, THEME_PRESETS, validTheme } from '../src/shared/theme';
import { contractHash } from '../src/preload/theme';
import { QUO_LIGHT, QUO_DARK, QUO_CONTRACTS } from '../src/preload/theme-contract';
import { emptyConfig, parseConfig } from '../src/shared/model';

test('every palette and extreme custom accent keeps text and solid controls readable in both appearances', () => {
  const themes = [...THEME_PRESETS.map(preset => ({ preset: preset.id, accent: preset.accent })),
    ...['#000000', '#ffffff', '#ffff00', '#00ffff', '#ff00ff', '#ff0000', '#00ff00', '#0000ff', '#808080'].map(accent => ({ preset: 'custom' as const, accent }))];
  for (const theme of themes) for (const dark of [false, true]) for (const increased of [false, true]) {
    const { colors: c } = resolveTheme({ ...theme, mode: dark ? 'dark' : 'light' }, false, increased);
    const target = increased ? 7 : 4.5;
    for (const foreground of [c.text, c.secondary, c.tertiary, c.accentText, c.accentStrong]) {
      for (const background of [c.surface, c.elevated, c.sidebar, c.hover, c.selection]) assert.ok(contrast(foreground, background) >= target, `${theme.preset} ${theme.accent} ${dark} ${increased} ${foreground} on ${background}`);
    }
    for (const fill of [c.accent, c.accentHover, c.accentPressed]) assert.ok(contrast(c.onAccent, fill) >= target);
    assert.notEqual(c.accent, c.accentHover); assert.notEqual(c.accentHover, c.accentPressed);
    for (const value of Object.values(c)) assert.match(value, /^#[0-9a-f]{6}$/i);
    assert.ok(!channels(c.accent).includes('NaN'));
  }
});
test('theme input rejects CSS injection and migration preserves profile identifiers and notification choices', () => {
  for (const theme of [null, {}, { preset: 'custom', mode: 'dark' }, { preset: 'custom', mode: 'dark', accent: '#123456;display:none' }, { preset: 'iris', mode: 'invalid' }, { preset: 'custom', mode: 'dark', accent: 123456 }]) assert.equal(validTheme(theme), false);
  const config = emptyConfig();
  const account = { id: '00000000-0000-4000-8000-000000000001', name: 'Studio', color: 'blue', zoom: 0.9 };
  const { menuBarLayout: _layout, animateActivity: _animation, ...oldPreferences } = config.preferences;
  const migrated = parseConfig({ ...config, accounts: [account], preferences: { ...oldPreferences, notifications: false } });
  assert.equal(migrated.preferences.menuBarLayout, 'combined'); assert.equal(migrated.preferences.animateActivity, true); assert.equal(migrated.preferences.notifications, false);
  assert.equal(migrated.accounts[0]?.id, account.id); assert.equal(migrated.accounts[0]?.zoom, 0.9);
  for (const menuBarLayout of ['arbitrary', null, new String('separate')]) assert.throws(() => parseConfig({ ...config, preferences: { ...config.preferences, menuBarLayout } }));
  const restored = parseConfig({ ...migrated, accounts: [{ ...account, theme: { preset: 'custom', mode: 'dark', accent: '#ABCDEF', injected: 'ignore' } }] });
  assert.deepEqual(restored.accounts[0]?.theme, { preset: 'custom', mode: 'dark', accent: '#abcdef' });
});
test('verified Quo contracts accept whitespace changes and reject reordered or modified semantic roles', () => {
  for (const values of [QUO_LIGHT, QUO_DARK]) {
    assert.equal(QUO_CONTRACTS.has(contractHash(values)), true);
    assert.equal(contractHash(values.map(value => value.replaceAll(',', ',\n '))), contractHash(values));
    const changed = [...values]; changed[8] = '255, 0, 0'; assert.equal(QUO_CONTRACTS.has(contractHash(changed)), false);
    const reordered = [...values]; [reordered[8], reordered[9]] = [reordered[9]!, reordered[8]!]; assert.equal(QUO_CONTRACTS.has(contractHash(reordered)), false);
  }
});
