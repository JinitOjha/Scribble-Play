import { pickWordOptions } from './words.js';
import { normalize, isClose } from './utils.js';

const CHOOSE_SECONDS = 15;
const ROUND_END_SECONDS = 6;
const MAX_STROKES = 2000;
const MAX_POINTS_PER_STROKE = 6000;
const HEX = /^#[0-9a-f]{6}$/i;

/**
 * Game owns everything that happens once the host hits "start":
 * turn order, timers, word selection, hints, scoring, stroke history.
 * It talks to clients only through its Room (broadcast / emitTo).
 *
 * Phases: lobby -> choosing -> drawing -> round_end -> (choosing ...) -> game_over
 */
export class Game {
  constructor(room) {
    this.room = room;
    this.interval = null;
    this.reset();
  }

  get settings() {
    return this.room.settings;
  }

  reset() {
    this.stopTimer();
    this.phase = 'lobby';
    this.round = 0;
    this.drawerId = null;
    this.word = null;
    this.wordOptions = [];
    this.revealed = new Set();
    this.hintsGiven = 0;
    this.strokes = [];
    this.currentStroke = null;
    this.timeLeft = 0;
    this.queue = []; // players still to draw in the current round
    this.usedWords = new Set();
    this.guessOrder = [];
    this.roundEnd = null;
    this.gameOver = null;
  }

  destroy() {
    this.stopTimer();
  }

  // ───────────────────────── lifecycle ─────────────────────────

  start() {
    this.reset();
    for (const p of this.room.players.values()) p.resetForGame();
    this.round = 1;
    this.queue = [...this.room.players.keys()];
    this.startTimer();
    this.beginTurn();
  }

  playAgain() {
    this.reset();
    for (const p of this.room.players.values()) {
      p.resetForGame();
      p.ready = false;
    }
    this.room.broadcast('canvas_clear', {});
    this.room.broadcast('room_update', this.room.toJSON());
    this.broadcastState();
  }

  startTimer() {
    this.stopTimer();
    this.interval = setInterval(() => this.tick(), 1000);
  }

  stopTimer() {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
  }

  tick() {
    if (this.phase === 'choosing') {
      this.timeLeft -= 1;
      this.room.broadcast('timer', { timeLeft: this.timeLeft });
      if (this.timeLeft <= 0) {
        const pick = this.wordOptions[Math.floor(Math.random() * this.wordOptions.length)];
        this.setWord(pick);
      }
    } else if (this.phase === 'drawing') {
      this.timeLeft -= 1;
      this.room.broadcast('timer', { timeLeft: this.timeLeft });
      this.maybeRevealHint();
      if (this.timeLeft <= 0) this.endTurn('time');
    } else if (this.phase === 'round_end') {
      this.timeLeft -= 1;
      this.room.broadcast('timer', { timeLeft: this.timeLeft });
      if (this.timeLeft <= 0) this.beginTurn();
    }
  }

  // ───────────────────────── turns ─────────────────────────

  beginTurn() {
    if (this.room.players.size < 2) return this.endGame('Not enough players to continue.');

    while (this.queue.length && !this.room.players.has(this.queue[0])) this.queue.shift();
    if (!this.queue.length) {
      if (this.round >= this.settings.rounds) return this.endGame();
      this.round += 1;
      this.queue = [...this.room.players.keys()];
    }

    this.drawerId = this.queue.shift();
    for (const p of this.room.players.values()) {
      p.hasGuessed = false;
      p.turnScore = 0;
    }
    this.word = null;
    this.strokes = [];
    this.currentStroke = null;
    this.revealed = new Set();
    this.hintsGiven = 0;
    this.guessOrder = [];
    this.roundEnd = null;
    this.phase = 'choosing';
    this.timeLeft = CHOOSE_SECONDS;
    this.wordOptions = pickWordOptions(this.settings, this.usedWords);

    this.room.broadcast('canvas_clear', {});
    this.broadcastState();
    for (const p of this.room.players.values()) {
      this.room.emitTo(p.id, 'round_start', {
        drawerId: this.drawerId,
        round: this.round,
        drawTime: this.settings.drawTime,
        wordOptions: p.id === this.drawerId ? this.wordOptions : null,
      });
    }
  }

  chooseWord(player, word) {
    if (this.phase !== 'choosing' || player.id !== this.drawerId) return;
    if (!this.wordOptions.includes(word)) return;
    this.setWord(word);
  }

  setWord(word) {
    this.word = word;
    this.usedWords.add(word.toLowerCase());
    this.phase = 'drawing';
    this.timeLeft = this.settings.drawTime;
    this.broadcastState();
    const drawer = this.room.players.get(this.drawerId);
    this.room.broadcast('chat_message', {
      kind: 'system',
      text: `${drawer ? drawer.name : 'Someone'} is drawing now!`,
    });
  }

  endTurn(reason) {
    if (this.phase !== 'drawing') return;
    this.phase = 'round_end';
    this.timeLeft = ROUND_END_SECONDS;
    this.currentStroke = null;

    this.roundEnd = {
      word: this.word,
      reason,
      scores: [...this.room.players.values()].map((p) => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        score: p.score,
        turnScore: p.turnScore,
      })),
      nextDrawerId: this.peekNextDrawer(),
    };
    this.broadcastState();
    this.room.broadcast('round_end', this.roundEnd);
    this.room.broadcast('chat_message', { kind: 'system', text: `The word was "${this.word}"` });
  }

  peekNextDrawer() {
    return this.queue.find((id) => this.room.players.has(id)) ?? null;
  }

  endGame(note) {
    this.stopTimer();
    this.phase = 'game_over';
    const leaderboard = [...this.room.players.values()]
      .sort((a, b) => b.score - a.score)
      .map((p, i) => ({ rank: i + 1, id: p.id, name: p.name, avatar: p.avatar, score: p.score }));
    this.gameOver = { winner: leaderboard[0] ?? null, leaderboard };
    if (note) this.room.broadcast('chat_message', { kind: 'system', text: note });
    this.broadcastState();
    this.room.broadcast('game_over', this.gameOver);
  }

  // ───────────────────────── hints ─────────────────────────

  letterIndexes() {
    return [...(this.word ?? '')].map((ch, i) => (/[\p{L}\p{N}]/u.test(ch) ? i : -1)).filter((i) => i >= 0);
  }

  maskedHint() {
    if (!this.word || this.settings.wordMode === 'hidden') return '';
    return [...this.word].map((ch, i) => (/[\p{L}\p{N}]/u.test(ch) ? (this.revealed.has(i) ? ch : '_') : ch)).join('');
  }

  maybeRevealHint() {
    const { hints, drawTime, wordMode } = this.settings;
    if (wordMode === 'hidden' || hints <= 0 || !this.word) return;
    const letters = this.letterIndexes();
    const cap = Math.min(hints, Math.floor(letters.length / 2));
    if (this.hintsGiven >= cap) return;
    const elapsed = drawTime - this.timeLeft;
    const threshold = (drawTime * (this.hintsGiven + 1)) / (hints + 1);
    if (elapsed < threshold) return;
    const hidden = letters.filter((i) => !this.revealed.has(i));
    if (!hidden.length) return;
    this.revealed.add(hidden[Math.floor(Math.random() * hidden.length)]);
    this.hintsGiven += 1;
    this.room.broadcast('hint', { hint: this.maskedHint() });
  }

  // ───────────────────────── chat & guessing ─────────────────────────

  handleChat(player, rawText) {
    const text = String(rawText ?? '').trim().slice(0, 100);
    if (!text) return;
    const base = { playerId: player.id, playerName: player.name };

    // An active guesser typing during a turn.
    if (this.phase === 'drawing' && player.id !== this.drawerId && !player.hasGuessed) {
      const guess = normalize(text);
      const word = normalize(this.word);
      if (guess === word) return this.correctGuess(player);

      this.room.emitTo(player.id, 'guess_result', { correct: false, playerId: player.id, playerName: player.name, points: 0 });
      if (isClose(guess, word)) {
        // Only the guesser sees this, so it doesn't leak the answer to others.
        this.room.emitTo(player.id, 'chat_message', { ...base, text: `"${text}" is close!`, kind: 'close' });
        return;
      }
      this.room.broadcast('chat_message', { ...base, text, kind: 'guess' });
      return;
    }

    // The drawer and players who already guessed talk in a private channel so the word can't leak.
    if (this.phase === 'drawing' && (player.id === this.drawerId || player.hasGuessed)) {
      for (const p of this.room.players.values()) {
        if (p.id === this.drawerId || p.hasGuessed) {
          this.room.emitTo(p.id, 'chat_message', { ...base, text, kind: 'chat', private: true });
        }
      }
      return;
    }

    this.room.broadcast('chat_message', { ...base, text, kind: 'chat' });
  }

  correctGuess(player) {
    const ratio = Math.max(0, this.timeLeft) / this.settings.drawTime;
    const order = this.guessOrder.length;
    const points = Math.max(50, Math.round(100 + 300 * ratio - order * 25));
    player.hasGuessed = true;
    player.score += points;
    player.turnScore = points;
    this.guessOrder.push(player.id);

    const drawer = this.room.players.get(this.drawerId);
    if (drawer) {
      const guessers = Math.max(1, this.room.players.size - 1);
      const drawerPoints = Math.round(points / guessers);
      drawer.score += drawerPoints;
      drawer.turnScore += drawerPoints;
    }

    this.room.broadcast('guess_result', { correct: true, playerId: player.id, playerName: player.name, points });
    this.room.broadcast('chat_message', {
      kind: 'correct',
      playerId: player.id,
      playerName: player.name,
      text: `${player.name} guessed the word!`,
    });
    this.broadcastState();
    if (this.allGuessed()) this.endTurn('all_guessed');
  }

  allGuessed() {
    const guessers = [...this.room.players.values()].filter((p) => p.id !== this.drawerId);
    return guessers.length > 0 && guessers.every((p) => p.hasGuessed);
  }

  // ───────────────────────── drawing ─────────────────────────

  canDraw(player) {
    return this.phase === 'drawing' && player.id === this.drawerId;
  }

  drawStart(player, d) {
    if (!this.canDraw(player) || !d) return;
    const x = Number(d.x);
    const y = Number(d.y);
    if (!Number.isFinite(x) || !Number.isFinite(y) || this.strokes.length >= MAX_STROKES) return;
    const color = HEX.test(d.color) ? d.color : '#000000';
    const size = Math.min(60, Math.max(1, Number(d.size) || 4));
    this.currentStroke = { color, size, points: [[x, y]] };
    this.strokes.push(this.currentStroke);
    this.room.broadcastExcept(player.id, 'draw_data', { type: 'start', x, y, color, size });
  }

  drawMove(player, d) {
    if (!this.canDraw(player) || !this.currentStroke || !d) return;
    const x = Number(d.x);
    const y = Number(d.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (this.currentStroke.points.length >= MAX_POINTS_PER_STROKE) return;
    this.currentStroke.points.push([x, y]);
    this.room.broadcastExcept(player.id, 'draw_data', { type: 'move', x, y });
  }

  drawEnd(player) {
    if (!this.canDraw(player)) return;
    this.currentStroke = null;
    this.room.broadcastExcept(player.id, 'draw_data', { type: 'end' });
  }

  clearCanvas(player) {
    if (!this.canDraw(player)) return;
    this.strokes = [];
    this.currentStroke = null;
    this.room.broadcast('canvas_clear', {});
  }

  undo(player) {
    if (!this.canDraw(player)) return;
    this.strokes.pop();
    this.currentStroke = null;
    this.room.broadcast('draw_undo', {});
  }

  // ───────────────────────── state sync ─────────────────────────

  stateFor(player) {
    const showWord =
      this.word &&
      (player.id === this.drawerId || player.hasGuessed || this.phase === 'round_end' || this.phase === 'game_over');
    return {
      phase: this.phase,
      round: this.round,
      totalRounds: this.settings.rounds,
      drawerId: this.drawerId,
      drawTime: this.settings.drawTime,
      timeLeft: this.timeLeft,
      wordMode: this.settings.wordMode,
      hint: this.maskedHint(),
      word: showWord ? this.word : null,
      wordOptions: this.phase === 'choosing' && player.id === this.drawerId ? this.wordOptions : null,
      players: this.room.publicPlayers(),
      roundEnd: this.phase === 'round_end' ? this.roundEnd : null,
      gameOver: this.phase === 'game_over' ? this.gameOver : null,
    };
  }

  broadcastState() {
    for (const p of this.room.players.values()) this.room.emitTo(p.id, 'game_state', this.stateFor(p));
  }

  sendCanvas(player) {
    this.room.emitTo(player.id, 'canvas_state', { strokes: this.strokes });
  }

  // ───────────────────────── membership hooks ─────────────────────────

  onPlayerJoined(player) {
    if (this.phase !== 'lobby' && this.phase !== 'game_over') this.queue.push(player.id);
  }

  onPlayerLeft(playerId) {
    this.queue = this.queue.filter((id) => id !== playerId);
    if (this.phase === 'lobby' || this.phase === 'game_over') return;

    if (this.room.players.size < 2) return this.endGame('Not enough players to continue.');

    if (playerId === this.drawerId) {
      if (this.phase === 'drawing') {
        this.room.broadcast('chat_message', { kind: 'system', text: 'The drawer left the game.' });
        return this.endTurn('drawer_left');
      }
      if (this.phase === 'choosing') {
        this.room.broadcast('chat_message', { kind: 'system', text: 'The drawer left, skipping turn.' });
        return this.beginTurn();
      }
    } else if (this.phase === 'drawing' && this.allGuessed()) {
      return this.endTurn('all_guessed');
    }
    this.broadcastState();
  }
}
