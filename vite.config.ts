import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'VolumeVault21',
        short_name: 'VolumeVault',
        description: 'A self-hosted Markdown note-taking application.',
        theme_color: '#ffffff',
        icons: [
          {
            src: 'icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
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
    }
  }
});