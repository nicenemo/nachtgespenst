import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import { JSDOM, VirtualConsole } from 'jsdom';
import { DEMOS } from '../src/demos.js';
import { startDemoPage } from '../src/demopage.js';
import { createLamps } from '../src/lamps.js';
import { start } from '../src/mock.js';
import { createOptional } from '../src/optional.js';

const read = (/** @type {string} */ f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const data = vm.runInNewContext(`${read('keymap.js')}; ${read('shellhelp-full.js')}; ${read('slides.js')}; ({NG_KEYMAP, NG_LOCKKEYS, NG_SHELLHELP_FULL, NG_SLIDES})`);

/** The demo page in jsdom (no canvas, no dialog: both are stubbed). */
function page(/** @type {import('node:test').TestContext} */ t) {
  const dom = new JSDOM(read('demo-app.html'), { url: 'http://localhost/demo-app.html', virtualConsole: new VirtualConsole() });
  const { document } = dom.window;
  const window = /** @type {any} */ (dom.window);
  const dialog = /** @type {any} */ (document.getElementById('demos-dialog'));
  dialog.close = () => undefined;
  dialog.showModal = () => undefined;
  const lamps = createLamps();
  const optional = createOptional(lamps, () => new Array(512).fill(0));
  const device = start({ document, window, keymap: data.NG_KEYMAP, lockKeys: data.NG_LOCKKEYS, lockColors: [[255, 80, 0], [0, 220, 60], [40, 80, 255]], help: data.NG_SHELLHELP_FULL, extra: optional });
  assert.ok(device);
  const app = startDemoPage({ document, window, slides: data.NG_SLIDES, device, lamps, audio: null, link: '' });
  assert.ok(app);
  t.after(() => { app.dispose(); window.close(); });
  return { document, window, lamps, device, app };
}

/** @param {number} ms */
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('the popup lists every demo of the desktop app', (t) => {
  const { document } = page(t);
  const buttons = [...document.querySelectorAll('#demo-columns button[data-demo]')].map((b) => b.getAttribute('data-demo'));
  assert.deepEqual(buttons.sort(), DEMOS.map((d) => d.id).sort());
  for (const want of ['pages', 'disk', 'diskfast', 'scope', 'vu', 'miccheck', 'bar:nightrider', 'board:comet', 'grid:raster bars', 'grid:sine scroller', 'photos']) assert.ok(buttons.includes(want), want);
});

test('a demo from the popup drives the lamps: the fake board and the PC panel see them', async (t) => {
  const { document, lamps } = page(t);
  const seconds = /** @type {HTMLInputElement} */ (document.getElementById('opt-seconds'));
  seconds.value = '2';
  /** @type {HTMLElement} */ (document.querySelector('[data-demo="bar:rainbow"]')).click();
  await wait(300);
  assert.equal(/** @type {HTMLButtonElement} */ (document.getElementById('demo-stop')).disabled, false);
  assert.match(document.getElementById('demo-status')?.textContent ?? '', /Running/u);
  const led = /** @type {HTMLElement} */ (document.querySelector('.bar .led[data-lamp="0"]'));
  assert.notEqual(led.style.background, '');
  assert.equal(lamps.snapshot().barPage, true);
  /** @type {HTMLElement} */ (document.getElementById('demo-stop')).click();
  await wait(100);
  assert.match(document.getElementById('demolog')?.textContent ?? '', /→ stopped/u);
  assert.equal(/** @type {HTMLButtonElement} */ (document.getElementById('demo-stop')).disabled, true);
});

test('the talk shows the slides and starts the demo of a slide', async (t) => {
  const { document, app } = page(t);
  assert.equal(document.getElementById('slide-title')?.textContent, data.NG_SLIDES[0].title);
  /** @type {HTMLElement} */ (document.getElementById('talk-start')).click();
  assert.equal(app.talk.running(), true);
  const demoSlide = data.NG_SLIDES.findIndex((/** @type {{demo: string | null}} */ s) => s.demo === 'bar:nightrider');
  app.talk.go(demoSlide);
  await wait(400);
  assert.equal(app.runner.running(), true);
  assert.equal(document.getElementById('slide-title')?.textContent, data.NG_SLIDES[demoSlide].title);
  app.talk.stop();
  app.runner.stop();
  await wait(100);
});

test('the shell answers the commands of the lamps', async (t) => {
  const { document, lamps } = page(t);
  const input = /** @type {HTMLInputElement} */ (document.getElementById('shell-in'));
  const out = /** @type {HTMLElement} */ (document.getElementById('shell-out'));
  const type = (/** @type {string} */ line) => {
    const before = out.children.length;
    input.value = line;
    /** @type {HTMLFormElement} */ (document.getElementById('shell-form')).dispatchEvent(new /** @type {any} */ (document.defaultView).Event('submit', { cancelable: true }));
    return [...out.children].slice(before + 1).map((e) => e.textContent ?? '');
  };
  lamps.setBar([0xff0000, 0, 0, 0, 0, 0, 0, 0, 0, 0x00ff00]);
  assert.equal(type('bar')[0], 'OK BAR ff0000 000000 000000 000000 000000 000000 000000 000000 000000 00ff00');
  assert.match(type('lamps')[0] ?? '', /^OK LAMPS mode=auto lamps=10 grid=0x0 /u);
  assert.match(type('lamps grid 16 12')[0] ?? '', /^OK LAMPS GRID 16 12 lamps=192 max=60800$/u);
  assert.match(type('lamps')[0] ?? '', /grid=16x12/u);
  assert.equal(type('wave')[0]?.length, 'OK WAVE '.length + 2048);
  assert.deepEqual(type('lamps reset'), ['OK LAMPS RESET']);
  assert.deepEqual(type('telem wave'), ['OK TELEM WAVE']);
  assert.match(type('help').join('\n'), /^OK HELP[\s\S]*\nlamps /u);
  await wait(10);
});
