const AVATARS = ['🦊', '🐼', '🐸', '🐵', '🦁', '🐙', '🐧', '🦄', '🐯', '🐨', '🐰', '🐻', '🦉', '🐳', '🐢', '🦋', '🐷', '🐔', '🦖', '🐝'];

export class Player {
  constructor(id, name, avatar, ip = '') {
    this.id = id; // socket id
    this.name = name;
    this.avatar = avatar;
    this.ip = ip;
    this.score = 0;
    this.turnScore = 0;
    this.hasGuessed = false;
    this.ready = false;
  }

  static pickAvatar(takenAvatars) {
    const free = AVATARS.filter((a) => !takenAvatars.has(a));
    const pool = free.length ? free : AVATARS;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  resetForGame() {
    this.score = 0;
    this.turnScore = 0;
    this.hasGuessed = false;
  }

  toJSON(hostId) {
    return {
      id: this.id,
      name: this.name,
      avatar: this.avatar,
      score: this.score,
      turnScore: this.turnScore,
      hasGuessed: this.hasGuessed,
      ready: this.ready,
      isHost: this.id === hostId,
    };
  }
}
