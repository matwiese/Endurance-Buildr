import type { StepId } from '../state/workflow.ts';
import { useT } from '../i18n/hooks.ts';

interface Props {
  steps: StepId[];
  current: StepId;
  /** Schritte, die bereits erledigt sind (anklickbar zum Zurückspringen) */
  done: ReadonlySet<StepId>;
  onSelect: (s: StepId) => void;
}

/** Sichtbare Schrittleiste des linearen Test-Workflows (große Touch-Ziele, Tastatur-bedienbar). */
export function StepBar({ steps, current, done, onSelect }: Props) {
  const { t } = useT();
  return (
    <nav aria-label="Workflow" className="w-full overflow-x-auto">
      <ol className="flex min-w-max items-stretch gap-2">
        {steps.map((s, i) => {
          const isCur = s === current;
          const isDone = done.has(s);
          const enabled = isDone || isCur;
          return (
            <li key={s} className="flex-1">
              <button
                type="button"
                data-testid={`step-${s}`}
                aria-current={isCur ? 'step' : undefined}
                disabled={!enabled}
                onClick={() => onSelect(s)}
                className={`flex min-h-14 w-full items-center gap-2 rounded-xl border px-3 py-2 text-left transition ${
                  isCur
                    ? 'border-primary bg-primary text-primary-fg'
                    : isDone
                      ? 'border-ok bg-surface text-text hover:bg-surface2'
                      : 'border-line bg-surface text-muted opacity-70'
                }`}
              >
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${isCur ? 'bg-primary-fg text-primary' : isDone ? 'bg-ok text-white' : 'bg-surface2'}`}
                >
                  {isDone && !isCur ? '✓' : i + 1}
                </span>
                <span className="text-sm font-semibold sm:text-base">{t(`step.${s}` as 'step.connect')}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
