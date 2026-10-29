// End-to-end flow test: two simulated players play a full game over real sockets.
// Usage: PORT=3111 node src/index.js &  then  URL=http://localhost:3111 node test/flow.test.js
import { io } from 'socket.io-client';
import assert from 'node:assert/strict';

const URL = process.env.URL || 'http://localhost:3111';
const connect = () => new Promise((res) => {
  const s = io(URL, { transports: ['websocket'] });
  s.on('connect', () => res(s));
});
const emitAck = (s, ev, payload) =>
  new Promise((res) => (payload === undefined ? s.emit(ev, res) : s.emit(ev, payload, res)));
const once = (s, ev, pred = () => true, ms = 15000) =>
  new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error(`timeout waiting for ${ev}`)), ms);
    const h = (d) => {
      if (pred(d)) {
        clearTimeout(t);
        s.off(ev, h);
        res(d);
      }
    };
    s.on(ev, h);
  });

const pass = (msg) => console.log('  ✓', msg);

// Record every game_state per client so we never miss one that arrives "early".
const track = (c) => {
  c.states = [];
  c.cursor = 0;
  c.on('game_state', (st) => c.states.push(st));
};
const waitState = (c, pred, ms = 20000) =>
  new Promise((res, rej) => {
    const t0 = Date.now();
    const tick = () => {
      for (let i = c.cursor; i < c.states.length; i++) {
        if (pred(c.states[i])) {
          c.cursor = i + 1;
          return res(c.states[i]);
        }
      }
      if (Date.now() - t0 > ms) return rej(new Error('timeout waiting for game_state'));
      setTimeout(tick, 20);
    };
    tick();
  });

const a = await connect(); // host / first drawer
const b = await connect();
track(a);
track(b);

// 1. create + join
const created = await emitAck(a, 'create_room', {
  hostName: 'Alice',
  isPublic: true,
  settings: { rounds: 2, drawTime: 15, wordCount: 3, hints: 1, maxPlayers: 4 },
});
assert.ok(created.ok);
assert.equal(created.room.settings.rounds, 2);
pass(`room created (${created.room.id}) with custom settings`);

const rooms = await emitAck(b, 'list_rooms');
assert.ok(rooms.rooms.some((r) => r.id === created.room.id));
pass('public room listed');

const bad = await emitAck(b, 'join_room', { roomId: 'ZZZZZ', playerName: 'Bob' });
assert.equal(bad.ok, false);
pass('joining unknown room rejected');

const joined = await emitAck(b, 'join_room', { roomId: created.room.id.toLowerCase(), playerName: 'Bob' });
assert.ok(joined.ok);
assert.equal(joined.room.players.length, 2);
pass('second player joined via (lower-case) code');

// non-host cannot start
b.emit('start_game');
await new Promise((r) => setTimeout(r, 200));
assert.equal(a.states.filter((x) => x.phase !== 'lobby').length, 0);
pass('non-host cannot start game');

// 2. play full game: 2 players x 2 rounds = 4 turns
const clients = { [a.id]: { s: a, name: 'Alice' }, [b.id]: { s: b, name: 'Bob' } };
const scores = {};
let gameOver = null;
a.on('game_over', (g) => (gameOver = g));

const strokesSeenByGuesser = [];
a.emit('start_game');

for (let turn = 1; turn <= 4; turn++) {
  // wait for choosing phase, learn who draws from the drawer's perspective
  const stateA = await waitState(a, (s) => s.phase === 'choosing' && s.round === Math.ceil(turn / 2));
  const drawerId = stateA.drawerId;
  const drawer = clients[drawerId].s;
  const guesser = drawer === a ? b : a;
  const optsState = drawer === a ? stateA : await waitState(b, (s) => s.phase === 'choosing' && s.wordOptions);
  const options = optsState.wordOptions;
  assert.ok(Array.isArray(options) && options.length === 3, 'drawer gets 3 options');
  const guesserView = guesser === a ? stateA : await waitState(b, (s) => s.phase === 'choosing');
  assert.equal(guesserView.wordOptions, null, 'guesser must not receive word options');

  const word = options[0];
  drawer.emit('word_chosen', { word });
  const drawing = await waitState(guesser, (s) => s.phase === 'drawing');
  assert.equal(drawing.word, null, 'guesser must not see the word');
  assert.ok(/^[_ ]+$/.test(drawing.hint.replace(/ /g, '_')) || drawing.hint.includes('_'), 'guesser sees blanks');
  assert.equal(drawing.hint.length, word.length);

  if (turn === 1) {
    // real-time drawing sync + undo + clear
    guesser.on('draw_data', (d) => strokesSeenByGuesser.push(d));
    const undo = once(guesser, 'draw_undo');
    drawer.emit('draw_start', { x: 10, y: 10, color: '#ff0000', size: 6 });
    drawer.emit('draw_move', { x: 20, y: 20 });
    drawer.emit('draw_move', { x: 30, y: 25 });
    drawer.emit('draw_end', {});
    drawer.emit('draw_start', { x: 100, y: 100, color: '#00ff00', size: 6 });
    drawer.emit('draw_end', {});
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(strokesSeenByGuesser.length, 6);
    assert.equal(strokesSeenByGuesser[0].color, '#ff0000');
    pass('strokes streamed to guesser in real time');

    // guesser trying to draw is ignored
    guesser.emit('draw_start', { x: 1, y: 1, color: '#000000', size: 3 });
    await new Promise((r) => setTimeout(r, 150));
    assert.equal(strokesSeenByGuesser.length, 6);
    pass('non-drawer strokes rejected');

    drawer.emit('draw_undo');
    await undo;
    pass('undo broadcast');

    // late-joiner style canvas fetch should now hold exactly 1 stroke
    const cs = once(guesser, 'canvas_state');
    guesser.emit('request_canvas');
    assert.equal((await cs).strokes.length, 1);
    pass('canvas_state returns stroke history (1 stroke after undo)');

    const cleared = once(guesser, 'canvas_clear');
    drawer.emit('canvas_clear');
    await cleared;
    pass('canvas clear broadcast');

    // wrong guess, close guess, drawer cannot guess
    const wrong = once(drawer, 'chat_message', (m) => m.kind === 'guess');
    guesser.emit('guess', { text: 'definitely-wrong-zzz' });
    assert.equal((await wrong).text, 'definitely-wrong-zzz');
    pass('wrong guess broadcast as chat');

    const close = once(guesser, 'chat_message', (m) => m.kind === 'close');
    guesser.emit('guess', { text: word + 's' });
    await close;
    pass('near-miss gets private "close" nudge');

    let leaked = false;
    drawer.on('chat_message', (m) => m.kind === 'guess' && m.text === word + 's' && (leaked = true));
    await new Promise((r) => setTimeout(r, 150));
    assert.equal(leaked, false);
    pass('close guess not leaked to others');
  }

  // correct guess: case + whitespace insensitive
  const correct = once(drawer, 'guess_result', (r) => r.correct);
  const roundEnd = once(drawer, 'round_end');
  guesser.emit('guess', { text: `  ${word.toUpperCase()}  ` });
  const res = await correct;
  assert.ok(res.points >= 50);
  const end = await roundEnd;
  assert.equal(end.word, word);
  assert.equal(end.reason, 'all_guessed');
  for (const s of end.scores) scores[s.name] = s.score;
  if (turn === 1) pass(`correct guess (case/space-insensitive) scored ${res.points} pts; turn ended early`);
}

await once(a, 'game_over', () => true, 20000).catch(() => {});
assert.ok(gameOver, 'game_over received');
assert.equal(gameOver.leaderboard.length, 2);
assert.ok(gameOver.leaderboard[0].score >= gameOver.leaderboard[1].score);
assert.equal(gameOver.winner.id, gameOver.leaderboard[0].id);
pass(`game over — winner ${gameOver.winner.name} (${gameOver.winner.score} pts), leaderboard sorted`);

// play again returns to lobby
a.emit('play_again');
await waitState(a, (s) => s.phase === 'lobby' && s.round === 0);
pass('host can reset to lobby');

// leaving: host leaves → bob becomes host
const upd = once(b, 'room_update', (r) => r.players.length === 1);
a.close();
const r = await upd;
assert.equal(r.hostId, b.id);
pass('host migration on leave');

b.close();
console.log('\nALL FLOW CHECKS PASSED');
process.exit(0);
