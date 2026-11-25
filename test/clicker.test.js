import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { CLICK, PAGES, start } from '../src/clicker.js';

const html = `<div id="mock"><div id="clicker-screen"><img id="clicker-img"></div></div><p id="mockstatus"></p>
<button id="keylog-clear"></button><div id="keylog"><p class="keylog-empty"></p></div>
<button data-button="A"></button><button data-button="B"></button><button data-button="C"></button>`;

/** @param {{window: Window}} dom @param {string} name */
const tap = (dom, name) => /** @type {HTMLElement} */ (dom.window.document.querySelector(`[aria-label="${name}"]`)).click();
const lines = (/** @type {{window: Window}} */ dom) => [...dom.window.document.querySelectorAll('.kl')].map((e) => e.textContent);

test('tiles lie inside the 320 x 240 screen', () => {
  for (const tiles of Object.values(PAGES)) for (const { rect: [x, y, w, h] } of tiles) assert.ok(x + w <= 320 && y + h <= 240);
});
test('Next types Page Down, Click is mouse report 12', () => {
  const dom = new JSDOM(html);
  const demo = start({ document: dom.window.document, window: /** @type {any} */ (dom.window), now: () => new Date(2026, 0, 1, 9, 8, 7) });
  assert.ok(demo);
  tap(dom, 'Next');
  assert.match(lines(dom)[0] ?? '', /09:08:07.*Page Down.*report 01: 00 00 4E/u);
  tap(dom, 'Pointer mode');
  assert.equal(demo.mode(), 'pointer');
  tap(dom, 'Click');
  assert.match(lines(dom)[2] ?? '', /Left mouse button.*report 0C: 01 00 00 00/u);
  assert.deepEqual(CLICK.up, [12, [0, 0, 0, 0]]);
  tap(dom, 'Laser');
  assert.match(lines(dom)[4] ?? '', /Ctrl\+L.*report 01: 01 00 0F/u);
});
test('the physical buttons A, B and C', () => {
  const dom = new JSDOM(html);
  const demo = start({ document: dom.window.document, window: /** @type {any} */ (dom.window) });
  const button = (/** @type {string} */ n) => /** @type {HTMLElement} */ (dom.window.document.querySelector(`[data-button=${n}]`)).click();
  button('A');
  assert.match(lines(dom)[0] ?? '', /Page Up/u);
  button('B');
  assert.equal(demo?.mode(), 'pointer');
  button('C');
  assert.match(lines(dom).at(-2) ?? '', /Page Down/u);
});
