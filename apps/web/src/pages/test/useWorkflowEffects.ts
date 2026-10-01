import { useEffect } from 'react';
import { useLive } from '../../state/live.ts';
import { useWorkflow } from '../../state/workflow.ts';

/**
 * Gemeinsame Seiteneffekte der Schritte (Einzeltest und Gruppentest):
 * Wiegen starten/beenden, Gewicht beim Athletenwechsel verwerfen, Verbindungsverlust melden.
 */
export function useWorkflowEffects(opts: { onConnectionLost: () => void; stepsWithDevice?: string[] }): void {
  const wf = useWorkflow();
  const live = useLive();

  // Beim Betreten des Wiege-Schritts die Stabilitätserkennung starten, beim Verlassen beenden
  useEffect(() => {
    if (wf.step === 'weigh' && live.connection === 'connected') live.startWeigh();
    return () => {
      if (wf.step === 'weigh') useLive.getState().cancelWeigh();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nur beim Schrittwechsel
  }, [wf.step]);

  // Athletenwechsel: das gewogene Gewicht gehört zum vorherigen Athleten
  const profileId = wf.profile?.id ?? (wf.guest ? 'guest' : null);
  useEffect(() => {
    const st = useLive.getState();
    if (st.massSource === 'weighed' || st.massSource === 'estimated') st.setMass(null);
  }, [profileId]);

  // Verbindung verloren (Daten im Review bleiben erhalten)
  useEffect(() => {
    if (
      live.connection !== 'connected' &&
      (opts.stepsWithDevice ?? ['zero', 'weigh', 'record']).includes(wf.step) &&
      live.engine === null
    )
      opts.onConnectionLost();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nur bei Verbindungswechsel
  }, [live.connection, live.engine]);
}
