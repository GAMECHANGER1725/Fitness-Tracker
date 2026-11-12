import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages serves the app at https://<user>.github.io/<repo>/. The deploy workflow sets BASE_PATH.
// Same origin as Fuel Log (/fuel-log/), which is how this app can read Fuel Log's data on the same phone.
const BASE_PATH = process.env.BASE_PATH ?? '/Fitness-Tracker/';

export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? BASE_PATH : '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'icon.svg'],
      manifest: {
        name: 'Fitness Tracker',
        short_name: 'Fitness',
        description: 'Home workouts, wake-up and sleep tracker with an AI coach, linked to Fuel Log.',
        theme_color: '#0C1013',
        background_color: '#0C1013',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: { importScripts: ['sw-extra.js'], globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'], maximumFileSizeToCacheInBytes: 4_000_000 },
    }),
  ],
  test: { include: ['tests/**/*.test.ts'] },
}));
