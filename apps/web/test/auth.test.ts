import type { MeDTO } from '@buildr/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, NetworkError, api } from '../src/api/client.ts';
import { localRepo } from '../src/offline/repo.ts';
import { canTest, useAuth } from '../src/state/auth.ts';

const me = (role: MeDTO['role'] = 'tester', id = 'u1'): MeDTO => ({
  id,
  name: 'Tessa',
  email: 't@x.test',
  role,
  groupScope: 'all',
  organization: { id: 'o1', name: 'Org' },
  access: [],
});

describe('Auth-Store', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuth.setState({
      status: 'loading',
      me: null,
      setupRequired: false,
      offline: false,
      cachedSession: false,
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it('init: gültige Sitzung → angemeldet, Identität wird zwischengespeichert', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(me());
    await useAuth.getState().init();
    expect(useAuth.getState()).toMatchObject({ status: 'authenticated', cachedSession: false });
    expect(JSON.parse(localStorage.getItem('buildr.me')!).id).toBe('u1');
  });

  it('init: 401 → anonym; leerer Server → Einrichtungs-Assistent', async () => {
    const get = vi.spyOn(api, 'get');
    get
      .mockRejectedValueOnce(new ApiError(401, 'unauthenticated', null))
      .mockResolvedValueOnce({ setupRequired: true });
    await useAuth.getState().init();
    expect(useAuth.getState()).toMatchObject({ status: 'anonymous', setupRequired: true });
  });

  it('init: Server nicht erreichbar → mit zwischengespeicherter Identität offline weiterarbeiten, sonst Anmeldung', async () => {
    vi.spyOn(api, 'get').mockRejectedValue(new NetworkError());
    await useAuth.getState().init();
    expect(useAuth.getState()).toMatchObject({ status: 'anonymous', offline: true });
    localStorage.setItem('buildr.me', JSON.stringify(me('viewer')));
    await useAuth.getState().init();
    expect(useAuth.getState()).toMatchObject({ status: 'authenticated', cachedSession: true, offline: true });
    expect(useAuth.getState().me?.role).toBe('viewer');
  });

  it('login: Ergebnis-Codes für falsches Passwort, Drosselung, Offline', async () => {
    const post = vi.spyOn(api, 'post');
    post.mockRejectedValueOnce(new ApiError(401, 'invalid_credentials', null));
    expect(await useAuth.getState().login('a@x.test', 'x')).toBe('invalid');
    post.mockRejectedValueOnce(new ApiError(429, 'too_many_attempts', null));
    expect(await useAuth.getState().login('a@x.test', 'x')).toBe('throttled');
    post.mockRejectedValueOnce(new NetworkError());
    expect(await useAuth.getState().login('a@x.test', 'x')).toBe('offline');
    post.mockResolvedValueOnce(me());
    expect(await useAuth.getState().login('a@x.test', 'x')).toBe('ok');
    expect(useAuth.getState().status).toBe('authenticated');
  });

  it('Kontowechsel auf demselben Gerät leert die Zwischenspeicher (keine Fremddaten)', async () => {
    const wipe = vi.spyOn(localRepo, 'wipeCaches').mockResolvedValue();
    vi.spyOn(api, 'post').mockResolvedValue(me('tester', 'u1'));
    await useAuth.getState().login('a@x.test', 'x');
    expect(wipe).not.toHaveBeenCalled();
    vi.spyOn(api, 'post').mockResolvedValue(me('tester', 'u2'));
    await useAuth.getState().login('b@x.test', 'x');
    expect(wipe).toHaveBeenCalledTimes(1);
  });

  it('logout: Zwischenspeicher leeren, Identität vergessen – auch wenn der Server nicht erreichbar ist', async () => {
    const wipe = vi.spyOn(localRepo, 'wipeCaches').mockResolvedValue();
    vi.spyOn(api, 'post').mockResolvedValueOnce(me());
    await useAuth.getState().login('a@x.test', 'x');
    vi.spyOn(api, 'post').mockRejectedValueOnce(new NetworkError());
    await useAuth.getState().logout();
    expect(wipe).toHaveBeenCalled();
    expect(useAuth.getState()).toMatchObject({ status: 'anonymous', me: null });
    expect(localStorage.getItem('buildr.me')).toBeNull();
  });

  it('lokaler Modus und Rollen: Viewer darf keine Tests aufnehmen', async () => {
    useAuth.getState().continueLocal();
    expect(useAuth.getState().status).toBe('local');
    expect(canTest(useAuth.getState())).toBe(true);
    expect(canTest({ status: 'authenticated', me: me('viewer') })).toBe(false);
    expect(canTest({ status: 'authenticated', me: me('tester') })).toBe(true);
    expect(canTest({ status: 'authenticated', me: me('admin') })).toBe(true);
    expect(canTest({ status: 'anonymous', me: null })).toBe(false);
  });
});
