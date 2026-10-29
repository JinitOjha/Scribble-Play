import { Player } from './Player.js';
import { sanitizeSettings, sanitizeName, DEFAULT_SETTINGS } from './utils.js';

/**
 * Registers all Socket.IO event handlers for one connected socket.
 * Per-socket state (which room / player this socket is) lives in `ctx`.
 */
export class MessageHandler {
  constructor(io, manager) {
    this.io = io;
    this.manager = manager;
  }

  register(socket) {
    const ctx = { room: null, player: null };
    const ip = String(socket.handshake.headers['x-forwarded-for'] ?? socket.handshake.address ?? '')
      .split(',')[0]
      .trim();

    // Wrap handlers so a malformed payload can never crash the server.
    const on = (event, fn) =>
      socket.on(event, (...args) => {
        try {
          fn(...args);
        } catch (err) {
          console.error(`[${event}]`, err);
        }
      });
    const ack = (cb, data) => typeof cb === 'function' && cb(data);
    const requireRoom = () => (ctx.room && ctx.player ? ctx : null);
    const isHost = () => ctx.room && ctx.room.hostId === socket.id;

    // ───── lobby ─────

    on('create_room', (payload, cb) => {
      if (ctx.room) return ack(cb, { ok: false, error: 'Already in a room' });
      const settings = sanitizeSettings(payload?.settings, DEFAULT_SETTINGS);
      const room = this.manager.create(settings, Boolean(payload?.isPublic));
      this.join(socket, ctx, room, payload?.hostName, ip, cb);
    });

    on('join_room', (payload, cb) => {
      if (ctx.room) return ack(cb, { ok: false, error: 'Already in a room' });
      const room = this.manager.get(payload?.roomId);
      if (!room) return ack(cb, { ok: false, error: 'Room not found' });
      if (room.isFull) return ack(cb, { ok: false, error: 'Room is full' });
      if (ip && room.bannedIps.has(ip)) return ack(cb, { ok: false, error: 'You are banned from this room' });
      this.join(socket, ctx, room, payload?.playerName, ip, cb);
    });

    on('quick_play', (payload, cb) => {
      if (ctx.room) return ack(cb, { ok: false, error: 'Already in a room' });
      let room = this.manager.findOpenPublic();
      if (room && ip && room.bannedIps.has(ip)) room = null;
      if (!room) room = this.manager.create(sanitizeSettings({}, DEFAULT_SETTINGS), true);
      this.join(socket, ctx, room, payload?.playerName, ip, cb);
    });

    on('list_rooms', (cb) => ack(cb, { ok: true, rooms: this.manager.publicList() }));

    on('update_settings', (payload) => {
      if (!requireRoom() || !isHost() || ctx.room.game.phase !== 'lobby') return;
      const next = sanitizeSettings(payload, ctx.room.settings);
      next.maxPlayers = Math.max(next.maxPlayers, ctx.room.players.size);
      ctx.room.settings = next;
      ctx.room.broadcast('room_update', ctx.room.toJSON());
    });

    on('set_ready', (payload) => {
      if (!requireRoom() || ctx.room.game.phase !== 'lobby') return;
      ctx.player.ready = Boolean(payload?.ready);
      ctx.room.broadcast('room_update', ctx.room.toJSON());
    });

    on('start_game', () => {
      if (!requireRoom() || !isHost()) return;
      if (ctx.room.game.phase !== 'lobby') return;
      if (ctx.room.players.size < 2) {
        return socket.emit('error_message', { message: 'You need at least 2 players to start.' });
      }
      ctx.room.game.start();
    });

    on('play_again', () => {
      if (!requireRoom() || !isHost() || ctx.room.game.phase !== 'game_over') return;
      ctx.room.game.playAgain();
    });

    // ───── game ─────

    on('word_chosen', (payload) => {
      if (!requireRoom()) return;
      ctx.room.game.chooseWord(ctx.player, String(payload?.word ?? ''));
    });

    on('draw_start', (d) => requireRoom() && ctx.room.game.drawStart(ctx.player, d));
    on('draw_move', (d) => requireRoom() && ctx.room.game.drawMove(ctx.player, d));
    on('draw_end', () => requireRoom() && ctx.room.game.drawEnd(ctx.player));
    on('canvas_clear', () => requireRoom() && ctx.room.game.clearCanvas(ctx.player));
    on('draw_undo', () => requireRoom() && ctx.room.game.undo(ctx.player));
    on('request_canvas', () => requireRoom() && ctx.room.game.sendCanvas(ctx.player));

    // Both events go through the same path: during a turn a "chat" from a
    // guesser is treated as a guess, so the answer can never leak via chat.
    on('guess', (payload) => requireRoom() && ctx.room.game.handleChat(ctx.player, payload?.text));
    on('chat', (payload) => requireRoom() && ctx.room.game.handleChat(ctx.player, payload?.text));

    // ───── moderation ─────

    on('kick_player', (payload) => {
      if (!requireRoom() || !isHost()) return;
      const targetId = String(payload?.playerId ?? '');
      if (targetId === socket.id) return;
      const target = ctx.room.players.get(targetId);
      const targetSocket = this.io.sockets.sockets.get(targetId);
      if (!target) return;
      if (payload?.ban && target.ip) ctx.room.bannedIps.add(target.ip);
      if (targetSocket) {
        targetSocket.emit('kicked', { reason: payload?.ban ? 'You were banned by the host.' : 'You were kicked by the host.' });
        // Reuse the leave path so the kicked socket's own ctx is cleaned up too.
        targetSocket.data.leave?.();
      }
    });

    // ───── leaving ─────

    const leave = () => {
      if (!ctx.room || !ctx.player) return;
      const { room, player } = ctx;
      ctx.room = null;
      ctx.player = null;
      socket.leave(room.id);
      room.removePlayer(player.id);
      if (room.players.size === 0) {
        this.manager.delete(room.id);
        return;
      }
      room.broadcast('player_left', { playerId: player.id, players: room.publicPlayers() });
      room.broadcast('room_update', room.toJSON());
      room.broadcast('chat_message', { kind: 'system', text: `${player.name} left the room` });
    };
    socket.data.leave = leave;

    on('leave_room', leave);
    socket.on('disconnect', leave);
  }

  join(socket, ctx, room, rawName, ip, cb) {
    let name = sanitizeName(rawName);
    const taken = new Set([...room.players.values()].map((p) => p.name.toLowerCase()));
    if (taken.has(name.toLowerCase())) {
      let n = 2;
      while (taken.has(`${name} ${n}`.toLowerCase())) n++;
      name = `${name} ${n}`.slice(0, 24);
    }
    const avatar = Player.pickAvatar(new Set([...room.players.values()].map((p) => p.avatar)));
    const player = new Player(socket.id, name, avatar, ip);

    room.addPlayer(player);
    ctx.room = room;
    ctx.player = player;
    socket.join(room.id);

    // Ack first so the client knows who it is, then sync state.
    cb?.({ ok: true, selfId: socket.id, room: room.toJSON() });

    socket.emit('room_update', room.toJSON());
    socket.emit('game_state', room.game.stateFor(player));
    socket.to(room.id).emit('player_joined', { player: player.toJSON(room.hostId), players: room.publicPlayers() });
    room.broadcast('room_update', room.toJSON());
    room.broadcast('chat_message', { kind: 'system', text: `${player.name} joined the room` });
    if (room.game.phase !== 'lobby') room.game.broadcastState();
  }
}
