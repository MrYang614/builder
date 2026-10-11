import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { importImageFile } from './index';

const host = vi.hoisted(() => ({ desktop: true, invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => host.desktop, invoke: host.invoke }));

describe('binary native image import', () => {
  beforeEach(() => {
    host.desktop = true;
    host.invoke.mockReset();
  });
  afterEach(() => vi.restoreAllMocks());
  it('infers MIME from PNG bytes for a file with no declared browser MIME', async () => {
    const bytes = Uint8Array.from(
      atob(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
      ),
      (character) => character.charCodeAt(0),
    );
    host.invoke.mockResolvedValue({ id: 'image_native', name: 'drop.png', mime: 'image/png' });
    const resource = await importImageFile(new File([bytes], 'drop.png'));
    expect(resource.mime).toBe('image/png');
    expect(resource.dataUrl).toMatch(/^data:image\/png;base64,/);
    expect(host.invoke).toHaveBeenCalledWith('import_image_bytes', bytes, {
      headers: { 'X-File-Name': 'drop.png', 'X-File-Mime': 'image%2Fpng' },
    });
  });
  it('rejects invalid bytes before the native import boundary', async () => {
    await expect(importImageFile(new File(['invalid'], 'drop.png'))).rejects.toMatchObject({
      code: 'invalid_image',
    });
    expect(host.invoke).not.toHaveBeenCalled();
  });
});
