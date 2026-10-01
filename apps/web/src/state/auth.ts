import type { MeDTO, SetupInput } from '@buildr/shared';
import { create } from 'zustand';
import { ApiError, NetworkError, api } from '../api/client.ts';
import { localRepo } from '../offline/repo.ts';

export type AuthStatus = 'loading' | 'anonymous' | 'authenticated' | 'local';
export type AuthResult = 'ok' | 'invalid' | 'throttled' | 'offline' | 'weak_password' | 'exists' | 'error';

const ME_KEY = 'buildr.me';
const LOCAL_KEY = 'buildr.localMode';
const LAST_USER_KEY = 'buildr.lastUser';

const read = <T>(key: string): T | null => {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
};
const write = (key: string, v: unknown | null): void => {
  try {
    if (v === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* Speicher gesperrt */
  }
};

interface AuthStore {
  status: AuthStatus;
  me: MeDTO | null;
  setupRequired: boolean;
  /** Server war beim Start nicht erreichbar */
  offline: boolean;
  /** Sitzung stammt aus dem Zwischenspeicher (Server nicht erreichbar) */
  cachedSession: boolean;
  init: () => Promise<void>;
  login: (email: string, password: string) => Promise<AuthResult>;
  setup: (input: SetupInput) => Promise<AuthResult>;
  logout: () => Promise<void>;
  /** Sitzung ist serverseitig abgelaufen (z. B. 401 im Sync) */
  sessionLost: () => void;
  continueLocal: () => void;
  /** Lokalen Modus verlassen → Anmeldung am Server */
  leaveLocal: () => Promise<void>;
}

async function adoptUser(me: MeDTO): Promise<void> {
  // Anderes Konto auf demselben Gerät: Zwischenspeicher leeren (keine Fremddaten anzeigen)
  const last = read<string>(LAST_USER_KEY);
  if (last && last !== me.id) await localRepo.wipeCaches();
  write(LAST_USER_KEY, me.id);
  write(ME_KEY, me);
}

export const useAuth = create<AuthStore>((set, get) => ({
  status: 'loading',
  me: null,
  setupRequired: false,
  offline: false,
  cachedSession: false,

  init: async () => {
    if (read<boolean>(LOCAL_KEY)) {
      set({ status: 'local', me: null });
      return;
    }
    try {
      const me = await api.get<MeDTO>('/api/auth/me');
      await adoptUser(me);
      set({ status: 'authenticated', me, offline: false, cachedSession: false });
    } catch (e) {
      if (e instanceof NetworkError) {
        const cached = read<MeDTO>(ME_KEY);
        if (cached) set({ status: 'authenticated', me: cached, offline: true, cachedSession: true });
        else set({ status: 'anonymous', me: null, offline: true });
        return;
      }
      let setupRequired = false;
      try {
        setupRequired = (await api.get<{ setupRequired: boolean }>('/api/auth/status')).setupRequired;
      } catch {
        /* ignorieren */
      }
      set({ status: 'anonymous', me: null, setupRequired, offline: false, cachedSession: false });
    }
  },

  login: async (email, password) => {
    try {
      const me = await api.post<MeDTO>('/api/auth/login', { email, password });
      await adoptUser(me);
      write(LOCAL_KEY, null);
      set({ status: 'authenticated', me, offline: false, cachedSession: false, setupRequired: false });
      return 'ok';
    } catch (e) {
      if (e instanceof NetworkError) return 'offline';
      if (e instanceof ApiError)
        return e.status === 429 ? 'throttled' : e.status === 401 ? 'invalid' : 'error';
      return 'error';
    }
  },

  setup: async (input) => {
    try {
      await api.post('/api/auth/setup', input);
      const me = await api.get<MeDTO>('/api/auth/me');
      await adoptUser(me);
      set({ status: 'authenticated', me, setupRequired: false, offline: false, cachedSession: false });
      return 'ok';
    } catch (e) {
      if (e instanceof NetworkError) return 'offline';
      if (e instanceof ApiError) {
        if (e.code === 'password_too_short') return 'weak_password';
        if (e.code === 'already_set_up') return 'exists';
      }
      return 'error';
    }
  },

  logout: async () => {
    try {
      await api.post('/api/auth/logout');
    } catch {
      /* offline: Cookie bleibt serverseitig bis zum Ablauf – lokal trotzdem abmelden */
    }
    write(ME_KEY, null);
    write(LAST_USER_KEY, null);
    await localRepo.wipeCaches();
    set({ status: 'anonymous', me: null, cachedSession: false });
  },

  sessionLost: () => {
    write(ME_KEY, null);
    set({ status: 'anonymous', me: null, cachedSession: false });
  },

  continueLocal: () => {
    write(LOCAL_KEY, true);
    set({ status: 'local', me: null });
  },

  leaveLocal: async () => {
    write(LOCAL_KEY, null);
    set({ status: 'loading' });
    await get().init();
  },
}));

/** Darf der Nutzer Tests aufnehmen/Profile ändern? (lokaler Modus: ja) */
export const canTest = (s: Pick<AuthStore, 'status' | 'me'>): boolean =>
  s.status === 'local' || (s.status === 'authenticated' && s.me?.role !== 'viewer');

export type EffectiveRole = 'admin' | 'tester' | 'viewer';

/** Wirksame Rolle (lokaler Modus: volle Rechte auf den lokalen Daten; nicht angemeldet: nur lesen). */
export const effectiveRole = (s: Pick<AuthStore, 'status' | 'me'>): EffectiveRole =>
  s.status === 'local' ? 'admin' : s.status === 'authenticated' && s.me ? s.me.role : 'viewer';

export const useRole = (): EffectiveRole => useAuth(effectiveRole);
