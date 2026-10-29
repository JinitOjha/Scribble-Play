import { io } from 'socket.io-client';

// Same-origin by default (production single-service deploy, or Vite dev proxy).
// Set VITE_SERVER_URL when the frontend and the WebSocket server live on different hosts.
const url = import.meta.env.VITE_SERVER_URL as string | undefined;
export const socket = url ? io(url) : io();
