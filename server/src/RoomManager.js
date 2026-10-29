import { Room } from './Room.js';

// No 0/O/1/I so codes are easy to read aloud.
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export class RoomManager {
  constructor(io) {
    this.io = io;
    this.rooms = new Map();
  }

  generateCode() {
    let code;
    do {
      code = Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
    } while (this.rooms.has(code));
    return code;
  }

  create(settings, isPublic) {
    const room = new Room({ id: this.generateCode(), io: this.io, settings, isPublic });
    this.rooms.set(room.id, room);
    return room;
  }

  get(id) {
    return this.rooms.get(String(id ?? '').trim().toUpperCase());
  }

  delete(id) {
    const room = this.rooms.get(id);
    if (room) room.destroy();
    this.rooms.delete(id);
  }

  publicList() {
    return [...this.rooms.values()]
      .filter((r) => r.isPublic && !r.isFull)
      .map((r) => r.summary())
      .sort((a, b) => b.players - a.players);
  }

  findOpenPublic() {
    return [...this.rooms.values()].find((r) => r.isPublic && !r.isFull && r.game.phase === 'lobby');
  }
}
