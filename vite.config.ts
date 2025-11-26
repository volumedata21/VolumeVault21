import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Include the new PWA assets
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
      // This routes both GET and POST requests for /api/* to the Express server
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false, 
      },
      // This ensures image links are fetched correctly
      '/uploads': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      }
    }
  }
});