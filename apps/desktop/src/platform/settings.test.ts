import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadSettings, saveSettings, SETTINGS_CACHE_KEY, type AppSettings } from './index';

const host = vi.hoisted(() => ({ desktop: false, invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => host.desktop, invoke: host.invoke }));
describe('local theme and renderer preference migration and validation', () => {
  const values = new Map<string, string>();
  beforeEach(() => {
    values.clear();
    host.desktop = false;
    host.invoke.mockReset();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it('defaults old or malformed backend preferences to WebGL without losing valid language/theme', async () => {
    values.set(SETTINGS_CACHE_KEY, JSON.stringify({ themeMode: 'dark', language: 'en' }));
    expect(await loadSettings()).toEqual({
      themeMode: 'dark',
      language: 'en',
      rendererBackend: 'webgl',
    });
    values.set(
      SETTINGS_CACHE_KEY,
      JSON.stringify({ themeMode: 'dark', language: 'en', rendererBackend: 'invalid' }),
    );
    expect(await loadSettings()).toEqual({
      themeMode: 'dark',
      language: 'en',
      rendererBackend: 'webgl',
    });
    values.set(SETTINGS_CACHE_KEY, 'broken-json');
    expect(await loadSettings()).toEqual({
      themeMode: 'light',
      language: 'zh-CN',
      rendererBackend: 'webgl',
    });
  });
  it.each(['system', 'invalid', null])(
    'migrates legacy %s to light without losing language or renderer',
    async (themeMode) => {
      values.set(
        SETTINGS_CACHE_KEY,
        JSON.stringify({ themeMode, language: 'en', rendererBackend: 'webgpu' }),
      );
      expect(await loadSettings()).toEqual({
        themeMode: 'light',
        language: 'en',
        rendererBackend: 'webgpu',
      });
    },
  );
  it.each(['light', 'dark'] as const)('preserves an explicit %s preference', async (themeMode) => {
    values.set(
      SETTINGS_CACHE_KEY,
      JSON.stringify({ themeMode, language: 'en', rendererBackend: 'webgpu' }),
    );
    expect(await loadSettings()).toEqual({ themeMode, language: 'en', rendererBackend: 'webgpu' });
  });
  it('normalizes legacy native settings before exposing them to startup', async () => {
    host.desktop = true;
    host.invoke.mockResolvedValue({
      themeMode: 'system',
      language: 'en',
      rendererBackend: 'webgpu',
    });
    expect(await loadSettings()).toEqual({
      themeMode: 'light',
      language: 'en',
      rendererBackend: 'webgpu',
    });
    expect(host.invoke).toHaveBeenCalledWith('load_settings');
  });
  it('writes a fixed light theme when legacy runtime input reaches the save boundary', async () => {
    host.desktop = true;
    const legacyInput: unknown = { themeMode: 'system', language: 'en', rendererBackend: 'webgpu' };
    await saveSettings(legacyInput as AppSettings);
    const expected = { themeMode: 'light', language: 'en', rendererBackend: 'webgpu' };
    expect(host.invoke).toHaveBeenCalledWith('save_settings', { settings: expected });
    expect(JSON.parse(values.get(SETTINGS_CACHE_KEY)!)).toEqual(expected);
  });
  it('persists the explicit WebGPU preference only in local settings', async () => {
    await saveSettings({ themeMode: 'light', language: 'zh-CN', rendererBackend: 'webgpu' });
    expect(JSON.parse(values.get(SETTINGS_CACHE_KEY)!)).toEqual({
      themeMode: 'light',
      language: 'zh-CN',
      rendererBackend: 'webgpu',
    });
    expect(await loadSettings()).toEqual({
      themeMode: 'light',
      language: 'zh-CN',
      rendererBackend: 'webgpu',
    });
  });
  it('retains successful native persistence when the optional browser cache is unavailable', async () => {
    host.desktop = true;
    vi.stubGlobal('localStorage', {
      setItem: () => {
        throw new Error('cache unavailable');
      },
    });
    const settings: AppSettings = { themeMode: 'dark', language: 'en', rendererBackend: 'webgpu' };
    await expect(saveSettings(settings)).resolves.toBeUndefined();
    expect(host.invoke).toHaveBeenCalledWith('save_settings', { settings });
  });
  it('still reports native write failures instead of treating the optional cache as persistence', async () => {
    host.desktop = true;
    const error = new Error('disk full');
    host.invoke.mockRejectedValue(error);
    await expect(
      saveSettings({ themeMode: 'dark', language: 'en', rendererBackend: 'webgpu' }),
    ).rejects.toBe(error);
    expect(values.has(SETTINGS_CACHE_KEY)).toBe(false);
  });
});
