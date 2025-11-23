import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // Needed for Docker mapping
    port: 5173, 
    watch: {
      usePolling: true // Needed for hot reload in Docker on Windows/Mac
    }
  }
})