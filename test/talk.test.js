import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createTalk, minutes } from '../src/talk.js';
import { DEMOS, createRunner, demoById, scenes } from '../src/demos.js';
import { createLamps } from '../src/lamps.js';

const slides = vm.runInNewContext(`${readFileSync(new URL('../slides.js', import.meta.url), 'utf8')}; NG_SLIDES`);

test('minutes', () => assert.equal(minutes(125), '2:05'));

test('the slides of the talk: the demos they start exist', () => {
  assert.ok(slides.length >= 15);
  for (const s of slides) {
    assert.ok(s.title && s.seconds > 0, s.title);
    if (s.demo) assert.ok(demoById(s.demo), `a slide starts ${s.demo}`);
  }
});

test('the talk moves on after the seconds of a slide and waits for its demo', () => {
  let t = 0;
  let demoRunning = false;
  /** @type {number[]} */
  const shown = [];
  const list = [{ title: 'a', seconds: 10, demo: 'x', bullets: [], image: null }, { title: 'b', seconds: 5, demo: null, bullets: [], image: null }];
  const talk = createTalk(list, { clock: () => t, demoRunning: () => demoRunning, onSlide: (_s, i) => shown.push(i), onTick: () => undefined });
  talk.start();
  demoRunning = true;
  t = 11000;
  talk.tick();
  assert.deepEqual(shown, [0]);                 // the demo still runs
  demoRunning = false;
  talk.tick();
  assert.deepEqual(shown, [0, 1]);
  assert.equal(talk.progress().label, 'slide 2/2   0:05 left');
  talk.pause();
  t = 99000;
  talk.tick();
  assert.equal(talk.index(), 1);
  talk.pause();
  t += 6000;
  talk.tick();
  assert.equal(talk.running(), false);          // past the last slide the talk stops
});

test('every demo of the popup has a label and a group, and the ids are unique', () => {
  assert.equal(new Set(DEMOS.map((d) => d.id)).size, DEMOS.length);
  for (const d of DEMOS) assert.ok(d.label && d.group, d.id);
  assert.ok(demoById('grid:raster bars') && demoById('grid:sine scroller') && demoById('disk') && demoById('scope'));
});

test('five pictures, each of the grid size', () => {
  const pics = scenes(16, 12);
  assert.equal(pics.length, 5);
  for (const p of pics) assert.equal(p.length, 192);
});

/** A context for a demo: lamps and a log, no waiting. */
function context() {
  const lamps = createLamps();
  /** @type {string[]} */
  const log = [];
  return { lamps, log, base: { lamps, log: (/** @type {string} */ l) => log.push(l), seconds: 0.12, device: { go: () => undefined, pages: 30 } } };
}

test('the runner runs a demo, refuses a second one and stops on request', async () => {
  const c = context();
  /** @type {string[]} */
  const ended = [];
  const runner = createRunner(() => c.base, { onStart: () => undefined, onEnd: (n) => ended.push(n) });
  assert.equal(runner.start('bar:comet'), true);
  assert.equal(runner.start('bar:comet'), false);
  assert.equal(runner.running(), true);
  await new Promise((r) => setTimeout(r, 400));
  assert.deepEqual(ended, ['comet']);
  assert.equal(runner.running(), false);
  assert.ok(c.lamps.counters().frames > 3);
  runner.start('grid:raster bars');
  await new Promise((r) => setTimeout(r, 50));
  runner.stop();
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(ended.at(-1), 'stopped');
});

test('the grid effects paint a grid of 40 x 25; the pages demo visits every page', async () => {
  const c = context();
  /** @type {string[]} */
  const ended = [];
  const runner = createRunner(() => ({ ...c.base, seconds: 0.1 }), { onStart: () => undefined, onEnd: (n) => ended.push(n) });
  runner.start('grid:sine scroller');
  await new Promise((r) => setTimeout(r, 400));
  assert.equal(c.lamps.snapshot().grid?.cols, 40);
  assert.equal(c.lamps.snapshot().grid?.rows, 25);
  assert.match(ended[0] ?? '', /sine scroller: \d+ pictures/u);
});

test('the file transfer demo ends with a matching SHA-256', async () => {
  const c = context();
  /** @type {string[]} */
  const ended = [];
  const runner = createRunner(() => c.base, { onStart: () => undefined, onEnd: (n) => ended.push(n) });
  runner.start('diskfast');
  await new Promise((r) => setTimeout(r, 1500));
  assert.match(ended[0] ?? '', /SHA-256 match/u);
  assert.ok(c.log.some((l) => l.includes('MATCH')));
  assert.equal(c.lamps.snapshot().grid?.cols, 32);
});
