import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages serveert de app onder /polobord/
const base = process.env.POLOBORD_BASE ?? '/polobord/'

const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ')

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(`v${process.env.npm_package_version ?? '1'} · ${stamp}`),
  },
  plugins: [
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Polobord',
        short_name: 'Polobord',
        description: 'Digitaal waterpolo-tactiekbord',
        lang: 'nl',
        display: 'standalone',
        orientation: 'landscape',
        background_color: '#0b2233',
        theme_color: '#0b2233',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'],
        navigateFallback: 'index.html',
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
