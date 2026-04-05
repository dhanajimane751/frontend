import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      include: ['buffer', 'process', 'util', 'events', 'stream'],
      globals: { Buffer: true, global: true, process: true },
    }),
  ],
  server: {
    host: true,   // expose on all network interfaces (LAN, WiFi)
    port: 5173,
  },
})
