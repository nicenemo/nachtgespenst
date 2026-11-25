// The audio demos without a sound card: the oscilloscope on the lamps, the VU meter on the LED bar and the tone check are plain functions of a buffer of samples,
// the same maths as the Java demo (lamp/Scope.java, demo/ToneCheck.java) and the firmware (BarFx.cpp). The page gets the samples from Web Audio (audioweb.js).

/** The sample rate of the waveform that the board sends: 512 samples at 16 kHz. */
export const RATE = 16000;
export const WAVE_SAMPLES = 512;

/**
 * Brings a buffer of floats (-1 to 1, any rate) to what the board sends: the last 512 samples at 16 kHz as whole numbers of 16 bits.
 * @param {ArrayLike<number>} samples
 * @param {number} rate the rate of the buffer
 * @returns {number[]}
 */
export function toWave(samples, rate) {
  const step = rate / RATE;
  const out = [];
  const last = samples.length - 1;
  for (let i = WAVE_SAMPLES - 1; i >= 0; i--) {
    const pos = last - i * step;
    const i0 = Math.max(0, Math.floor(pos));
    const f = pos - i0;
    const a = samples[i0] ?? 0;
    const b = samples[Math.min(last, i0 + 1)] ?? a;
    out.push(Math.round(Math.max(-1, Math.min(1, a * (1 - f) + b * f)) * 32767));
  }
  return out;
}

/**
 * A sine as samples.
 * @param {number} hz
 * @param {number} amplitude 0 to 1
 * @param {number} count
 * @param {number} rate
 * @param {number} [phase] in radians
 * @returns {number[]}
 */
export function sine(hz, amplitude, count, rate, phase = 0) {
  return Array.from({ length: count }, (_, i) => amplitude * Math.sin(phase + (2 * Math.PI * hz * i) / rate));
}

/**
 * The level of a wave as the firmware measures it (the root mean square of the samples, 0 to 32768).
 * @param {number[]} wave
 * @returns {number}
 */
export function level(wave) {
  return Math.sqrt(wave.reduce((sum, v) => sum + v * v, 0) / Math.max(1, wave.length));
}

/**
 * The VU effect of the bar: the level in rows lit from the bottom on both sides (-60 dB quiet room to -20 dB loud), a quick attack and a slow release.
 * @param {number} rms the level, 0 to 32768
 * @param {number} smooth the smoothed height of the last frame, 0 to 5
 * @returns {{bar: number[], smooth: number, rows: number}} ten lamps and the new smoothed height
 */
export function vu(rms, smooth) {
  const db = rms > 0 ? 20 * Math.log10(Math.max(rms, 1) / 32768) : -90;
  const x = Math.max(0, Math.min(5, ((db + 60) / 40) * 5));
  const now = x > smooth ? x : smooth * 0.85 + x * 0.15;
  const bar = new Array(10).fill(0);
  const colours = [0xff0000, 0xffa000, 0x00ff28, 0x00ff28, 0x00ff28];
  for (let r = 0; r < 5; r++) {
    const lit = Math.max(0, Math.min(1, now - (4 - r)));
    const c = colours[r] ?? 0;
    const shade = (((c >> 16) & 255) * lit << 16) | (((c >> 8) & 255) * lit << 8) | ((c & 255) * lit);
    const rounded = ((Math.trunc((shade >> 16) & 255)) << 16) | (Math.trunc((shade >> 8) & 255) << 8) | Math.trunc(shade & 255);
    bar[r] = rounded;
    bar[9 - r] = rounded;
  }
  return { bar, smooth: now, rows: now };
}

/**
 * What the board made of a tone: heard within 10 % of the tone, with a wave that is more than noise.
 * @param {number} hz
 * @param {number} heard
 * @param {number} peak
 * @returns {{hz: number, heard: number, peak: number, ok: boolean, note: string}}
 */
export function toneCheck(hz, heard, peak) {
  return { hz, heard, peak, ok: Math.abs(heard - hz) <= hz * 0.1 && peak > 80, note: `${hz}->${Math.round(heard)}` };
}

const GLYPHS = /** @type {Record<string, string>} */ ({
  0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111', 4: '101101111001001', 5: '111100111001111',
  6: '111100111101111', 7: '111001001001001', 8: '111101111101111', 9: '111101111001111', H: '101101111101101', Z: '111001010100111',
  M: '101111111101101', S: '111100111001111', N: '101101101101101', O: '111101101101111', T: '111010010010010', E: '111100110100111',
  A: '010101111101101', '.': '000000000000010', '-': '000000111000000', K: '101101110101101', V: '101101101101010', P: '111101111100100', ' ': '000000000000000',
});

/** An oscilloscope on a grid of lamps: a trigger on a rising zero crossing, about three periods, automatic gain, a fading trace and a graticule. */
export class Scope {
  /**
   * @param {number} cols
   * @param {number} rows
   */
  constructor(cols, rows) {
    this.cols = cols;
    this.rows = rows;
    this.glow = new Float32Array(cols * rows);
    /** @type {number[]} */
    this.pix = new Array(cols * rows).fill(0);
    this.lastFreq = 0;
    this.lastSpanMs = 0;
    this.lastPeak = 0;
  }

  /**
   * Draws one frame for a wave (512 samples at 16 kHz).
   * @param {number[]} v
   * @returns {number[]} the picture, cols x rows colours
   */
  frame(v) {
    const { cols, rows, glow, pix } = this;
    const n = v.length;
    let peak = 1;
    for (const s of v) peak = Math.max(peak, Math.abs(s));
    /** @type {number[]} */
    const cross = [];
    for (let i = 1; i < n - 8; i++) {
      if ((v[i - 1] ?? 0) < 0 && (v[i] ?? 0) >= 0) {
        let hi = 0;
        for (let k = i; k < Math.min(n, i + 10); k++) hi = Math.max(hi, v[k] ?? 0);
        if (hi > Math.max(40, peak / 4)) cross.push(i);
      }
    }
    const first = cross[0] ?? 0;
    const lastCross = cross.at(-1) ?? 0;
    const freq = cross.length >= 2 ? (RATE * (cross.length - 1)) / (lastCross - first) : 0;
    let span = freq > 0 ? Math.trunc(Math.max(48, Math.min(300, (3 * RATE) / freq))) : 200;
    let trig = 0;
    for (const t of cross) {
      if (t + span < n) {
        trig = t;
        break;
      }
    }
    if (trig + span >= n) span = n - trig - 1;
    this.lastFreq = freq;
    this.lastSpanMs = (span * 1000) / RATE;
    this.lastPeak = peak;
    let seen = 1;
    for (let i = trig; i <= trig + span && i < n; i++) seen = Math.max(seen, Math.abs(v[i] ?? 0));
    const gain = (rows * 0.4) / Math.max(80, seen);

    for (let i = 0; i < glow.length; i++) glow[i] = (glow[i] ?? 0) * 0.62;
    let prev = -1;
    for (let x = 0; x < cols; x++) {
      const pos = trig + (x * (span - 1)) / (cols - 1);
      const i0 = Math.trunc(pos);
      const f = pos - i0;
      const i1 = Math.min(n - 1, i0 + 1);
      const val = (v[i0] ?? 0) * (1 - f) + (v[i1] ?? 0) * f;
      const y = Math.max(0, Math.min(rows - 1, Math.round(rows / 2 - val * gain)));
      const a = prev < 0 ? y : prev;
      for (let yy = Math.min(a, y); yy <= Math.max(a, y); yy++) glow[yy * cols + x] = 1;
      prev = y;
    }
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const g = Math.trunc(Math.min(1, glow[y * cols + x] ?? 0) * 255);
        pix[y * cols + x] = g > 8 ? trace(glow[y * cols + x] ?? 0) : this.graticule(x, y);
      }
    }
    this.text(0, 1, freq > 0 ? `${Math.round(freq)}HZ` : 'NO TONE', 0xffcc99);
    const right = `${this.lastSpanMs.toFixed(1)}MS`;
    this.text(cols - 4 * right.length - 1, 1, right, 0x9999ff);
    return pix;
  }

  /**
   * 8 x 8 divisions: dotted lines, brighter axes with a tick every four lamps, on black.
   * @param {number} x
   * @param {number} y
   * @returns {number}
   */
  graticule(x, y) {
    const cx = Math.trunc(this.cols / 2);
    const cy = Math.trunc(this.rows / 2);
    if (y === cy) return x % 4 === 0 ? 0x4a4a8c : 0x2e2e58;
    if (x === cx) return y % 4 === 0 ? 0x4a4a8c : 0x2e2e58;
    const vline = x % Math.trunc(this.cols / 8) === 0;
    const hline = y % Math.max(1, Math.trunc(this.rows / 8)) === 0;
    return (vline && y % 2 === 0) || (hline && x % 2 === 0) ? 0x16162c : 0;
  }

  /**
   * A text in the 3 x 5 font.
   * @param {number} x0
   * @param {number} y0
   * @param {string} s
   * @param {number} rgb
   */
  text(x0, y0, s, rgb) {
    [...s].forEach((ch, ci) => {
      const g = GLYPHS[ch];
      if (!g) return;
      for (let k = 0; k < 15; k++) {
        const x = x0 + ci * 4 + (k % 3);
        const y = y0 + Math.trunc(k / 3);
        if (g[k] === '1' && x >= 0 && x < this.cols && y >= 0 && y < this.rows) this.pix[y * this.cols + x] = rgb;
      }
    });
  }
}

/**
 * The colour of the trace: amber where it fades, through peach to a near white core where it is fresh.
 * @param {number} g
 * @returns {number}
 */
function trace(g) {
  const gg = Math.min(1, g);
  const k = Math.max(0, (gg - 0.55) / 0.45);
  const d = Math.sqrt(gg);
  const r = Math.trunc(255 * d);
  const gr = Math.trunc(153 * d + (240 - 153) * k * d);
  const b = Math.trunc(232 * k * k * d);
  return (r << 16) | (Math.min(255, gr) << 8) | Math.min(255, b);
}
