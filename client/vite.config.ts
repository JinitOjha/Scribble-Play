import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In dev, proxy the websocket + API to the Node server so the client can use same-origin URLs.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/socket.io': { target: 'http://localhost:3001', ws: true },
      '/api': 'http://localhost:3001',
    },
  },
});
