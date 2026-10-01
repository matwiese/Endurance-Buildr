import { TEST_TYPES, TEST_TYPE_INFO, isoPresetFor, type TestFamily, type TestType } from '@buildr/core';
import type { TagDTO, TagTypeDTO } from '@buildr/shared';
import { useEffect, useState } from 'react';
import { Banner, Button, Card, Field, Toggle } from '../../components/ui.tsx';
import { useT } from '../../i18n/hooks.ts';
import type { MessageKey } from '../../i18n/index.ts';
import { uid } from '../../lib/uid.ts';
import { localRepo } from '../../offline/repo.ts';
import { useLive } from '../../state/live.ts';
import { useWorkflow } from '../../state/workflow.ts';

const GROUPS: Array<{ key: MessageKey; families: TestFamily[] }> = [
  { key: 'test.group.jumps', families: ['cmj', 'sj'] },
  { key: 'test.group.reactive', families: ['cmrj', 'dj', 'hop'] },
  { key: 'test.group.landing', families: ['landing'] },
  { key: 'test.group.isometric', families: ['isometric'] },
  { key: 'test.group.balance', families: ['balance'] },
];

export function StepTestType({ onNext }: { onNext: () => void }) {
  const { t, lang } = useT();
  const wf = useWorkflow();
  const live = useLive();
  const [tagTypes, setTagTypes] = useState<TagTypeDTO[]>([]);
  const [tags, setTags] = useState<TagDTO[]>([]);
  const [newType, setNewType] = useState('');
  const [newValue, setNewValue] = useState('');

  const reload = async () => {
    setTagTypes(await localRepo.tagTypes.list());
    setTags(await localRepo.tags.list());
  };
  useEffect(() => {
    void reload();
  }, []);

  const choose = (m: 'auto' | TestType) => {
    wf.setMode(m);
    const loaded = m !== 'auto' && TEST_TYPE_INFO[m].loaded;
    const load = loaded
      ? wf.externalLoadKg > 0
        ? wf.externalLoadKg
        : 20
      : m === 'auto'
        ? wf.externalLoadKg
        : 0;
    wf.setLoad(load);
    live.configure(m, load);
  };

  const createTag = async () => {
    const typeName = newType.trim();
    const value = newValue.trim();
    if (!typeName || !value) return;
    let tt = tagTypes.find((x) => x.name.toLowerCase() === typeName.toLowerCase());
    if (!tt) {
      tt = { id: uid(), name: typeName };
      await localRepo.tagTypes.put(tt);
      await localRepo.outbox.add('tagType', tt.id);
    }
    const tag: TagDTO = { id: uid(), tagTypeId: tt.id, name: value };
    await localRepo.tags.put(tag);
    await localRepo.outbox.add('tag', tag.id);
    wf.toggleTag(tag.id);
    setNewValue('');
    await reload();
  };

  const info = wf.mode === 'auto' ? null : TEST_TYPE_INFO[wf.mode];
  const loadVisible = wf.mode === 'auto' || (info?.loaded ?? false);

  return (
    <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
      <div>
        <button
          type="button"
          data-testid="type-auto"
          onClick={() => choose('auto')}
          className={`mb-4 flex min-h-20 w-full items-center gap-4 rounded-2xl border-2 p-4 text-left ${wf.mode === 'auto' ? 'border-primary bg-surface2' : 'border-line bg-surface'}`}
        >
          <span className="text-3xl" aria-hidden>
            ✨
          </span>
          <span>
            <span className="block text-xl font-bold">{t('test.auto')}</span>
            <span className="block text-sm text-muted">{t('test.auto.desc')}</span>
          </span>
        </button>
        {GROUPS.map((g) => {
          const types = TEST_TYPES.filter((x) => g.families.includes(TEST_TYPE_INFO[x].family));
          return (
            <Card key={g.key} title={t(g.key)} className="mb-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {types.map((ty) => (
                  <button
                    key={ty}
                    type="button"
                    data-testid={`type-${ty}`}
                    aria-pressed={wf.mode === ty}
                    onClick={() => choose(ty)}
                    className={`min-h-14 rounded-xl border px-3 py-2 text-left font-medium ${wf.mode === ty ? 'border-primary bg-primary text-primary-fg' : 'border-line bg-surface hover:bg-surface2'}`}
                  >
                    {TEST_TYPE_INFO[ty].label[lang]}
                    {!TEST_TYPE_INFO[ty].autoDetectable && <span className="ml-2 text-xs opacity-70">•</span>}
                  </button>
                ))}
              </div>
            </Card>
          );
        })}
        <p className="text-xs text-muted">• {t('test.notAuto')}</p>
      </div>

      <div className="space-y-3">
        {loadVisible && (
          <Card title={t('test.load')}>
            <Field label={t('test.load.kg')} htmlFor="load">
              <input
                id="load"
                data-testid="load-input"
                className="input"
                type="number"
                min={0}
                step={0.5}
                value={wf.externalLoadKg}
                onChange={(e) => {
                  wf.setLoad(Number(e.target.value));
                  live.configure(wf.mode, Number(e.target.value));
                }}
              />
            </Field>
          </Card>
        )}
        {info?.family === 'balance' && (
          <Card title={t('step.testType')}>
            <Toggle
              label={t('test.cond.eyesClosed')}
              checked={!!wf.conditions.eyesClosed}
              onChange={(v) => wf.setConditions({ ...wf.conditions, eyesClosed: v })}
            />
            <Toggle
              label={t('test.cond.unstable')}
              checked={!!wf.conditions.unstableSurface}
              onChange={(v) => wf.setConditions({ ...wf.conditions, unstableSurface: v })}
            />
            <Toggle
              label={t('test.cond.dualTask')}
              checked={!!wf.conditions.dualTask}
              onChange={(v) => wf.setConditions({ ...wf.conditions, dualTask: v })}
            />
          </Card>
        )}
        {info?.family === 'isometric' && wf.mode !== 'auto' && (
          <Banner>{isoPresetFor(wf.mode).hint[lang]}</Banner>
        )}

        <Card title={t('test.tags')}>
          {tagTypes.length === 0 && <p className="mb-2 text-sm text-muted">{t('test.tags.none')}</p>}
          {tagTypes.map((tt) => (
            <div key={tt.id} className="mb-2">
              <div className="mb-1 text-xs font-semibold uppercase text-muted">{tt.name}</div>
              <div className="flex flex-wrap gap-2">
                {tags
                  .filter((x) => x.tagTypeId === tt.id)
                  .map((tag) => (
                    <button
                      key={tag.id}
                      type="button"
                      aria-pressed={wf.tagIds.includes(tag.id)}
                      onClick={() => wf.toggleTag(tag.id)}
                      className={`chip min-h-10 cursor-pointer ${wf.tagIds.includes(tag.id) ? '!border-primary !bg-primary !text-primary-fg' : ''}`}
                    >
                      {tag.name}
                    </button>
                  ))}
              </div>
            </div>
          ))}
          <details className="mt-3">
            <summary className="cursor-pointer text-sm font-medium text-primary">
              {t('test.tags.create')}
            </summary>
            <div className="mt-2 space-y-2">
              <input
                className="input"
                placeholder={t('test.tags.typeName')}
                value={newType}
                onChange={(e) => setNewType(e.target.value)}
                list="tagtypes"
              />
              <datalist id="tagtypes">
                {tagTypes.map((x) => (
                  <option key={x.id} value={x.name} />
                ))}
              </datalist>
              <input
                className="input"
                placeholder={t('test.tags.value')}
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
              />
              <Button onClick={() => void createTag()} disabled={!newType.trim() || !newValue.trim()}>
                {t('common.add')}
              </Button>
            </div>
          </details>
        </Card>

        <Button variant="primary" size="lg" className="w-full" onClick={onNext} data-testid="next-button">
          {t('common.next')} →
        </Button>
      </div>
    </div>
  );
}
