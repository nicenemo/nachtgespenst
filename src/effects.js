// The effects of the lamps, as pure functions of the time: the same maths as the Java demo of the desktop (tools/ng-desktop, lamp/BarEffects and
// lamp/GridEffects), so that the browser draws what the board is sent. Nothing here touches the page.

/** The 16 colours of the C64 (Pepto's palette). */
export const C64 = [0x000000, 0xffffff, 0x68372b, 0x70a4b2, 0x6f3d86, 0x588d43, 0x352879, 0xb8c76f, 0x6f4f25, 0x433900, 0x9a6759, 0x444444, 0x6c6c6c, 0x9ad284, 0x6c5eb5, 0x959595];
const RAMPS = [[6, 14, 3, 1, 3, 14, 6], [2, 10, 7, 1, 7, 10, 2], [5, 13, 7, 1, 7, 13, 5], [4, 14, 15, 1, 15, 14, 4]];
const SCROLL_CYCLE = [6, 14, 3, 1, 3, 14];

/**
 * A colour channel scaled.
 * @param {number} rgb
 * @param {number} f the factor, 0 to 1
 * @returns {number}
 */
export function scale(rgb, f) {
  const k = Math.max(0, Math.min(1, f));
  return (Math.trunc(((rgb >> 16) & 255) * k) << 16) | (Math.trunc(((rgb >> 8) & 255) * k) << 8) | Math.trunc((rgb & 255) * k);
}

/**
 * A colour from hue, saturation and value (all 0 to 1; the hue wraps).
 * @param {number} h
 * @param {number} s
 * @param {number} v
 * @returns {number}
 */
export function hsv(h, s, v) {
  const hue = (h - Math.floor(h)) * 6;
  const i = Math.floor(hue);
  const f = hue - i;
  const p = v * (1 - s);
  const q = v * (1 - s * f);
  const t = v * (1 - s * (1 - f));
  const [r = 0, g = 0, b = 0] = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i % 6] ?? [0, 0, 0];
  return (Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255);
}

/** The lamp of the right side of the bar in a row from the top (lamps 0 to 4 run down). @param {number} row */
const right = (row) => row;
/** The lamp of the left side of the bar in a row from the top (lamps 9 to 5 run down). @param {number} row */
const left = (row) => 9 - row;

/**
 * A pseudo-random generator with a seed, so that the same sparkles come every time.
 * @param {number} seed
 * @returns {() => number} numbers from 0 (inclusive) to 1 (exclusive)
 */
export function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The effects of the LED bar: each gives the ten lamps at the time t (seconds since the start). A fresh state is made per run (sparkle remembers).
 * @typedef {(t: number) => number[]} BarFrame
 * @type {Record<string, () => BarFrame>}
 */
export const BAR_EFFECTS = {
  /** A red scanner that sweeps up and down both sides, with a fading tail. */
  nightrider: () => (t) => {
    const px = new Array(10).fill(0);
    const p = 2 + 2 * Math.sin(t * 3.2);
    for (let r = 0; r < 5; r++) {
      const c = scale(0xff1000, Math.exp(-Math.abs(r - p) * 1.1));
      px[right(r)] = c;
      px[left(r)] = c;
    }
    return px;
  },
  /** All lamps swell and fade slowly, white-blue. */
  breath: () => (t) => {
    const f = (Math.sin(t * 1.6 - Math.PI / 2) + 1) / 2;
    return new Array(10).fill(scale(0x6090ff, 0.05 + 0.95 * f * f));
  },
  /** A rainbow that runs down both sides. */
  rainbow: () => (t) => {
    const px = new Array(10).fill(0);
    for (let r = 0; r < 5; r++) {
      const c = hsv(r / 5 - t * 0.3, 1, 1);
      px[right(r)] = c;
      px[left(r)] = c;
    }
    return px;
  },
  /** A comet with a long tail that runs along the chain: down the right side, round the bottom and up the left side. */
  comet: () => (t) => {
    const p = ((t * 7) % 14) - 2;
    return Array.from({ length: 10 }, (_, i) => (p - i >= 0 ? scale(0x30ffd0, Math.exp(-(p - i) * 0.7)) : 0));
  },
  /** Random lamps flash and fade. */
  sparkle: () => {
    const v = new Array(10).fill(0);
    const rnd = random(3);
    return () => Array.from({ length: 10 }, (_, i) => {
      v[i] *= 0.9;
      if (Math.floor(rnd() * 14) === 0) v[i] = 1;
      return scale(0xffd070, v[i]);
    });
  },
};

/**
 * Copper bars: four coloured bars of seven rows that move over the screen with sines. A row is one colour.
 * @param {number} t
 * @param {number} cols
 * @param {number} rows
 * @returns {number[]} cols x rows colours
 */
export function rasterBars(t, cols, rows) {
  const row = new Array(rows).fill(C64[0]);
  RAMPS.forEach((ramp, k) => {
    const centre = rows / 2 + (rows / 2 - 4) * Math.sin(t * (0.8 + 0.37 * k) + k * 1.9);
    ramp.forEach((colour, j) => {
      const y = Math.round(centre) - Math.trunc(ramp.length / 2) + j;
      if (y >= 0 && y < rows) row[y] = C64[colour] ?? 0;
    });
  });
  return Array.from({ length: cols * rows }, (_, i) => row[Math.floor(i / cols)] ?? 0);
}

/** A 5 x 7 pixel font for the scroller: each glyph is seven rows of five bits. */
const FONT = /** @type {Record<string, number[]>} */ ({
  ' ': [0, 0, 0, 0, 0, 0, 0],
  A: [14, 17, 17, 31, 17, 17, 17], B: [30, 17, 17, 30, 17, 17, 30], C: [14, 17, 16, 16, 16, 17, 14], D: [30, 17, 17, 17, 17, 17, 30],
  E: [31, 16, 16, 30, 16, 16, 31], F: [31, 16, 16, 30, 16, 16, 16], G: [14, 17, 16, 23, 17, 17, 15], H: [17, 17, 17, 31, 17, 17, 17],
  I: [14, 4, 4, 4, 4, 4, 14], J: [7, 2, 2, 2, 2, 18, 12], K: [17, 18, 20, 24, 20, 18, 17], L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17], N: [17, 17, 25, 21, 19, 17, 17], O: [14, 17, 17, 17, 17, 17, 14], P: [30, 17, 17, 30, 16, 16, 16],
  Q: [14, 17, 17, 17, 21, 18, 13], R: [30, 17, 17, 30, 20, 18, 17], S: [15, 16, 16, 14, 1, 1, 30], T: [31, 4, 4, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 17, 17, 14], V: [17, 17, 17, 17, 17, 10, 4], W: [17, 17, 17, 21, 21, 27, 17], X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 10, 4, 4, 4, 4], Z: [31, 1, 2, 4, 8, 16, 31],
  0: [14, 17, 19, 21, 25, 17, 14], 1: [4, 12, 4, 4, 4, 4, 14], 2: [14, 17, 1, 2, 4, 8, 31], 3: [31, 2, 4, 2, 1, 17, 14], 4: [2, 6, 10, 18, 31, 2, 2],
  5: [31, 16, 30, 1, 1, 17, 14], 6: [6, 8, 16, 30, 17, 17, 14], 7: [31, 1, 2, 4, 8, 8, 8], 8: [14, 17, 17, 14, 17, 17, 14], 9: [14, 17, 17, 15, 1, 2, 12],
  '-': [0, 0, 0, 31, 0, 0, 0], '.': [0, 0, 0, 0, 0, 12, 12], ',': [0, 0, 0, 0, 12, 4, 8], '!': [4, 4, 4, 4, 4, 0, 4], '?': [14, 17, 1, 2, 4, 0, 4],
});

/**
 * The text as a bit mask: one row of booleans per pixel row (seven rows), one column of space between the letters.
 * @param {string} text upper case; letters that the font lacks become spaces
 * @returns {boolean[][]}
 */
export function textMask(text) {
  const mask = Array.from({ length: 7 }, () => /** @type {boolean[]} */ ([]));
  for (const ch of text.toUpperCase()) {
    const glyph = FONT[ch] ?? FONT[' '] ?? [];
    for (let y = 0; y < 7; y++) {
      for (let x = 0; x < 5; x++) mask[y]?.push(((glyph[y] ?? 0) >> (4 - x) & 1) === 1);
      mask[y]?.push(false);
    }
  }
  return mask;
}

/**
 * A scrolling text whose columns ride on a sine, in C64 colours that cycle.
 * @param {number} t
 * @param {boolean[][]} m the mask of the text, with room around it
 * @param {number} cols
 * @param {number} rows
 * @returns {number[]}
 */
export function sineScroller(t, m, cols, rows) {
  const h = m.length;
  const w = m[0]?.length ?? 1;
  const px = new Array(cols * rows).fill(C64[0]);
  const x0 = Math.trunc(t * 22) % w;
  for (let x = 0; x < cols; x++) {
    const sx = (x0 + x) % w;
    const dy = Math.round(Math.sin(x * 0.28 + t * 3.1) * (rows / 2 - h / 2 - 1));
    const base = Math.trunc(rows / 2) - Math.trunc(h / 2) + dy;
    for (let j = 0; j < h; j++) {
      const y = base + j;
      if (m[j]?.[sx] && y >= 0 && y < rows) px[y * cols + x] = C64[SCROLL_CYCLE[(Math.trunc(x / 3) + Math.trunc(t * 9) + Math.trunc(j / 3)) % SCROLL_CYCLE.length] ?? 0] ?? 0;
    }
  }
  return px;
}

/**
 * @param {number} n
 * @returns {boolean}
 */
export function isPrime(n) {
  if (n < 2) return false;
  for (let d = 2; d * d <= n; d++) if (n % d === 0) return false;
  return true;
}

/** The first prime from n upwards. @param {number} n */
export function nextPrime(n) {
  let p = n;
  while (!isPrime(p)) p++;
  return p;
}

/** The prime nearest to n. @param {number} n */
export function nearestPrime(n) {
  for (let d = 0; ; d++) {
    if (isPrime(n + d)) return n + d;
    if (n - d > 1 && isPrime(n - d)) return n - d;
  }
}

/**
 * The order in which a dissolve visits the lamps: lamp i gets the rank (i * p) mod m, with m the first prime above the number of lamps and p another
 * prime. Because p and m have no common divisor, the ranks are all different: a permutation of the lamps without a table.
 * @param {number} n the number of lamps
 * @param {number} p the prime
 * @returns {number[]} the lamp indices in the order in which they switch
 */
export function dissolveOrder(n, p) {
  const m = nextPrime(n + 1);
  return Array.from({ length: n }, (_, i) => i).sort((a, b) => ((a * p) % m) - ((b * p) % m));
}
