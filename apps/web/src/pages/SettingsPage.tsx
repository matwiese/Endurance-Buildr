import { TEST_TYPES, TEST_TYPE_INFO, metricsForFamily, type TestType } from '@buildr/core';
import { useState } from 'react';
import { Button, Card, Field, Toggle } from '../components/ui.tsx';
import { useT } from '../i18n/hooks.ts';
import { tilesFor, useSettings } from '../state/settings.ts';

export function SettingsPage() {
  const { t, lang } = useT();
  const s = useSettings();
  const [tileType, setTileType] = useState<TestType>('cmj');
  const keys = metricsForFamily(TEST_TYPE_INFO[tileType].family);
  const active = tilesFor(s, tileType);
  const toggle = (k: string) =>
    s.setTiles(tileType, active.includes(k) ? active.filter((x) => x !== k) : [...active, k]);

  return (
    <div className="mx-auto grid max-w-5xl gap-4 p-4">
      <h1 className="text-2xl font-bold">{t('settings.title')}</h1>
      <Card>
        <div className="grid gap-x-6 sm:grid-cols-3">
          <Field label={t('settings.language')} htmlFor="lang">
            <select
              id="lang"
              className="input"
              value={s.lang}
              onChange={(e) => s.set({ lang: e.target.value as 'de' | 'en' })}
            >
              <option value="de">Deutsch</option>
              <option value="en">English</option>
            </select>
          </Field>
          <Field label={t('settings.units')} htmlFor="units">
            <select
              id="units"
              className="input"
              value={s.unitSystem}
              onChange={(e) => s.set({ unitSystem: e.target.value as 'metric' | 'imperial' })}
            >
              <option value="metric">{t('settings.units.metric')}</option>
              <option value="imperial">{t('settings.units.imperial')}</option>
            </select>
          </Field>
          <Field label={t('settings.theme')} htmlFor="theme">
            <select
              id="theme"
              className="input"
              value={s.theme}
              onChange={(e) => s.set({ theme: e.target.value as 'dark' | 'light' })}
            >
              <option value="dark">{t('settings.theme.dark')}</option>
              <option value="light">{t('settings.theme.light')}</option>
            </select>
          </Field>
        </div>
      </Card>

      <Card title={t('settings.analysis')}>
        <div className="grid gap-x-6 sm:grid-cols-3">
          <Field label={t('settings.onset')} htmlFor="onset">
            <select
              id="onset"
              className="input"
              value={s.isoOnset}
              onChange={(e) => s.set({ isoOnset: e.target.value as 'yank' | 'sd5' })}
            >
              <option value="yank">{t('settings.onset.yank')}</option>
              <option value="sd5">{t('settings.onset.sd5')}</option>
            </select>
          </Field>
          <Field label={t('settings.hopBestN')} htmlFor="hopn">
            <input
              id="hopn"
              className="input"
              type="number"
              min={0}
              max={20}
              value={s.hopBestN}
              onChange={(e) => s.set({ hopBestN: Number(e.target.value) })}
            />
          </Field>
          <Field label={t('settings.plotWindow')} htmlFor="pw">
            <input
              id="pw"
              className="input"
              type="number"
              min={3}
              max={30}
              value={s.plotWindowS}
              onChange={(e) => s.set({ plotWindowS: Number(e.target.value) })}
            />
          </Field>
          <Field label={t('settings.hz')} htmlFor="hz">
            <select
              id="hz"
              className="input"
              value={s.defaultHz}
              onChange={(e) => s.set({ defaultHz: Number(e.target.value) as 200 | 500 | 1000 })}
            >
              {[200, 500, 1000].map((h) => (
                <option key={h} value={h}>
                  {h} Hz
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Toggle
          label={t('settings.takeoffCorrection')}
          checked={s.takeoffCorrection}
          onChange={(v) => s.set({ takeoffCorrection: v })}
        />
      </Card>

      <Card
        title={t('settings.tiles')}
        actions={
          <Button size="sm" onClick={() => s.resetTiles(tileType)}>
            {t('settings.tiles.reset')}
          </Button>
        }
      >
        <Field label={t('step.testType')} htmlFor="tiletype">
          <select
            id="tiletype"
            className="input max-w-md"
            value={tileType}
            onChange={(e) => setTileType(e.target.value as TestType)}
          >
            {TEST_TYPES.map((ty) => (
              <option key={ty} value={ty}>
                {TEST_TYPE_INFO[ty].label[lang]}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid gap-x-6 sm:grid-cols-2 xl:grid-cols-3">
          {keys.map((m) => (
            <Toggle
              key={m.key}
              label={`${m.label[lang]} (${m.unit || '–'})`}
              checked={active.includes(m.key)}
              onChange={() => toggle(m.key)}
            />
          ))}
        </div>
      </Card>
    </div>
  );
}
