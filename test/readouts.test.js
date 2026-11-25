import assert from 'node:assert/strict';
import { test } from 'node:test';
import { format, number, readouts } from '../src/readouts.js';

test('numbers and their text', () => {
  assert.equal(number('28,6'), 28.6);
  assert.equal(number('x'), 0);
  assert.equal(format('28.64'), '28.6');
  assert.equal(format('440.2'), '440');
});

test('the lines of the demos give readouts', () => {
  assert.deepEqual(readouts('28.6 kB/s to the board (7.0 s) and 36.9 kB/s back (16.3 s) at the speed of the real board').map((r) => [r.label, r.text]), [['send kB/s', '28.6'], ['load kB/s', '36.9']]);
  assert.deepEqual(readouts('1000 Hz -> the board hears 998 Hz (peak 20000)').map((r) => [r.label, r.text]), [['tone Hz', '998']]);
  assert.deepEqual(readouts('12 frames; the last frequency measured: 880 Hz').map((r) => r.text), ['880']);
  assert.equal(readouts('30 pictures per second, 30000 lamps painted')[0]?.label, 'pictures/s');
});

test('the hash check', () => {
  assert.deepEqual(readouts('SHA-256 MATCH; 2284 of 70000 bytes after deflate').map((r) => [r.text, r.tint]), [['match', 'peach']]);
  assert.deepEqual(readouts('SHA-256 DIFFERENT').map((r) => [r.text, r.tint]), [['differs', 'coral']]);
  assert.deepEqual(readouts('the file is 70000 bytes'), []);
});
