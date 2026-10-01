import { readFileSync } from 'node:fs';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const apiTarget = process.env.BUILDR_API ?? 'http://localhost:3000';

/** Zerlegt eine CSV-Zeile (Anführungszeichen, Dezimalkomma in Feldern). */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === ',' && !quoted) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/**
 * Demo-Aufnahmen (`reference/*.csv?demo`) werden beim Bündeln auf Zeit/Links/Rechts, Gewicht und Frequenz reduziert:
 * Personen-Kennung, Geräteseriennummern, Exporter-Kennung und Herstellerspalten gelangen nicht in die ausgelieferte App.
 */
function demoRecordings(): Plugin {
  return {
    name: 'buildr-demo-recordings',
    enforce: 'pre',
    load(id) {
      if (!/[\\/]reference[\\/][^\\/]+\.csv\?demo$/.test(id)) return null;
      const lines = readFileSync(id.replace(/\?demo$/, ''), 'utf8')
        .replace(/^\uFEFF/, '')
        .split(/\r?\n/);
      const meta = new Map<string, string>();
      let header = -1;
      for (let i = 0; i < lines.length; i++) {
        const cells = splitCsvLine(lines[i]!);
        if (cells.map((c) => c.trim().toLowerCase()).includes('left')) {
          header = i;
          break;
        }
        if (cells.length >= 2 && cells[0]) meta.set(cells[0].trim(), cells[1]!.trim());
      }
      if (header < 0) throw new Error(`Demo-Aufnahme ohne Kraftspalten: ${id}`);
      const q = (v: string): string => (v.includes(',') ? `"${v}"` : v);
      const out = ['Buildr Demo Recording,1.0'];
      for (const k of ['Weight', 'Frequency']) if (meta.has(k)) out.push(`${k},${q(meta.get(k)!)}`);
      out.push('', 'Time,Left,Right');
      for (const line of lines.slice(header + 1)) {
        if (!line.trim()) continue;
        const c = splitCsvLine(line);
        out.push([c[0], c[1], c[2]].map((v) => q(v ?? '')).join(','));
      }
      return `export default ${JSON.stringify(out.join('\n'))};`;
    },
  };
}

export default defineConfig({
  plugins: [
    demoRecordings(),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Buildr Force',
        short_name: 'Buildr Force',
        description: 'Kraftmessplatten-Testsystem für Sprungdiagnostik',
        lang: 'de',
        theme_color: '#0f2f2d',
        background_color: '#0f2f2d',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Referenz-Demodaten nur bei Bedarf laden (nicht vorab cachen)
        globIgnores: ['**/demo-*'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
    }),
  ],
  server: { port: 5173, host: true, proxy: { '/api': { target: apiTarget, changeOrigin: false } } },
  preview: { port: 4173, host: true, proxy: { '/api': { target: apiTarget, changeOrigin: false } } },
  worker: { format: 'es' },
  build: {
    // Karten für Fehlersuche liegen im Build, werden aber nicht im Bundle verlinkt
    sourcemap: 'hidden',
    target: 'es2022',
    rollupOptions: {
      output: {
        // Bibliotheken ändern sich selten: eigener Chunk bleibt zwischen App-Updates im Browser-Cache
        manualChunks: (id) =>
          /node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler|@tanstack|zustand|idb)[\\/]/.test(
            id,
          )
            ? 'vendor'
            : undefined,
        // Demo-Aufnahmen bekommen neutrale Dateinamen
        chunkFileNames: (c) => `assets/${c.name.replace(/^forcedecks_/, 'demo-')}-[hash].js`,
      },
    },
  },
});
