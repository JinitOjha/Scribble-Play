// Categorized word list + helpers for picking word options.

export const CATEGORIES = {
  animals: [
    'cat', 'dog', 'elephant', 'giraffe', 'penguin', 'dolphin', 'octopus', 'kangaroo', 'butterfly', 'spider',
    'snake', 'turtle', 'rabbit', 'horse', 'monkey', 'shark', 'owl', 'bee', 'crab', 'lion',
    'tiger', 'zebra', 'frog', 'duck', 'hedgehog', 'camel', 'bat', 'whale', 'parrot', 'snail',
  ],
  objects: [
    'umbrella', 'bicycle', 'guitar', 'camera', 'clock', 'scissors', 'lamp', 'key', 'candle', 'ladder',
    'glasses', 'backpack', 'telescope', 'hammer', 'headphones', 'mirror', 'suitcase', 'toothbrush', 'balloon', 'trophy',
    'envelope', 'anchor', 'lighthouse', 'compass', 'rocket', 'robot', 'piano', 'television', 'wallet', 'sandwich',
  ],
  food: [
    'pizza', 'banana', 'hamburger', 'ice cream', 'popcorn', 'pancake', 'watermelon', 'broccoli', 'donut', 'cupcake',
    'spaghetti', 'cheese', 'pineapple', 'carrot', 'cookie', 'sushi', 'taco', 'strawberry', 'egg', 'bread',
    'chocolate', 'lollipop', 'hot dog', 'avocado', 'pretzel', 'corn', 'mushroom', 'cherry', 'lemon', 'coffee',
  ],
  actions: [
    'swimming', 'sleeping', 'running', 'dancing', 'singing', 'fishing', 'jumping', 'cooking', 'painting', 'climbing',
    'laughing', 'crying', 'reading', 'skiing', 'surfing', 'hugging', 'sneezing', 'driving', 'flying', 'camping',
    'bowling', 'juggling', 'knitting', 'whistling', 'waving', 'yawning', 'typing', 'sailing', 'skating', 'cycling',
  ],
  places: [
    'beach', 'volcano', 'castle', 'pyramid', 'bridge', 'airport', 'hospital', 'school', 'farm', 'desert',
    'island', 'waterfall', 'igloo', 'circus', 'library', 'museum', 'playground', 'zoo', 'forest', 'cave',
    'windmill', 'skyscraper', 'stadium', 'train station', 'campfire', 'harbor', 'lighthouse', 'jungle', 'barn', 'tent',
  ],
};

export const CATEGORY_NAMES = Object.keys(CATEGORIES);

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function poolFor(settings) {
  const base =
    settings.category && CATEGORIES[settings.category]
      ? CATEGORIES[settings.category]
      : Object.values(CATEGORIES).flat();
  // Host's custom words are mixed into the pool.
  return [...new Set([...base, ...(settings.customWords || [])])];
}

/**
 * Returns `settings.wordCount` word options for the drawer.
 * In "combination" mode every option is two words joined together.
 * Words already used in this game are avoided when possible.
 */
export function pickWordOptions(settings, usedWords = new Set()) {
  const pool = poolFor(settings);
  const fresh = pool.filter((w) => !usedWords.has(w.toLowerCase()));
  const source = fresh.length >= settings.wordCount * 2 ? fresh : pool;
  const shuffled = shuffle(source);
  const count = settings.wordCount;

  if (settings.wordMode === 'combination') {
    const options = [];
    for (let i = 0; i < count; i++) {
      const a = shuffled[(i * 2) % shuffled.length];
      let b = shuffled[(i * 2 + 1) % shuffled.length];
      if (b === a) b = shuffled[(i * 2 + 2) % shuffled.length];
      options.push(`${a} ${b}`);
    }
    return [...new Set(options)];
  }
  return shuffled.slice(0, count);
}
