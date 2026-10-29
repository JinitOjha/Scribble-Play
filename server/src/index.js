import express from 'express';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import { Server } from 'socket.io';

import { RoomManager } from './RoomManager.js';
import { MessageHandler } from './MessageHandler.js';
import { CATEGORY_NAMES } from './words.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || '*'; // set when the frontend is hosted separately

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: CLIENT_ORIGIN },
  pingInterval: 10000,
  pingTimeout: 15000,
});

const manager = new RoomManager(io);
const handler = new MessageHandler(io, manager);
io.on('connection', (socket) => handler.register(socket));

app.get('/health', (_req, res) => res.json({ ok: true, rooms: manager.rooms.size }));
app.get('/api/rooms', (_req, res) => res.json({ rooms: manager.publicList() }));
app.get('/api/categories', (_req, res) => res.json({ categories: CATEGORY_NAMES }));

// In production the built React app is served from the same origin as the sockets.
const clientDist = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
} else {
  app.get('/', (_req, res) => res.send('Skribbl server running. Build the client (npm run build) to serve the UI.'));
}

server.listen(PORT, () => console.log(`Server listening on :${PORT}`));
