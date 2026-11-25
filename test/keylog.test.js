import assert from 'node:assert/strict';
import { test } from 'node:test';
import { barColours, bytes, describe, modText, pageImage, pretty, tileRects } from '../src/keylog.js';

test('hex bytes', () => assert.equal(bytes([1, 255, 0]), '01 FF 00'));
test('pretty names', () => {
  assert.equal(pretty('KP_NUM_LOCK_AND_CLEAR'), 'Keypad Num Lock / Clear');
  assert.equal(pretty('ID_7_AND_AMPERSAND'), '7 / &');
});
test('Meh and Hyper', () => {
  assert.equal(modText(0x07), 'Meh');
  assert.equal(modText(0x0f), 'Hyper');
  assert.equal(modText(0x03), 'Ctrl+Shift');
});
test('a keyboard chord is report 1', () => {
  const d = describe([7, 5, 3, 'B', null]);
  assert.equal(d?.text, 'Ctrl+Shift+B');
  assert.deepEqual(d?.down, [1, [3, 0, 5, 0, 0, 0, 0, 0]]);
});
test('Power Down and Sleep are blocked, Wake Up is not', () => {
  assert.equal(describe([1, 0x81, 0, 'SYS_POWER_DOWN', null])?.blocked, true);
  assert.equal(describe([1, 0x82, 0, 'SYS_SLEEP', null])?.blocked, true);
  assert.equal(describe([1, 0x83, 0, 'SYS_WAKE_UP', null])?.blocked, false);
});
test('tiles stay inside the screen and do not overlap', () => {
  const layer = { title: 't', rows: 3, cols: 4, color: '#112233', tiles: Array.from({ length: 12 }, () => /** @type {any} */ ([7, 4, 0, 'A', null])) };
  const rects = tileRects(layer);
  assert.equal(rects.length, 12);
  for (const r of rects) assert.ok(r.x + r.w <= 320 && r.y + r.h <= 202);
  for (const a of rects) {for (const b of rects) {
    if (a !== b) assert.ok(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
  }}
});
test('LED bar follows the rule of the firmware', () => {
  const colours = [[255, 80, 0], [0, 220, 60], [40, 80, 255]];
  assert.deepEqual(barColours(3, 0, '#102030', colours)[7], [16, 32, 48]);
  assert.deepEqual(barColours(26, 0, '#000000', colours).flat().filter(Boolean), []);
  const caps = barColours(26, 1, '#000000', colours);
  assert.deepEqual([caps[0], caps[1], caps[2]], [[255, 80, 0], [255, 80, 0], [0, 0, 0]]);
  assert.deepEqual(barColours(26, 5, '#000000', colours)[9], [255, 160, 255]);
});
test('page images', () => {
  assert.equal(pageImage(3, 0), 'img/lvgl/s3-03.png');
  assert.equal(pageImage(26, 5), 'img/lvgl/s3-26-101.png');
});
