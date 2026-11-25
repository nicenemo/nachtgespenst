import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BAR_EFFECTS, C64, dissolveOrder, hsv, nearestPrime, nextPrime, rasterBars, scale, sineScroller, textMask } from '../src/effects.js';
import { barPosition, createLamps, fitPicture, sideColours } from '../src/lamps.js';

test('scale and hsv', () => {
  assert.equal(scale(0xff8040, 0.5), 0x7f4020);
  assert.equal(scale(0xffffff, 2), 0xffffff);
  assert.equal(hsv(0, 1, 1), 0xff0000);
  assert.equal(hsv(1 / 3, 1, 1), 0x00ff00);
  assert.equal(hsv(1.0 + 2 / 3, 1, 1), 0x0000ff);
});

test('every bar effect gives ten lamps and changes over time', () => {
  for (const [name, make] of Object.entries(BAR_EFFECTS)) {
    const frame = make();
    const a = frame(0.5);
    const b = frame(1.7);
    assert.equal(a.length, 10, name);
    assert.ok(a.every((c) => c >= 0 && c <= 0xffffff), name);
    assert.notDeepEqual(a, b, name);
  }
});

test('nightrider is symmetric between the two sides, the comet follows the chain', () => {
  const n = BAR_EFFECTS.nightrider?.()(0.3) ?? [];
  for (let r = 0; r < 5; r++) assert.equal(n[r], n[9 - r]);
  const c = BAR_EFFECTS.comet?.()(0.5) ?? [];
  assert.ok((c[0] ?? 0) > (c[5] ?? 0));
});

test('sparkle is the same every time (a fixed seed)', () => {
  const first = BAR_EFFECTS.sparkle?.();
  const second = BAR_EFFECTS.sparkle?.();
  assert.deepEqual(first?.(0), second?.(0));
  assert.deepEqual(first?.(0.1), second?.(0.1));
});

test('raster bars paint whole rows in C64 colours', () => {
  const px = rasterBars(1.3, 40, 25);
  assert.equal(px.length, 1000);
  for (let y = 0; y < 25; y++) assert.equal(new Set(px.slice(y * 40, y * 40 + 40)).size, 1, `row ${y}`);
  assert.ok(px.every((c) => C64.includes(c)));
  assert.ok(new Set(px).size > 4);
});

test('the sine scroller draws text and moves', () => {
  const mask = textMask('      NACHTGESPENST      ');
  assert.equal(mask.length, 7);
  const a = sineScroller(0.1, mask, 40, 25);
  const b = sineScroller(0.6, mask, 40, 25);
  assert.ok(a.some((c) => c !== C64[0]));
  assert.notDeepEqual(a, b);
  assert.ok(a.every((c) => C64.includes(c)));
});

test('the dissolve visits every lamp exactly once', () => {
  for (const p of [7, 31, nearestPrime(Math.round(nextPrime(1001) * 0.618)), 97]) {
    const order = dissolveOrder(1000, p);
    assert.equal(new Set(order).size, 1000, `p ${p}`);
  }
  assert.equal(nextPrime(1001), 1009);
});

test('the lamp state tells its listeners, and counts', () => {
  const lamps = createLamps();
  /** @type {number[][]} */
  const seen = [];
  const stop = lamps.subscribe((s) => seen.push(s.bar));
  lamps.setBar([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  stop();
  lamps.setBar(new Array(10).fill(0));
  assert.equal(seen.length, 1);
  assert.equal(lamps.counters().frames, 2);
  lamps.setGrid([1, 2, 3, 4], 2, 2);
  assert.equal(lamps.snapshot().grid?.cols, 2);
  lamps.barPage();
  assert.equal(lamps.snapshot().grid, null);
  assert.equal(lamps.snapshot().barPage, true);
});

test('the bar lamps: 0 to 4 run down the right, 5 to 9 up the left', () => {
  assert.deepEqual(barPosition(0), { side: 'right', row: 0 });
  assert.deepEqual(barPosition(4), { side: 'right', row: 4 });
  assert.deepEqual(barPosition(5), { side: 'left', row: 4 });
  assert.deepEqual(barPosition(9), { side: 'left', row: 0 });
  assert.deepEqual(sideColours([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 'left'), [9, 8, 7, 6, 5]);
});

test('the lamp picture keeps the aspect of the grid', () => {
  const r = fitPicture(400, 400, { cols: 40, rows: 25 });
  assert.ok(Math.abs(r.w / r.h - 40 / 25) < 1e-9);
  assert.ok(r.w <= 400 && r.h <= 400);
  const wide = fitPicture(800, 100, { cols: 40, rows: 25 });
  assert.equal(wide.h, 100);
});
