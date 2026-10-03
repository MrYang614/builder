import { describe, expect, it } from 'vitest';
import { unzipSync, zipSync, strToU8 } from 'fflate';
import { createEmptyProject, type Resource } from '@building/editor-core';
import { decodeProjectContainer, encodeProjectContainer } from './container';

const pixel: Resource = {
  id: 'image_pixel',
  name: '原始 image.png',
  mime: 'image/png',
  dataUrl:
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
};
describe('portable project container', () => {
  it('retains editable data and complete image bytes without a source path', async () => {
    const doc = createEmptyProject('中文 Building');
    doc.resources.push(pixel);
    const saved = await encodeProjectContainer(doc);
    const reopened = await decodeProjectContainer(saved);
    expect(reopened).toEqual(doc);
    expect(Object.keys(unzipSync(saved))).toHaveLength(2);
    expect(JSON.stringify(reopened)).not.toContain('C:/');
  });
  it('stores one content-addressed entry when resource identifiers differ', async () => {
    const doc = createEmptyProject();
    doc.resources.push(pixel, { ...pixel, id: 'image_alias', name: 'same.png' });
    const saved = await encodeProjectContainer(doc);
    expect(Object.keys(unzipSync(saved))).toHaveLength(2);
    expect((await decodeProjectContainer(saved)).resources).toHaveLength(2);
  });
  it('rejects unknown future fields and unsupported versions', async () => {
    const doc = createEmptyProject();
    const future = zipSync({
      'project.json': strToU8(JSON.stringify({ ...doc, schemaVersion: 2 })),
    });
    await expect(decodeProjectContainer(future)).rejects.toMatchObject({
      code: 'unsupported_version',
    });
    const unknown = zipSync({
      'project.json': strToU8(JSON.stringify({ ...doc, newFeature: true })),
    });
    await expect(decodeProjectContainer(unknown)).rejects.toMatchObject({
      code: 'project.unknownField',
    });
  });
  it('rejects missing resources and checksum corruption', async () => {
    const doc = createEmptyProject();
    doc.resources.push(pixel);
    const files = unzipSync(await encodeProjectContainer(doc));
    const imagePath = Object.keys(files).find((path) => path.startsWith('resources/'))!;
    const missing = { ...files };
    delete missing[imagePath];
    await expect(decodeProjectContainer(zipSync(missing))).rejects.toMatchObject({
      code: 'missing_resource',
    });
    files[imagePath]![0] ^= 1;
    await expect(decodeProjectContainer(zipSync(files))).rejects.toMatchObject({
      code: 'corrupt_project',
    });
  });
  it('rejects traversal, unexpected entries and malformed files', async () => {
    const doc = createEmptyProject();
    const project = strToU8(JSON.stringify(doc));
    await expect(
      decodeProjectContainer(
        zipSync({ 'project.json': project, '../outside.png': new Uint8Array([1]) }),
      ),
    ).rejects.toMatchObject({ code: 'corrupt_project' });
    await expect(
      decodeProjectContainer(
        zipSync({ 'project.json': project, 'unknown.txt': new Uint8Array([1]) }),
      ),
    ).rejects.toMatchObject({ code: 'unknown_fields' });
    await expect(decodeProjectContainer(new Uint8Array([1, 2, 3]))).rejects.toMatchObject({
      code: 'corrupt_project',
    });
  });
});
