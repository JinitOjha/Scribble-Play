import { CATEGORY_NAMES } from './words.js';

export const DEFAULT_SETTINGS = {
  maxPlayers: 8,
  rounds: 3,
  drawTime: 80,
  wordCount: 3,
  hints: 2,
  wordMode: 'normal',
  category: 'all',
  customWords: [],
};

const clampInt = (v, min, max, fallback) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

/** Validates + clamps untrusted settings coming from a client. */
export function sanitizeSettings(input = {}, base = DEFAULT_SETTINGS) {
  const src = input && typeof input === 'object' ? input : {};
  return {
    maxPlayers: clampInt(src.maxPlayers, 2, 20, base.maxPlayers),
    rounds: clampInt(src.rounds, 2, 10, base.rounds),
    drawTime: clampInt(src.drawTime, 15, 240, base.drawTime),
    wordCount: clampInt(src.wordCount, 1, 5, base.wordCount),
    hints: clampInt(src.hints, 0, 5, base.hints),
    wordMode: ['normal', 'hidden', 'combination'].includes(src.wordMode) ? src.wordMode : base.wordMode,
    category: ['all', ...CATEGORY_NAMES].includes(src.category) ? src.category : base.category,
    customWords: Array.isArray(src.customWords)
      ? src.customWords
          .map((w) => String(w).trim().slice(0, 30))
          .filter(Boolean)
          .slice(0, 200)
      : base.customWords,
  };
}

export function sanitizeName(name) {
  const clean = String(name ?? '')
    .replace(/[\u0000-\u001f<>]/g, '')
    .trim()
    .slice(0, 20);
  return clean || `Player${Math.floor(Math.random() * 900 + 100)}`;
}

/**
 * Normalises text for word matching:
 * trim, lowercase, strip accents, collapse whitespace.
 */
export function normalize(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = curr;
  }
  return prev[b.length];
}

/** "Partial" matching: a near-miss that deserves a "is close!" nudge. */
export function isClose(guess, word) {
  if (guess.length < 3 || guess === word) return false;
  if (guess.includes(word) || (guess.length >= 4 && word.includes(guess) && guess.length >= word.length - 2)) {
    return true;
  }
  const dist = levenshtein(guess, word);
  return dist === 1 || (word.length >= 8 && dist === 2);
}
