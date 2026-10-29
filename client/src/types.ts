export type WordMode = 'normal' | 'hidden' | 'combination';
export type Phase = 'lobby' | 'choosing' | 'drawing' | 'round_end' | 'game_over';

export interface Settings {
  maxPlayers: number;
  rounds: number;
  drawTime: number;
  wordCount: number;
  hints: number;
  wordMode: WordMode;
  category: string;
  customWords: string[];
}

export interface Player {
  id: string;
  name: string;
  avatar: string;
  score: number;
  turnScore: number;
  hasGuessed: boolean;
  ready: boolean;
  isHost: boolean;
}

export interface RoomInfo {
  id: string;
  isPublic: boolean;
  hostId: string | null;
  settings: Settings;
  players: Player[];
  phase: Phase;
}

export interface RoundEnd {
  word: string;
  reason: string;
  scores: { id: string; name: string; avatar: string; score: number; turnScore: number }[];
  nextDrawerId: string | null;
}

export interface GameOver {
  winner: { id: string; name: string; avatar: string; score: number } | null;
  leaderboard: { rank: number; id: string; name: string; avatar: string; score: number }[];
}

export interface GameState {
  phase: Phase;
  round: number;
  totalRounds: number;
  drawerId: string | null;
  drawTime: number;
  timeLeft: number;
  wordMode: WordMode;
  hint: string;
  word: string | null;
  wordOptions: string[] | null;
  players: Player[];
  roundEnd: RoundEnd | null;
  gameOver: GameOver | null;
}

export interface ChatMsg {
  id: number;
  kind: 'chat' | 'guess' | 'correct' | 'close' | 'system';
  playerId?: string;
  playerName?: string;
  text: string;
  private?: boolean;
}

export interface Stroke {
  color: string;
  size: number;
  points: [number, number][];
}

export interface PublicRoom {
  id: string;
  host: string;
  players: number;
  maxPlayers: number;
  rounds: number;
  drawTime: number;
  phase: Phase;
}

export const DEFAULT_SETTINGS: Settings = {
  maxPlayers: 8,
  rounds: 3,
  drawTime: 80,
  wordCount: 3,
  hints: 2,
  wordMode: 'normal',
  category: 'all',
  customWords: [],
};

export const CATEGORIES = ['all', 'animals', 'objects', 'food', 'actions', 'places'];
