/** Editing stage copy stays separate from transient errors, snap targets and live dimensions. */
export const editingMessages: Record<'en' | 'zh-CN', Record<string, string>> = {
  en: {
    hintStart: 'Click a start point. Right drag rotates, Shift + right drag pans.',
    hintSelect: 'Click to select. Drag a wall endpoint, a slab or a door/window to edit.',
    hintPlace: 'Move over a wall on the current level, then click to place.',
    hintMaterial: 'Click a wall or slab surface, then edit its material.',
    'hint.continue': 'Click the next endpoint to continue the wall. Esc ends this drawing.',
    'hint.slabEnd': 'Click the opposite corner to finish the slab. Esc cancels.',
  },
  'zh-CN': {
    hintStart: '点击起点。右键拖动旋转，Shift＋右键拖动平移。',
    hintSelect: '点击选择，拖动墙端点、楼板或门窗进行编辑。',
    hintPlace: '移到当前层墙面预览，然后点击放置。',
    hintMaterial: '点击墙体或楼板表面，再设置对应材质。',
    'hint.continue': '点击下一段终点继续绘墙；Esc 结束本次绘制。',
    'hint.slabEnd': '点击对角点完成楼板；Esc 取消。',
  },
};
