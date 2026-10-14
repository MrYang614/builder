import { describe, expect, it } from 'vitest';
import { createEmptyProject, createWall, EditorCore } from '@building/editor-core';
import { CommandGateway } from './command-gateway';
import { ProjectController } from './project-controller';

describe('ProjectController', () => {
  it('does not mark a stale save clean or change the active path', () => {
    const core = new EditorCore(createEmptyProject());
    const commands = new CommandGateway(core);
    const controller = new ProjectController(core, commands);
    const captured = controller.captureSave();
    const replacement = createEmptyProject('Replacement');

    expect(controller.replace(replacement, 'replacement.building').ok).toBe(true);
    expect(controller.completeSave(captured.cursor, 'old.building')).toBe(false);
    expect(controller.getPath()).toBe('replacement.building');
    expect(core.isDirty()).toBe(false);
  });

  it('marks the exact captured revision clean and records its path', () => {
    const core = new EditorCore(createEmptyProject());
    const controller = new ProjectController(core, new CommandGateway(core));
    const captured = controller.captureSave();

    expect(controller.completeSave(captured.cursor, 'project.building')).toBe(true);
    expect(controller.getPath()).toBe('project.building');
    expect(core.isDirty()).toBe(false);
  });

  it('keeps a newer edit dirty when an older save finishes', () => {
    const core = new EditorCore(createEmptyProject());
    const commands = new CommandGateway(core);
    const controller = new ProjectController(core, commands);
    const captured = controller.captureSave();
    const levelId = core.getSnapshot().levels[0]!.id;

    expect(
      commands.execute({
        type: 'add-wall',
        wall: createWall(levelId, { x: 0, z: 0 }, { x: 2, z: 0 }),
      }).ok,
    ).toBe(true);
    expect(controller.completeSave(captured.cursor, 'stale.building')).toBe(false);
    expect(controller.getPath()).toBeUndefined();
    expect(core.isDirty()).toBe(true);
  });
});
