import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { start } from '../src/mock.js';

// keymap.js is generated and defines var NG_KEYMAP, NG_LOCKKEYS and NG_LOCKCOLORS.
const data = vm.runInNewContext(`${readFileSync(new URL('../keymap.js', import.meta.url), 'utf8')}; ({NG_KEYMAP, NG_LOCKKEYS, NG_LOCKCOLORS: typeof NG_LOCKCOLORS === 'undefined' ? [] : NG_LOCKCOLORS})`);
const device = readFileSync(new URL('../device.html', import.meta.url), 'utf8');

test('the keymap has 26 layers with tiles', () => {
  assert.equal(data.NG_KEYMAP.length, 26);
  for (const l of data.NG_KEYMAP) assert.equal(l.tiles.length, l.rows * l.cols);
});
test('paging, locks and the log work on the real page', () => {
  const dom = new JSDOM(device, { url: 'http://localhost/device.html' });
  const { document } = dom.window;
  const demo = start({ document, window: /** @type {any} */ (dom.window), keymap: data.NG_KEYMAP, lockKeys: data.NG_LOCKKEYS, lockColors: [[255, 80, 0], [0, 220, 60], [40, 80, 255]] });
  assert.ok(demo);
  const click = (/** @type {string} */ s) => /** @type {HTMLElement} */ (document.querySelector(s)).click();
  click('[data-act=next]');
  assert.equal(demo.state().page, 1);
  click('[data-act=prev]');
  click('[data-act=prev]');
  assert.equal(demo.state().page, 26);
  click('[data-act=title]');
  assert.equal(demo.state().page, 0);
  click('[data-act=title]');
  assert.equal(demo.state().page, 26);
  click('[data-lock="0"]');
  assert.equal(demo.state().mask, 1);
  assert.match(/** @type {HTMLImageElement} */ (document.getElementById('mockimg')).src, /s3-26-100\.png$/u);
  assert.ok(document.querySelectorAll('#keylog .kl').length >= 2);
  click('[data-act=title]');
  assert.equal(demo.state().page, 0);
});
