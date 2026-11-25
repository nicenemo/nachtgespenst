import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RATE, Scope, level, sine, toWave, toneCheck, vu } from '../src/audio.js';

const wave = (/** @type {number} */ hz, /** @type {number} */ amp = 0.6) => toWave(sine(hz, amp, 4800, 48000), 48000);

test('toWave gives 512 samples at 16 kHz', () => {
  const w = wave(440);
  assert.equal(w.length, 512);
  assert.ok(Math.max(...w) > 0.5 * 32767 && Math.min(...w) < -0.5 * 32767);
});

test('the scope finds the frequency of a tone', () => {
  for (const hz of [440, 880, 1500]) {
    const scope = new Scope(80, 47);
    scope.frame(wave(hz));
    assert.ok(Math.abs(scope.lastFreq - hz) <= hz * 0.05, `${hz}: ${scope.lastFreq}`);
    assert.ok(toneCheck(hz, scope.lastFreq, scope.lastPeak).ok);
  }
});

test('the scope sees silence as no tone and a wrong tone fails the check', () => {
  const scope = new Scope(80, 47);
  scope.frame(new Array(512).fill(0));
  assert.equal(scope.lastFreq, 0);
  assert.equal(toneCheck(440, 0, 0).ok, false);
  assert.equal(toneCheck(440, 600, 5000).ok, false);
  assert.equal(toneCheck(440, 430, 5000).note, '440->430');
});

test('the scope picture has the size of the grid and a trace', () => {
  const scope = new Scope(80, 47);
  const pix = scope.frame(wave(1000));
  assert.equal(pix.length, 80 * 47);
  assert.ok(pix.some((c) => c > 0xe00000));
});

test('the VU effect: quiet is dark, loud lights the rows from the bottom', () => {
  assert.ok(vu(0, 0).bar.every((c) => c === 0));
  const loud = vu(20000, 0);
  assert.ok(loud.rows > 4);
  assert.notEqual(loud.bar[4], 0);
  assert.equal(loud.bar[4], loud.bar[5]);
  const decay = vu(0, loud.smooth);
  assert.ok(decay.smooth < loud.smooth && decay.smooth > 0);
  assert.ok(level(wave(440, 0.5)) > 10000 && level(wave(440, 0.01)) < 400);
});

test('the rate of the board', () => assert.equal(RATE, 16000));
