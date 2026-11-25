// The demos of the desktop app, in the browser: each one drives the lamps of the fake board (and so the "lamps on the PC" panel). A demo is an async
// function that waits with ctx.sleep, which stops when the user presses Stop. The effects are those of effects.js, the file transfer that of disk.js, the
// microphone demos those of audio.js. Nothing here touches the page: the page gives the context.

import { Scope, level, toneCheck, vu } from './audio.js';
import { paintBytes, runDisk, standInBook } from './disk.js';
import { PHOTOS } from './photos.js';
import { BAR_EFFECTS, C64, dissolveOrder, nearestPrime, nextPrime, rasterBars, sineScroller, textMask } from './effects.js';

/**
 * What a demo can use.
 * @typedef {object} Context
 * @property {ReturnType<typeof import('./lamps.js').createLamps>} lamps
 * @property {(line: string) => void} log
 * @property {(ms: number) => Promise<void>} sleep waits; rejects with an AbortError when the demo is stopped
 * @property {number} seconds the seconds of each effect
 * @property {{go: (page: number) => void, pages: number}} device the pages of the fake board
 * @property {{tones: (list: number[], seconds: number) => Promise<void>, wave: () => number[], stop: () => void, source: () => string} | undefined} [audio] the sound, when the page has it
 * @property {(text: string) => void} [progress] a short status for the page
 * @property {((result: import('./disk.js').DiskResult) => void) | undefined} [recordDisk] tells the shell what the last file transfer did
 * @property {((cols: number, rows: number) => Promise<number[][] | null>) | undefined} [photos] the five photographs as grids of lamps; without them the demo draws its own scenes
 */

/**
 * One demo in the popup.
 * @typedef {object} Demo
 * @property {string} id the name that a slide uses, for example bar:comet
 * @property {string} label
 * @property {'cycle' | 'parts' | 'microphone' | 'bar' | 'board' | 'grid' | 'photos'} group
 * @property {(ctx: Context) => Promise<string>} run returns the one-line result
 */

const FRAME_MS_BAR = 16;
const FRAME_MS_GRID = 33;

/**
 * Runs frames of an effect until the time is up.
 * @param {Context} ctx
 * @param {number} seconds
 * @param {number} frameMs
 * @param {(t: number) => void} paint
 */
async function frames(ctx, seconds, frameMs, paint) {
  const t0 = performance.now();
  for (;;) {
    const t = (performance.now() - t0) / 1000;
    if (t >= seconds) return;
    paint(t);
    await ctx.sleep(frameMs);
  }
}

/** @param {Context} ctx @param {string} name */
async function barEffect(ctx, name) {
  ctx.device.go(ctx.device.pages - 1);
  ctx.lamps.barPage();
  ctx.log(`bar: ${name}`);
  const frame = BAR_EFFECTS[name]?.();
  if (!frame) throw new Error(`no bar effect ${name}`);
  await frames(ctx, ctx.seconds, FRAME_MS_BAR, (t) => ctx.lamps.setBar(frame(t)));
  return name;
}

/** @param {Context} ctx @param {string} name */
async function boardEffect(ctx, name) {
  ctx.device.go(0);
  ctx.log(`the board runs ${name} on its own (the lamps are not used)`);
  const frame = BAR_EFFECTS[name]?.();
  if (!frame) throw new Error(`no bar effect ${name}`);
  await frames(ctx, ctx.seconds, FRAME_MS_BAR, (t) => ctx.lamps.setBar(frame(t)));
  ctx.lamps.clear();
  return `${name} on the board`;
}

/** @param {Context} ctx @param {'raster bars' | 'sine scroller'} which */
async function gridEffect(ctx, which) {
  ctx.device.go(ctx.device.pages - 2);
  const cols = 40;
  const rows = 25;
  ctx.lamps.setGrid(new Array(cols * rows).fill(C64[0]), cols, rows);
  ctx.log(`grid 40 x 25, the 16 C64 colours: ${which}`);
  const t0 = performance.now();
  let count = 0;
  if (which === 'raster bars') {
    await frames(ctx, ctx.seconds, FRAME_MS_GRID, (t) => { ctx.lamps.setGrid(rasterBars(t, cols, rows), cols, rows); count++; });
  } else {
    const mask = textMask('      NACHTGESPENST - ONE HID LAMPARRAY, TWO BOARDS - TWENTY THOUSAND LEAGUES UNDER THE SEA - GREETINGS FROM THE LAMPS      ');
    await frames(ctx, ctx.seconds * 1.5, FRAME_MS_GRID, (t) => { ctx.lamps.setGrid(sineScroller(t, mask, cols, rows), cols, rows); count++; });
  }
  const sec = (performance.now() - t0) / 1000;
  ctx.log(`${Math.round(count / sec)} pictures per second, ${count * cols * rows} lamps painted`);
  return `${which}: ${count} pictures`;
}

/** The five pictures of the dissolve: scenes that are drawn here, so nothing has to be downloaded. @param {number} cols @param {number} rows @returns {number[][]} */
export function scenes(cols, rows) {
  /** @type {Array<(x: number, y: number) => number>} */
  const makers = [
    (x, y) => { const sky = Math.round(70 + 150 * (1 - y)); const sun = Math.hypot(x - 0.7, y - 0.35) < 0.12; return sun ? 0xffe060 : (Math.round(sky * 0.4) << 16) | (Math.round(sky * 0.6) << 8) | sky; },
    (x, y) => (Math.floor(x * 8) + Math.floor(y * 8)) % 2 === 0 ? 0xf0f0f0 : 0x203050,
    (x, y) => { const v = Math.round(128 + 127 * Math.sin(x * 12 + Math.sin(y * 9))); return (v << 16) | (Math.round(v * 0.5) << 8) | (255 - v); },
    (x, y) => { const d = Math.hypot(x - 0.5, y - 0.5); return d < 0.4 && d > 0.28 ? 0xff7040 : d < 0.18 ? 0x40c0ff : 0x101820; },
    (x, y) => { const g = Math.round(255 * (x + y) / 2); return (g << 16) | (Math.round(255 - g) << 8) | 0x80; },
  ];
  return makers.map((make) => Array.from({ length: cols * rows }, (_, i) => make((i % cols) / cols, Math.floor(i / cols) / rows)));
}

/** @param {Context} ctx @param {number} cols @param {number} rows */
async function photos(ctx, cols, rows) {
  ctx.device.go(ctx.device.pages - 2);
  const real = await ctx.photos?.(cols, rows);
  const pics = real ?? scenes(cols, rows);
  if (real) PHOTOS.forEach((p, i) => ctx.log(`photo ${i + 1}: ${p.title}, ${p.author}, ${p.licence}`));
  else ctx.log('the photographs are not available here: five pictures that are drawn instead');
  const lamps = cols * rows;
  const m = nextPrime(lamps + 1);
  const primes = [7, 31, nearestPrime(Math.round(m * 0.618)), 97, 211];
  ctx.log(`${cols} x ${rows} lamps (${lamps}), modulus m = ${m}`);
  ctx.lamps.setGrid(pics[0] ?? [], cols, rows);
  await ctx.sleep(1000);
  const note = [];
  for (let i = 1; i <= pics.length; i++) {
    const p = primes[(i - 1) % primes.length] ?? 7;
    const from = pics[(i - 1) % pics.length] ?? [];
    const to = pics[i % pics.length] ?? [];
    const order = dissolveOrder(lamps, p);
    const current = [...from];
    const step = Math.max(1, Math.ceil(lamps / 60));
    const t0 = performance.now();
    for (let done = 0; done < lamps; done += step) {
      for (let k = done; k < Math.min(lamps, done + step); k++) current[order[k] ?? 0] = to[order[k] ?? 0] ?? 0;
      ctx.lamps.setGrid(current, cols, rows);
      await ctx.sleep(30);
    }
    const sec = (performance.now() - t0) / 1000;
    ctx.log(`photo ${((i - 1) % pics.length) + 1} -> ${(i % pics.length) + 1}, p = ${p}: ${sec.toFixed(2)} s`);
    note.push(`p=${p}`);
    await ctx.sleep(900);
  }
  return note.join(' ');
}

/** @param {Context} ctx @param {boolean} fast */
async function disk(ctx, fast) {
  ctx.device.go(ctx.device.pages - 3);
  const cols = 32;
  const rows = 32;
  const px = new Array(cols * rows).fill(0);
  ctx.lamps.setGrid(px, cols, rows);
  ctx.log(`Disk: SAVE to the board, then LOAD back${fast ? ' (fast mode: no sound, no display pauses)' : ''}`);
  ctx.log('the file is a stand-in of 620 000 bytes made here, about the size of the book: the lamps carry its compressed bytes, the keys F13 to F24 are the answers of the board');
  let at = 0;
  const result = await runDisk(standInBook(620000), {
    log: (l) => ctx.log(l),
    frame: (stage, fraction, bytes) => {
      if (stage === 'load') at = 0;
      at = paintBytes(px, bytes, at);
      ctx.lamps.setGrid(px, cols, rows);
      ctx.progress?.(`${stage === 'save' ? 'SAVE' : 'LOAD'} ${Math.round(fraction * 100)} %`);
    },
    wait: (ms) => ctx.sleep(fast ? 0 : ms / 2),
  });
  ctx.progress?.(result.match ? 'SHA-256 MATCH' : 'SHA-256 DIFFERENT');
  ctx.log(`SHA-256 ${result.match ? 'MATCH' : 'DIFFERENT'}; ${result.packed} of ${result.size} bytes after deflate`);
  ctx.log(`${(result.packed / 1000 / result.saveSeconds).toFixed(1)} kB/s to the board (${result.saveSeconds.toFixed(1)} s) and ${(result.size / 1000 / result.loadSeconds).toFixed(1)} kB/s back (${result.loadSeconds.toFixed(1)} s) at the speed of the real board; shown at twice that speed${fast ? ', or as fast as the browser goes' : ''}`);
  ctx.recordDisk?.(result);
  if (!result.match) throw new Error('the hashes differ');
  return `SHA-256 match, ${result.errors} errors`;
}

const TONES = [440, 1000, 2000];

/** @param {Context} ctx */
async function scope(ctx) {
  const audio = ctx.audio;
  if (!audio) throw new Error('this page has no sound');
  ctx.device.go(ctx.device.pages - 2);
  const cols = 80;
  const rows = 47;
  const sc = new Scope(cols, rows);
  ctx.log(`the board listens and sends the waveform over the game pad; the oscilloscope is painted on the lamps (the PC plays 440, 880 and 1500 Hz, ${audio.source()})`);
  const playing = audio.tones([440, 880, 1500], 3);
  let frameCount = 0;
  let last = 0;
  let done = false;
  playing.finally(() => { done = true; });
  while (!done) {
    ctx.lamps.setGrid(sc.frame(audio.wave()), cols, rows);
    frameCount++;
    if (sc.lastFreq > 0) last = sc.lastFreq;
    await ctx.sleep(75);
  }
  ctx.log(`${frameCount} frames; the last frequency measured: ${Math.round(last)} Hz`);
  return `${frameCount} scope frames, painted on the lamps`;
}

/** @param {Context} ctx */
async function vuMeter(ctx) {
  const audio = ctx.audio;
  if (!audio) throw new Error('this page has no sound');
  ctx.device.go(0);
  ctx.log('the vu meter on the bar follows the microphone; the PC plays tones of 440, 1000 and 2000 Hz');
  const probe = new Scope(160, 95);
  const notes = [];
  let smooth = 0;
  for (const hz of TONES) {
    const playing = audio.tones([hz], 2.2);
    let done = false;
    playing.finally(() => { done = true; });
    let probed = false;
    const t0 = performance.now();
    while (!done) {
      const wave = audio.wave();
      const v = vu(level(wave), smooth);
      smooth = v.smooth;
      ctx.lamps.setBar(v.bar);
      if (!probed && performance.now() - t0 > 1000) {
        probed = true;
        probe.frame(wave);
        ctx.log(`${hz} Hz: the board hears about ${Math.round(probe.lastFreq)} Hz (from its waveform, peak ${probe.lastPeak})`);
        notes.push(toneCheck(hz, probe.lastFreq, probe.lastPeak).note);
      }
      await ctx.sleep(FRAME_MS_BAR);
    }
  }
  ctx.lamps.clear();
  return `microphone: ${notes.join(' ')}`;
}

/** @param {Context} ctx */
async function micCheck(ctx) {
  const audio = ctx.audio;
  if (!audio) throw new Error('this page has no sound');
  ctx.device.go(0);
  ctx.log('microphone check: the PC plays tones, the board has to hear the same frequencies');
  const probe = new Scope(80, 47);
  let ok = 0;
  const notes = [];
  for (const hz of TONES) {
    const playing = audio.tones([hz], 2.2);
    await ctx.sleep(1100);
    probe.frame(audio.wave());
    const result = toneCheck(hz, probe.lastFreq, probe.lastPeak);
    ctx.log(`${result.ok ? 'PASS' : 'FAIL'}  ${hz} Hz -> the board hears ${Math.round(result.heard)} Hz (peak ${result.peak})`);
    if (result.ok) ok++;
    notes.push(result.note);
    await playing;
    await ctx.sleep(300);
  }
  return `${ok} of ${TONES.length} tones heard right: ${notes.join(' ')}`;
}

/** @param {Context} ctx */
async function pages(ctx) {
  for (let p = 0; p < ctx.device.pages; p++) {
    ctx.device.go(p);
    await ctx.sleep(p >= ctx.device.pages - 2 ? 250 : 650);
  }
  return `${ctx.device.pages} pages`;
}

/** The demos in the order of the popup. @type {Demo[]} */
export const DEMOS = [
  { id: 'pages', label: 'Walk through all pages', group: 'parts', run: pages },
  { id: 'disk', label: 'A file to the board and back', group: 'parts', run: (ctx) => disk(ctx, false) },
  { id: 'diskfast', label: 'The same, fast mode', group: 'parts', run: (ctx) => disk(ctx, true) },
  { id: 'scope', label: 'Oscilloscope on the lamps', group: 'microphone', run: scope },
  { id: 'vu', label: 'Vu meter on the LED bar', group: 'microphone', run: vuMeter },
  { id: 'miccheck', label: 'Microphone check', group: 'microphone', run: micCheck },
  ...Object.keys(BAR_EFFECTS).map((name) => /** @type {Demo} */ ({ id: `bar:${name}`, label: name.charAt(0).toUpperCase() + name.slice(1), group: 'bar', run: (/** @type {Context} */ ctx) => barEffect(ctx, name) })),
  { id: 'bars', label: 'All of them', group: 'bar', run: async (ctx) => { for (const name of Object.keys(BAR_EFFECTS)) await barEffect(ctx, name); return `${Object.keys(BAR_EFFECTS).length} effects`; } },
  ...Object.keys(BAR_EFFECTS).map((name) => /** @type {Demo} */ ({ id: `board:${name}`, label: name.charAt(0).toUpperCase() + name.slice(1), group: 'board', run: (/** @type {Context} */ ctx) => boardEffect(ctx, name) })),
  { id: 'grid:raster bars', label: 'Raster bars', group: 'grid', run: (ctx) => gridEffect(ctx, 'raster bars') },
  { id: 'grid:sine scroller', label: 'Sine scroller', group: 'grid', run: (ctx) => gridEffect(ctx, 'sine scroller') },
  { id: 'photos', label: 'Slideshow of five photos', group: 'photos', run: (ctx) => photos(ctx, 160, 95) },
];

/**
 * Looks a demo up by the name a slide uses.
 * @param {string} id
 * @returns {Demo | undefined}
 */
export function demoById(id) {
  return DEMOS.find((d) => d.id === id);
}

/**
 * One round of everything: the pages, the file transfer, the bar, the grid and the pictures, and the microphone parts when asked for.
 * @param {Context} ctx
 * @param {{fast: boolean, mic: boolean}} options
 * @returns {Promise<string>}
 */
export async function cycle(ctx, options) {
  const plan = ['pages', 'disk', ...(options.fast ? ['diskfast'] : []), 'bars', 'grid:raster bars', 'grid:sine scroller', 'photos', ...(options.mic ? ['scope', 'miccheck'] : [])];
  for (const id of plan) {
    ctx.log(`--- ${id}`);
    await demoById(id)?.run(ctx);
  }
  return `${plan.length} parts`;
}

/**
 * Starts demos one at a time and stops them on request.
 * @param {() => Omit<Context, 'sleep'>} makeContext
 * @param {{onStart: (label: string) => void, onEnd: (note: string) => void}} hooks
 * @returns {{start: (id: string) => boolean, startCycle: (options: {fast: boolean, mic: boolean}) => boolean, stop: () => void, running: () => boolean}}
 */
export function createRunner(makeContext, hooks) {
  /** @type {AbortController | null} */
  let current = null;

  /** @param {string} label @param {(ctx: Context) => Promise<string>} body */
  function launch(label, body) {
    if (current) return false;
    const controller = new AbortController();
    current = controller;
    const base = makeContext();
    /** @type {Context} */
    const ctx = {
      ...base,
      sleep: (ms) => new Promise((resolve, reject) => {
        if (controller.signal.aborted) {
          reject(new DOMException('stopped', 'AbortError'));
          return;
        }
        const timer = setTimeout(resolve, ms);
        controller.signal.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new DOMException('stopped', 'AbortError'));
        }, { once: true });
      }),
    };
    hooks.onStart(label);
    body(ctx)
      .then((note) => hooks.onEnd(note), (error) => hooks.onEnd(error instanceof DOMException && error.name === 'AbortError' ? 'stopped' : `failed: ${error}`))
      .finally(() => {
        base.audio?.stop();
        current = null;
      });
    return true;
  }

  return {
    start(id) {
      const demo = demoById(id);
      return demo ? launch(demo.label, demo.run) : false;
    },
    startCycle(options) {
      return launch('the cycle', (ctx) => cycle(ctx, options));
    },
    stop() { current?.abort(); },
    running: () => current !== null,
  };
}
