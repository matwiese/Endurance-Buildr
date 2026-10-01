import type { DeviceAdapter } from '@buildr/device';

/**
 * Registrierung eigener Messplatten-Treiber. Eine Fabrik erzeugt bei „Verbinden“ einen `DeviceAdapter`
 * (z. B. `WebSocketAdapter` + eigener `FrameDecoder`). Registrierte Quellen erscheinen im Schritt „Verbinden“;
 * der Rest der App (Jitterbuffer, Analyse, Speicherung) bleibt unverändert. Siehe docs/hardware-adapters.md.
 */
export interface AdapterFactory {
  /** stabile Kennung (Test-ID/Speicherung), z. B. 'acme-ws' */
  id: string;
  /** Anzeigename im Verbinden-Schritt */
  label: string;
  /** Zusatzzeile unter dem Namen */
  description?: string;
  /** Wird bei jedem Verbinden aufgerufen (nach Nutzergeste – WebSerial/WebBluetooth benötigen das). */
  create: () => DeviceAdapter | Promise<DeviceAdapter>;
}

const factories = new Map<string, AdapterFactory>();
const listeners = new Set<() => void>();

export function registerAdapter(f: AdapterFactory): void {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(f.id)) throw new Error(`Ungültige Adapter-Kennung: ${f.id}`);
  if (factories.has(f.id)) throw new Error(`Adapter „${f.id}“ ist bereits registriert`);
  factories.set(f.id, f);
  for (const l of listeners) l();
}

export function listAdapters(): AdapterFactory[] {
  return [...factories.values()];
}

export function getAdapter(id: string): AdapterFactory | undefined {
  return factories.get(id);
}

export function subscribeAdapters(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** nur für Tests */
export function resetAdapters(): void {
  factories.clear();
  for (const l of listeners) l();
}
