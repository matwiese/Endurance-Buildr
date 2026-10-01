import type { MessageKey } from '../i18n/index.ts';
import type { RefResult } from './services.ts';

/** Meldungsschlüssel zu einem Stammdaten-Ergebnis (null = alles gut). */
export function refMessage(r: RefResult): MessageKey | null {
  switch (r) {
    case 'ok':
      return null;
    case 'offline':
      return 'common.error.offline';
    case 'forbidden':
      return 'common.error.forbidden';
    case 'invalid':
      return 'common.error.invalid';
    default:
      return 'common.error';
  }
}
