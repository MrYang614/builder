import { useDocument, useEditor, useSession } from '../app/services';
import { Choice, Numeric } from './fields';
import { useLanguage } from './i18n';

/** One shared slab draft survives view switches without duplicated inputs or competing focus. */
export function SlabOptions() {
  const { session } = useEditor(),
    s = useSession(),
    doc = useDocument(),
    { t } = useLanguage();
  const level = doc.levels.find((item) => item.id === s.currentLevelId)!;
  if (s.tool !== 'slab') {
    return null;
  }
  return (
    <div className="slab-options">
      <Choice
        label={t('purpose')}
        value={s.slabPurpose}
        options={['floor', 'roof'].map((value) => ({ value, label: t(value) }))}
        onChange={(value) => session.set({ slabPurpose: value as 'floor' | 'roof' })}
      />
      {s.slabPurpose === 'roof' && (
        <Numeric
          label={t('roofHeight')}
          value={s.roofElevation ?? level.elevation + level.height}
          onCommit={(value) => session.set({ roofElevation: value })}
        />
      )}
    </div>
  );
}
