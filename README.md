# 🎨 Scribble Party — a skribbl.io clone

Real-time multiplayer drawing & guessing game. One player draws a secret word, everyone else races to guess it in chat; faster guesses earn more points.

**Live demo:** `(https://scribble-party-z5m7.onrender.com)` &nbsp;

**Stack:** React + TypeScript + Vite · HTML5 Canvas · Node.js + Express · Socket.IO

## Features

| Area | What's included |
|---|---|
| Rooms | Create / join via code or invite link, public (listed + quick play) and private rooms, lobby with ready-up, host-only start |
| Settings | Max players 2–20, rounds 2–10, draw time 15–240s, 1–5 word choices, 0–5 hints, word mode (normal / hidden / combination), word category, host custom words |
| Gameplay | Turn-based drawing (everyone draws once per round), word choice with auto-pick, live hint reveal (`_ a _ e`), time-scaled scoring, round summary, final leaderboard + winner, play again |
| Drawing | Brush, 16 colours, 4 sizes, eraser, undo, clear (drawer only), real-time stroke sync, canvas replay for late joiners |
| Chat | Guesses double as chat, "X guessed the word!", private "is close!" nudge, drawer/solved players get a private channel so the word can't leak |
| Moderation | Host kick and IP ban, host migration when the host leaves |

## Run locally

Requires Node 18+.

```bash
npm install                # root dev tool (concurrently)
npm run install:all        # server + client dependencies
npm run dev                # server on :3001, Vite client on :5173
```

Open <http://localhost:5173> in two browser windows (use a private window for the second player), create a room in one and join it from the other.

### Production build (single process)

```bash
npm run build              # builds client/dist
npm start                  # Express serves the UI + Socket.IO on $PORT (default 3001)
```

### Tests

An end-to-end socket test simulates two players through a full 2-round game (create/join, drawing sync, undo/clear, wrong/close/correct guesses, scoring, game over, host migration):

```bash
cd server
PORT=3111 node src/index.js &        # start a server
URL=http://localhost:3111 npm run test:flow
```

## Deploy (Render, free tier)

The server serves the built React app, so this is **one** service and the client talks to its own origin — no CORS or env vars needed.

1. Push this folder to a GitHub repo.
2. On [Render](https://render.com): **New → Blueprint**, pick the repo (it reads `render.yaml`).
   Or **New → Web Service** with: Build command `npm run build`, Start command `npm start`, Health check `/health`.
3. When the deploy finishes, copy the `https://….onrender.com` URL into the **Live demo** line above.

Notes:
- Render supports WebSockets out of the box. Free instances sleep after ~15 min idle; the first request takes up to a minute to wake (the client shows "Connecting to server…").
- Game state is in memory, so run **one instance** (don't scale horizontally without a Socket.IO adapter + shared store).
- Splitting hosting (e.g. Vercel/Netlify frontend + Render backend) works too: build the client with `VITE_SERVER_URL=https://your-backend` and set `CLIENT_ORIGIN=https://your-frontend` on the server. Vercel/Netlify can't host the WebSocket server themselves (serverless functions can't hold long-lived connections).

## Project layout

```
server/src
  index.js           Express + Socket.IO bootstrap, serves client/dist
  RoomManager.js     creates/finds rooms, generates codes, lists public rooms
  Room.js            participants, settings, host, bans; the only outbound-socket gateway
  Game.js            phases, turn order, timers, hints, scoring, strokes, chat/guess matching
  Player.js          player model
  MessageHandler.js  one place that wires every socket event to Room/Game
  words.js, utils.js word bank + picking; settings validation, word normalisation/matching
client/src
  App.tsx            socket listeners → React state, screen routing
  components/        Home, Lobby, GameView, DrawingCanvas, Chat, PlayerList, SettingsForm
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for how the pieces fit together and the event reference.
