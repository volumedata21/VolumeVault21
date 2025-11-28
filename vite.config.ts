import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['pwa-512x512.png', 'pwa-192x192.png'], 
      manifest: {
        name: 'VolumeVault21',
        short_name: 'VolumeVault',
        description: 'A self-hosted Markdown note-taking application.',
        theme_color: '#ffffff',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      // NEW: Workbox configuration for Caching Strategy
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        runtimeCaching: [
          {
            // Cache Google Fonts (used in index.html)
            urlPattern: /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
              },
            },
          },
          // Cache all other static assets (e.g., Lucide icons, any other CDN files)
          {
            urlPattern: /.*/i,
            handler: 'NetworkFirst',
            options: {
                cacheName: 'runtime-cache',
                expiration: {
                    maxEntries: 30,
                    maxAgeSeconds: 60 * 60 * 24 // 24 hours
                }
            }
          }
        ]
      }
    })
  ],
  server: {
    port: 2100,
    host: true,
    hmr: {
        clientPort: 2100
    },
    watch: {
        usePolling: true
    },
    // CRITICAL FIX: Proxy /api and /uploads traffic from Vite (2100) to Express (3000)
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false, 
      },
      '/uploads': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      }
    }
  }
});