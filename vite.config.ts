/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // When deployed to GitHub Pages the app lives at /<repo-name>/
  // VITE_BASE is injected by the CI workflow; falls back to '/' for local dev.
  base: process.env.VITE_BASE ?? '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Precache all build output and serve it from cache when offline.
      // This means the app launches without a running server after first install.
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api/],
      },
      manifest: {
        name: 'Trilion GPC Viewer',
        short_name: 'GPC Viewer',
        description: 'View GOM Product Configurator files',
        theme_color: '#2c3e50',
        background_color: '#f5f5f5',
        display: 'standalone',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }
        ],
        // File Handling API — lets the installed PWA open .gconfiguration and
        // .gproducts files directly (e.g. double-click in Outlook, Finder, Explorer)
        // without requiring a save-to-disk step first.
        file_handlers: [
          {
            action: '/',
            accept: {
              'application/octet-stream': ['.gconfiguration', '.gproducts']
            },
            icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
            launch_type: 'single-client'
          }
        ]
      }
    })
  ],
  test: {
    environment: 'jsdom',
    globals: true
  }
})
