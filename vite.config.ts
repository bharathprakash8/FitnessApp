import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Icons are generated from public/icon.svg (see pwa-assets.config.ts).
      pwaAssets: { config: true, overrideManifestIcons: true },
      manifest: {
        name: 'FitCoach',
        short_name: 'FitCoach',
        description: 'Your private fitness coaching app',
        lang: 'en-IN',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#0e9f6e',
        background_color: '#ffffff',
      },
      workbox: {
        navigateFallback: '/index.html',
        // Real pages that must not be replaced by the app shell.
        navigateFallbackDenylist: [/^\/privacy\.html$/],
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
      },
    }),
  ],
  server: { port: 5173, strictPort: true },
});
