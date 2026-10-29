# Architecture

```
 Browser (React)                                Node server
┌────────────────────────┐   Socket.IO (WS)   ┌─────────────────────────────────────┐
│ App.tsx  (state)       │ ◄────────────────► │ MessageHandler  (event → method)    │
│  ├ Home / Lobby        │                    │   │                                 │
│  └ GameView            │                    │ RoomManager ─► Room ─► Game         │
│     ├ DrawingCanvas    │                    │                 │       ├ phases    │
│     ├ Chat             │                    │                 │       ├ timers    │
│     └ PlayerList       │                    │                 │       ├ scoring   │
└────────────────────────┘                    │                 │       └ strokes[] │
                                              │               Player (×N)           │
                                              └─────────────────────────────────────┘
```

The **server is authoritative**: clients send intent (`guess`, `draw_start`, `word_chosen`…); the server validates who is allowed to do it, mutates the `Game`, and broadcasts the result. Clients never decide scores, turn order, or whether a guess is correct.

## Real-time drawing

1. **Capture** – `DrawingCanvas` listens to Pointer Events (mouse, touch, pen). Coordinates are converted from screen pixels to a fixed logical 800×600 space, so every client renders the same picture whatever size its `<canvas>` is on screen.
2. **Send** – the drawer renders locally immediately (no round-trip lag) and emits `draw_start {x,y,color,size}`, `draw_move {x,y}`, `draw_end`. Jitter under 1.5px is dropped.
3. **Validate + store** – `Game.drawStart/Move/End` check the sender is the current drawer in the `drawing` phase, sanitise colour/size, and append to `strokes[]` (a list of `{color,size,points[]}`), with caps on stroke/point counts.
4. **Broadcast** – relayed as `draw_data {type:'start'|'move'|'end'}` to everyone *except* the drawer (who already drew it). Viewers draw each new segment incrementally.
5. **Undo / clear** – `draw_undo` pops the last stroke server-side and is broadcast to **all**; every client redraws the whole canvas from its stroke list. `canvas_clear` empties it. Eraser is just a white stroke, so it undoes like anything else.
6. **Late joiners** – a freshly mounted canvas emits `request_canvas`; the server replies with `canvas_state {strokes}` and the client replays them.

## Game state & turn order

`Game` is a small state machine:

```
lobby ─start─► choosing ─word_chosen / 15s auto─► drawing ─all guessed / timeout─► round_end ─6s─► choosing …
                                                                                              └─ no turns left ─► game_over ─play_again─► lobby
```

- **Turn order**: at the start of each round `queue = [all player ids]`. Each turn shifts the next id (skipping anyone who left). When the queue empties, `round++` and it is refilled; when `round > rounds`, the game ends. Players who join mid-game are appended to the current queue.
- **One 1-second `setInterval` per game** ticks the active phase (`timeLeft--`, broadcast `timer`, maybe reveal a hint, check for expiry).
- **Hints**: with `h` hints and draw time `T`, the k-th hint (k=1..h) is revealed once `elapsed ≥ T·k/(h+1)`, one random hidden letter at a time, capped at half the letters. Hidden mode sends no hint at all. Combination mode offers two-word options.
- **State sync**: after any change the server sends each player their own `game_state` (so the drawer gets the word/options and guessers only get `_ _ a _`). `round_end` and `game_over` payloads ride along inside `game_state`, and are also emitted as discrete events.
- **Leaving**: drawer leaves → turn ends (or is skipped during word choice); fewer than 2 players → game ends; host leaves → next player becomes host; empty room → deleted and its timer cleared.

## Scoring

Correct guess: `max(50, round(100 + 300 · timeLeft/drawTime − 25 · (guessers before you)))`.
The drawer earns `guesserPoints / numberOfGuessers` per correct guess (≈ the average guesser score if everyone solves it). The turn ends early once every guesser has solved it. Winner = highest total; the leaderboard is sorted by score.

## Word matching (`utils.js`)

`normalize()` = Unicode NFD → strip accents → lowercase → trim → collapse internal whitespace. A guess is **correct** when `normalize(guess) === normalize(word)`.
**Partial** matching (`isClose`): guess contains the word, or Levenshtein distance 1 (2 for words ≥ 8 letters). Close guesses get a private "is close!" and are *not* broadcast, so they can't leak the answer. All other wrong guesses appear in chat. The drawer and players who already solved it chat in a private channel for the rest of the turn.

## Server OOP structure

| Class | Responsibility |
|---|---|
| `RoomManager` | Room registry, unique 5-char codes (no 0/O/1/I), public room list |
| `Room` | Players (insertion-ordered `Map`), settings, host, banned IPs, and the only methods that emit over sockets (`broadcast`, `broadcastExcept`, `emitTo`) — `Game` stays transport-agnostic |
| `Game` | All rules (see above) |
| `Player` | Id, name, avatar, score, turn score, ready/guessed flags, JSON view |
| `MessageHandler` | Registers every socket event for a connection, checks host/room membership, wraps handlers in try/catch |

All untrusted input is validated server-side (`sanitizeSettings`, name sanitising, colour regex, size/number clamping, 100-char message cap).

## Event reference

**Client → server:** `create_room {hostName, settings, isPublic}` (ack) · `join_room {roomId, playerName}` (ack) · `quick_play` (ack) · `list_rooms` (ack) · `update_settings` · `set_ready` · `start_game` · `play_again` · `word_chosen {word}` · `draw_start` · `draw_move` · `draw_end` · `canvas_clear` · `draw_undo` · `request_canvas` · `guess {text}` · `chat {text}` · `kick_player {playerId, ban}` · `leave_room`

**Server → client:** `room_update` · `player_joined` · `player_left` · `game_state` · `round_start` · `round_end` · `game_over` · `timer` · `hint` · `draw_data` · `draw_undo` · `canvas_clear` · `canvas_state` · `guess_result` · `chat_message` · `kicked` · `error_message`

## Deployment constraints

- WebSockets need a long-lived process: Render/Railway/Fly work; Vercel/Netlify serverless functions don't, so if the frontend lives there the backend must be hosted separately (`VITE_SERVER_URL` on the client, `CLIENT_ORIGIN` on the server).
- Room state is in process memory → one instance only; a restart ends active games. Scaling out would need the Socket.IO Redis adapter plus shared room state.
- Behind a proxy the ban list uses `X-Forwarded-For`.
