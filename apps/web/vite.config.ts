import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const apiTarget = process.env.BUILDR_API ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
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
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        // Referenz-Demodaten nur bei Bedarf laden (nicht vorab cachen)
        globIgnores: ['**/forcedecks_*'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
    }),
  ],
  server: { port: 5173, host: true, proxy: { '/api': { target: apiTarget, changeOrigin: false } } },
  preview: { port: 4173, host: true, proxy: { '/api': { target: apiTarget, changeOrigin: false } } },
  worker: { format: 'es' },
  build: { sourcemap: true, target: 'es2022' },
});
