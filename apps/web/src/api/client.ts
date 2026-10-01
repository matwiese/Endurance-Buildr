/** Typisierter fetch-Wrapper für die Buildr-Force-API (Cookie-Sitzung, gleicher Ursprung bzw. Vite-Proxy). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly body: unknown,
  ) {
    super(`${status} ${code}`);
  }
}

/** Server nicht erreichbar (offline, DNS, Timeout, Abbruch). */
export class NetworkError extends Error {
  constructor(cause?: unknown) {
    super('network');
    this.cause = cause;
  }
}

export interface ApiOptions {
  base?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export interface Api {
  get<T>(path: string): Promise<T>;
  put<T>(path: string, body?: unknown): Promise<T>;
  post<T>(path: string, body?: unknown): Promise<T>;
  patch<T>(path: string, body?: unknown): Promise<T>;
  del(path: string): Promise<void>;
  putBlob<T>(path: string, bytes: Uint8Array, headers?: Record<string, string>): Promise<T>;
  getBlob(path: string): Promise<Uint8Array>;
}

export function createApi(opts: ApiOptions = {}): Api {
  const base = opts.base ?? '';
  const f = (...a: Parameters<typeof fetch>) => (opts.fetch ?? globalThis.fetch.bind(globalThis))(...a);
  const timeout = opts.timeoutMs ?? 20_000;

  async function raw(
    method: string,
    path: string,
    init: { body?: BodyInit; headers?: Record<string, string> },
    ms = timeout,
  ): Promise<Response> {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), ms);
    let res: Response;
    try {
      res = await f(`${base}${path}`, { method, credentials: 'same-origin', signal: ctl.signal, ...init });
    } catch (e) {
      throw new NetworkError(e);
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      let body: unknown = null;
      try {
        body = await res.json();
      } catch {
        /* kein JSON */
      }
      const code = (body as { error?: string } | null)?.error ?? `http_${res.status}`;
      throw new ApiError(res.status, code, body);
    }
    return res;
  }

  const json = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
    const res = await raw(method, path, {
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
    });
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  };

  return {
    get: (p) => json('GET', p),
    put: (p, b) => json('PUT', p, b),
    post: (p, b) => json('POST', p, b),
    patch: (p, b) => json('PATCH', p, b),
    del: async (p) => {
      await raw('DELETE', p, {});
    },
    putBlob: async <T>(path: string, bytes: Uint8Array, headers: Record<string, string> = {}) => {
      const res = await raw(
        'PUT',
        path,
        {
          body: bytes as unknown as BodyInit,
          headers: { 'content-type': 'application/octet-stream', ...headers },
        },
        120_000,
      );
      return (await res.json()) as T;
    },
    getBlob: async (p) => new Uint8Array(await (await raw('GET', p, {}, 120_000)).arrayBuffer()),
  };
}

export const api: Api = createApi();
