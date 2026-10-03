import { describe, expect, it } from 'vitest';
import { unzipSync, zipSync, strToU8 } from 'fflate';
import { createEmptyProject, defaultEnvironmentSettings } from '@building/editor-core';
import {
  browserEnvironmentResource,
  encodeProjectContainer,
  decodeProjectContainer,
  validateEnvironmentBytes,
  browserResource,
} from './container';
import { hdrPanorama, exrPanorama } from '../../../../tests/environment-fixtures';

describe('portable environment files and real HDR/EXR decoding', () => {
  for (const [name, data] of [
    ['全景.hdr', hdrPanorama()],
    ['全景.exr', exrPanorama()],
  ] as const) {
    it(`decodes ${name}, stores hash-addressed original bytes and reopens without source file`, async () => {
      const resource = await browserEnvironmentResource(
        new File([new Uint8Array(data).buffer], name),
      );
      const document = createEmptyProject();
      document.environmentResources = [resource, { ...resource, id: 'environment_alias' }];
      document.environment = {
        ...defaultEnvironmentSettings(),
        resourceId: resource.id,
        rotation: 180,
        background: true,
      };
      const saved = await encodeProjectContainer(document),
        archive = unzipSync(saved);
      const path = Object.keys(archive).find((name) => name.startsWith('environment-resources/'))!;
      expect(Object.keys(archive)).toHaveLength(2);
      expect(archive[path]).toEqual(data);
      expect(await decodeProjectContainer(saved)).toEqual(document);
      const manifest = JSON.parse(new TextDecoder().decode(archive['project.json']!));
      expect(manifest.environmentResources[0].sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(manifest.environmentResources[0]).not.toHaveProperty('dataUrl');
      const missing = { ...archive };
      delete missing[path];
      await expect(decodeProjectContainer(zipSync(missing))).rejects.toMatchObject({
        code: 'missing_resource',
      });
      archive[path]![archive[path]!.length - 1] ^= 1;
      await expect(decodeProjectContainer(zipSync(archive))).rejects.toMatchObject({
        code: 'corrupt_project',
      });
    });
  }
  it('keeps old v1 files byte-data compatible without environment defaults', async () => {
    const document = createEmptyProject();
    expect(await decodeProjectContainer(await encodeProjectContainer(document))).toEqual(document);
    expect(
      await decodeProjectContainer(zipSync({ 'project.json': strToU8(JSON.stringify(document)) })),
    ).not.toHaveProperty('environment');
  });
  it('rejects decoder failures, disguised formats and HDR surface imports', async () => {
    await expect(validateEnvironmentBytes(hdrPanorama().subarray(0, 50))).rejects.toMatchObject({
      code: 'environment.invalidAsset',
    });
    await expect(validateEnvironmentBytes(exrPanorama().subarray(0, 80))).rejects.toMatchObject({
      code: 'environment.invalidAsset',
    });
    await expect(validateEnvironmentBytes(exrPanorama(), 'image/png')).rejects.toMatchObject({
      code: 'environment.invalidAsset',
    });
    await expect(
      browserResource(
        new File([new Uint8Array(hdrPanorama()).buffer], 'false.png', { type: 'image/png' }),
      ),
    ).rejects.toMatchObject({ code: 'invalid_image' });
    const nonfinite = exrPanorama();
    new DataView(nonfinite.buffer).setFloat32(nonfinite.length - 4, Number.NaN, true);
    await expect(validateEnvironmentBytes(nonfinite)).rejects.toMatchObject({
      code: 'environment.invalidAsset',
    });
  });
});
