import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Our own service worker (src/sw.ts): app-shell caching + push notifications.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
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
    }),
  ],
  server: { port: 5173, strictPort: true },
  build: {
    rolldownOptions: {
      treeshake: {
        // Ionic's component files only register themselves when the app uses them, but the
        // bundler can't tell, so every component (date picker, slider, menu…) was shipped.
        // Treat them as side-effect free so unused ones are dropped.
        moduleSideEffects: (id: string) =>
          !/[\\/]@ionic[\\/]core[\\/]components[\\/]ion-[^\\/]+\.js$/.test(id),
      },
    },
  },
});
