import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';

/** Speicher für Roh-Aufnahmen. Austauschbar (Dateisystem, S3-kompatibel, …); Schlüssel sind pfadartig und nie nutzergesteuert. */
export interface BlobStore {
  put(key: string, data: Uint8Array): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

export class FileBlobStore implements BlobStore {
  private readonly root: string;
  constructor(root: string) {
    this.root = resolve(root);
  }
  private path(key: string): string {
    const p = resolve(join(this.root, key));
    if (p !== this.root && !p.startsWith(this.root + sep)) throw new Error('invalid blob key');
    return p;
  }
  async put(key: string, data: Uint8Array): Promise<void> {
    const p = this.path(key);
    await mkdir(dirname(p), { recursive: true });
    // atomar schreiben: erst temporär, dann umbenennen
    const tmp = `${p}.${process.pid}.tmp`;
    await writeFile(tmp, data);
    await rename(tmp, p);
  }
  async get(key: string): Promise<Uint8Array | null> {
    try {
      return new Uint8Array(await readFile(this.path(key)));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw e;
    }
  }
  async delete(key: string): Promise<void> {
    await rm(this.path(key), { force: true });
  }
  async exists(key: string): Promise<boolean> {
    try {
      await stat(this.path(key));
      return true;
    } catch {
      return false;
    }
  }
}

export class MemoryBlobStore implements BlobStore {
  readonly map = new Map<string, Uint8Array>();
  async put(key: string, data: Uint8Array): Promise<void> {
    this.map.set(key, data.slice());
  }
  async get(key: string): Promise<Uint8Array | null> {
    return this.map.get(key)?.slice() ?? null;
  }
  async delete(key: string): Promise<void> {
    this.map.delete(key);
  }
  async exists(key: string): Promise<boolean> {
    return this.map.has(key);
  }
}
