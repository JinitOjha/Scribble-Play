import { Game } from './Game.js';

/**
 * A Room holds participants + settings and owns exactly one Game.
 * It's also the only thing that touches socket.io for outbound messages,
 * so Game stays free of transport details.
 */
export class Room {
  constructor({ id, io, settings, isPublic }) {
    this.id = id;
    this.io = io;
    this.settings = settings;
    this.isPublic = isPublic;
    this.players = new Map(); // socketId -> Player (insertion order = join order)
    this.hostId = null;
    this.bannedIps = new Set();
    this.game = new Game(this);
  }

  get isFull() {
    return this.players.size >= this.settings.maxPlayers;
  }

  addPlayer(player) {
    this.players.set(player.id, player);
    if (!this.hostId) this.hostId = player.id;
    this.game.onPlayerJoined(player);
  }

  removePlayer(id) {
    const player = this.players.get(id);
    if (!player) return null;
    this.players.delete(id);
    if (this.hostId === id) this.hostId = this.players.keys().next().value ?? null;
    this.game.onPlayerLeft(id);
    return player;
  }

  broadcast(event, payload) {
    this.io.to(this.id).emit(event, payload);
  }

  broadcastExcept(socketId, event, payload) {
    this.io.to(this.id).except(socketId).emit(event, payload);
  }

  emitTo(socketId, event, payload) {
    this.io.to(socketId).emit(event, payload);
  }

  publicPlayers() {
    return [...this.players.values()].map((p) => p.toJSON(this.hostId));
  }

  toJSON() {
    return {
      id: this.id,
      isPublic: this.isPublic,
      hostId: this.hostId,
      settings: this.settings,
      players: this.publicPlayers(),
      phase: this.game.phase,
    };
  }

  summary() {
    const host = this.players.get(this.hostId);
    return {
      id: this.id,
      host: host ? host.name : '—',
      players: this.players.size,
      maxPlayers: this.settings.maxPlayers,
      rounds: this.settings.rounds,
      drawTime: this.settings.drawTime,
      phase: this.game.phase,
    };
  }

  destroy() {
    this.game.destroy();
  }
}
