import type { SessionDTO } from '@buildr/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ConsentCard } from '../components/ConsentCard.tsx';
import { StatusBar } from '../components/StatusBar.tsx';
import { StepBar } from '../components/StepBar.tsx';
import { Banner, Button, Card, Chip, Modal } from '../components/ui.tsx';
import { useT } from '../i18n/hooks.ts';
import type { MessageKey } from '../i18n/index.ts';
import { localRepo } from '../offline/repo.ts';
import { StepConnect } from '../pages/test/StepConnect.tsx';
import { StepRecord } from '../pages/test/StepRecord.tsx';
import { StepReview } from '../pages/test/StepReview.tsx';
import { StepSave } from '../pages/test/StepSave.tsx';
import { StepWeigh } from '../pages/test/StepWeigh.tsx';
import { StepZero } from '../pages/test/StepZero.tsx';
import { useWorkflowEffects } from '../pages/test/useWorkflowEffects.ts';
import { useLive } from '../state/live.ts';
import { useWorkflow, type StepId } from '../state/workflow.ts';
import { simAthleteFor } from './demo.ts';
import { Leaderboard } from './Leaderboard.tsx';
import { QueuePanel, type QueueActions } from './QueuePanel.tsx';
import {
  addToQueue,
  moveInQueue,
  nextWaiting,
  progress,
  removeFromQueue,
  setQueueStatus,
  withBoard,
  withStatus,
} from './queue.ts';
import { saveSession } from './service.ts';
import { SessionSummary } from './SessionSummary.tsx';
import { useSessionData } from './useSessionData.ts';

const ATHLETE_STEPS: StepId[] = ['weigh', 'record', 'review', 'save'];

/**
 * Gruppentest: Gerät einmal verbinden und nullen, dann Athlet für Athlet wiegen → aufnehmen → prüfen → speichern.
 * Warteschlange (umsortieren, hinzufügen, überspringen, erneut testen), Zwischenstand bei Pause und live aktualisierte Rangliste.
 */
export function SessionRunner({ simSpeed = 1 }: { simSpeed?: number }) {
  const { id = '' } = useParams();
  const { t } = useT();
  const navigate = useNavigate();
  const data = useSessionData(id);
  const session = data.session;
  const wf = useWorkflow();
  const live = useLive();
  const [summary, setSummary] = useState<'pause' | 'finish' | null>(null);
  const [rezero, setRezero] = useState(false);
  const [allProfiles, setAllProfiles] = useState(() => [...data.profiles.values()]);
  const autoStarted = useRef<string | null>(null);

  useEffect(() => setAllProfiles([...data.profiles.values()]), [data.profiles]);
  useWorkflowEffects({ onConnectionLost: () => undefined });

  const setupReady = live.connection === 'connected' && live.zero.ok === true;
  const current = session?.queue.find((q) => q.status === 'testing');
  // Athlet, der gerade im Ablauf (wiegen … speichern) steht – auch nach dem Speichern, bis „Nächster“/„Erneut“ gewählt wird
  const flowProfile =
    session &&
    wf.sessionId === session.id &&
    wf.profile &&
    session.queue.some((q) => q.profileId === wf.profile!.id) &&
    ATHLETE_STEPS.includes(wf.step)
      ? wf.profile
      : null;
  const recording = live.phase === 'recording' || live.phase === 'paused';

  /** Immer auf dem zuletzt gespeicherten Stand arbeiten (Zustand der Seite hinkt asynchron hinterher). */
  const mutate = useCallback(
    async (fn: (s: SessionDTO) => SessionDTO): Promise<SessionDTO | null> => {
      const latest = await localRepo.sessions.get(id);
      if (!latest) return null;
      const next = fn(latest);
      if (next !== latest) await saveSession(next);
      return next;
    },
    [id],
  );

  const startAthlete = useCallback(
    async (profileId: string) => {
      const s = await localRepo.sessions.get(id);
      const p = await localRepo.profiles.get(profileId);
      if (!s || !p) return;
      live.resetRecordingState();
      wf.resetForNextTest();
      wf.setMode(s.mode);
      wf.setLoad(s.externalLoadKg);
      wf.setSession(s.id);
      wf.setProfile(p);
      live.configure(s.mode, s.externalLoadKg);
      // Simulator: der nächste simulierte Athlet tritt von der Platte und bekommt eigene Masse/Fähigkeit
      const sim = useLive.getState().simulator;
      if (sim) {
        const a = simAthleteFor(p);
        sim.stepOff();
        sim.setAthlete({ bodyMass: a.bodyMass, asymmetry: a.asymmetry });
        useLive.getState().setSimAbility(a.abilityM);
      }
      wf.setStep('weigh');
      await mutate((x) => setQueueStatus(x, profileId, 'testing'));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Store-Aktionen sind stabil
    [id, mutate],
  );

  // Session öffnen: Einstellungen der Session übernehmen (Gerätewahl, Last), alten Einzeltest-Zustand verwerfen
  useEffect(() => {
    if (!session) return;
    const st = useWorkflow.getState();
    if (st.sessionId === session.id) return;
    st.resetForNextTest();
    st.setProfile(null);
    st.setSession(session.id);
    st.setMode(session.mode);
    st.setLoad(session.externalLoadKg);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nur beim Öffnen einer anderen Session
  }, [session?.id]);

  // Erster Athlet startet automatisch, sobald Gerät verbunden und genullt ist, nach „Fortsetzen“ und nach einem Neuladen
  useEffect(() => {
    if (!session || session.status !== 'active' || !setupReady || flowProfile || wf.sessionId !== session.id)
      return;
    const target = current ?? nextWaiting(session);
    if (!target) return;
    const key = `${session.id}:${target.profileId}`;
    if (autoStarted.current === key) return;
    autoStarted.current = key;
    void startAthlete(target.profileId);
  }, [session, setupReady, current, flowProfile, wf.sessionId, startAthlete]);

  // gespeichert → Athlet gilt als fertig
  useEffect(() => {
    if (wf.saved.length > 0 && current && current.status === 'testing') {
      void mutate((s) => setQueueStatus(s, current.profileId, 'done'));
    }
  }, [wf.saved.length, current, mutate]);

  const actions: QueueActions = useMemo(
    () => ({
      start: (pid) => void startAthlete(pid),
      move: (pid, dir) => void mutate((s) => moveInQueue(s, pid, dir)),
      remove: (pid) => void mutate((s) => removeFromQueue(s, pid)),
      skip: (pid) => void mutate((s) => setQueueStatus(s, pid, 'skipped')),
      requeue: (pid) => void mutate((s) => setQueueStatus(s, pid, 'waiting')),
      add: (pid) => void mutate((s) => addToQueue(s, [pid])),
    }),
    [mutate, startAthlete],
  );

  if (!data.loaded) return <div className="p-8 text-center text-muted">…</div>;
  if (!session) {
    return (
      <div className="mx-auto max-w-xl p-4">
        <Banner tone="warn">{t('session.notFound')}</Banner>
        <Link to="/session" className="btn">
          {t('session.back')}
        </Link>
      </div>
    );
  }

  const idx = ATHLETE_STEPS.indexOf(wf.step);
  const done = new Set<StepId>(idx > 0 ? ATHLETE_STEPS.slice(0, idx) : []);
  const prog = progress(session);
  const next = () => wf.setStep(ATHLETE_STEPS[Math.min(ATHLETE_STEPS.length - 1, Math.max(0, idx) + 1)]!);
  const nextAthlete = async () => {
    const s = (await localRepo.sessions.get(id)) ?? session;
    const nxt = nextWaiting(s, flowProfile?.id ?? current?.profileId);
    live.resetRecordingState();
    if (nxt) await startAthlete(nxt.profileId);
    else {
      wf.resetForNextTest();
      wf.setProfile(null);
    }
  };
  const retest = async () => {
    if (flowProfile) await startAthlete(flowProfile.id);
  };
  const waitingLeft = session.queue.some((q) => q.status === 'waiting');
  const finished = session.status === 'finished';
  const paused = session.status === 'paused';
  const profile = flowProfile ?? undefined;

  return (
    <div
      className="mx-auto flex w-full max-w-[1700px] flex-col gap-3 p-3 sm:p-4"
      data-testid="session-runner"
      data-status={session.status}
      data-step={wf.step}
    >
      <header className="flex flex-wrap items-center gap-3">
        <Link to="/session" className="btn btn-sm" data-testid="session-back">
          ← {t('session.back')}
        </Link>
        <h1 className="text-xl font-extrabold" data-testid="session-name">
          {session.name}
        </h1>
        <Chip tone={finished ? 'default' : paused ? 'warn' : 'ok'}>
          {t(`session.status.${session.status}` as MessageKey)}
        </Chip>
        <span className="text-sm text-muted" data-testid="session-progress">
          {t('session.summary.done', { done: prog.done, total: prog.total })}
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() =>
              window.open(`/session/${session.id}/board`, 'buildr-board', 'popup,width=1280,height=800')
            }
            data-testid="board-window"
          >
            ⧉ {t('session.board.window')}
          </Button>
          <Button
            size="sm"
            onClick={() => navigate(`/session/${session.id}/board`)}
            data-testid="board-fullscreen"
          >
            ⛶ {t('session.board.fullscreen')}
          </Button>
          {!finished && setupReady && (
            <Button
              size="sm"
              disabled={recording}
              onClick={() => setRezero(true)}
              data-testid="session-rezero"
            >
              ⟲ {t('session.rezero')}
            </Button>
          )}
          {session.status === 'active' && (
            <>
              <Button
                size="sm"
                disabled={recording}
                onClick={async () => {
                  await mutate((s) => withStatus(s, 'paused'));
                  setSummary('pause');
                }}
                data-testid="session-pause"
              >
                ⏸ {t('session.pause')}
              </Button>
              <Button
                size="sm"
                variant="danger"
                disabled={recording}
                onClick={async () => {
                  await mutate((s) => withStatus(s, 'finished'));
                  setSummary('finish');
                }}
                data-testid="session-finish"
              >
                ■ {t('session.finish')}
              </Button>
            </>
          )}
          {paused && (
            <Button
              size="sm"
              variant="primary"
              onClick={() => void mutate((s) => withStatus(s, 'active'))}
              data-testid="session-resume"
            >
              ▶ {t('session.resume')}
            </Button>
          )}
        </div>
      </header>

      <StatusBar />

      {!setupReady ? (
        <Card title={t('session.setup.zero')}>
          {live.connection !== 'connected' ? (
            <StepConnect onConnected={() => undefined} />
          ) : (
            <StepZero sessionMode onNext={() => undefined} />
          )}
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[320px_1fr] 2xl:grid-cols-[340px_1fr_420px]">
          <QueuePanel
            session={session}
            profiles={data.profiles}
            allProfiles={allProfiles}
            tests={data.tests}
            busy={recording}
            actions={actions}
          />

          <div className="grid min-w-0 content-start gap-3">
            {finished ? (
              <Banner tone="ok">{t('session.finished.title')}</Banner>
            ) : !profile ? (
              <Card>
                <p className="text-lg" data-testid="session-idle">
                  {waitingLeft ? t('session.choose') : t('session.noneLeft')}
                </p>
              </Card>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-3" data-testid="session-current">
                  <span className="text-lg font-bold">{t('session.current', { name: profile.name })}</span>
                </div>
                <StepBar
                  steps={ATHLETE_STEPS}
                  current={wf.step}
                  done={done}
                  onSelect={(s) => wf.setStep(s)}
                  compact
                />
                {!profile.healthConsentAt && (
                  <ConsentCard profile={profile} onGranted={(p) => wf.setProfile(p)} />
                )}
                <section aria-label={t(`step.${wf.step}` as MessageKey)} hidden={!profile.healthConsentAt}>
                  {wf.step === 'weigh' && <StepWeigh onNext={next} />}
                  {wf.step === 'record' && <StepRecord simSpeed={simSpeed} />}
                  {wf.step === 'review' && <StepReview onNext={next} onAgain={() => wf.setStep('record')} />}
                  {wf.step === 'save' && (
                    <StepSave
                      labels={{ same: t('session.save.retest'), other: t('session.save.next') }}
                      onNextSameAthlete={() => void retest()}
                      onNewAthlete={() => void nextAthlete()}
                    />
                  )}
                </section>
              </>
            )}
          </div>

          <Card title={t('board.title')} className="lg:col-span-2 2xl:col-span-1">
            <Leaderboard
              session={session}
              profiles={data.profiles}
              tests={data.tests}
              currentProfileId={flowProfile?.id ?? current?.profileId}
              onBoardChange={(b) => void mutate((s) => withBoard(s, b))}
            />
          </Card>
        </div>
      )}

      {rezero && (
        <Modal title={t('session.rezero')} onClose={() => setRezero(false)} wide>
          <StepZero sessionMode onNext={() => setRezero(false)} />
        </Modal>
      )}
      {summary && (
        <SessionSummary
          session={session}
          profiles={data.profiles}
          tests={data.tests}
          variant={summary}
          onClose={() => setSummary(null)}
          actions={
            summary === 'pause' ? (
              <Button
                variant="primary"
                onClick={async () => {
                  await mutate((s) => withStatus(s, 'active'));
                  setSummary(null);
                }}
                data-testid="summary-resume"
              >
                ▶ {t('session.resume')}
              </Button>
            ) : undefined
          }
        />
      )}
    </div>
  );
}
