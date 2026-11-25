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
  const dom = new JSDOM(read('device.html'), { url: 'http://localhost/device.html', virtualConsole: new VirtualConsole() });
  const { document } = dom.window;
  const window = /** @type {any} */ (dom.window);
  const dialog = /** @type {any} */ (document.getElementById('demos-dialog'));
  dialog.close = () => undefined;
  dialog.showModal = () => undefined;
  const lamps = createLamps();
  const optional = createOptional(lamps, () => new Array(512).fill(0), () => device?.currentBar() ?? []);
  /** @type {ReturnType<typeof start>} */
  let device = null;
  device = start({ document, window, keymap: data.NG_KEYMAP, lockKeys: data.NG_LOCKKEYS, lockColors: [[255, 80, 0], [0, 220, 60], [40, 80, 255]], help: data.NG_SHELLHELP_FULL, extra: optional });
  assert.ok(device);
  const app = startDemoPage({ document, window, slides: data.NG_SLIDES, device, lamps, audio: null, link: '', optional });
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

test('the bar on the PC is the LED bar of the board: the colour of the page, the locks and what a demo paints', async (t) => {
  const { document, device } = page(t);
  const seen = /** @type {number[][]} */ ([]);
  device.onBar((rgb) => seen.push(rgb));
  device.go(3);
  const layerColour = device.currentBar();
  assert.ok(layerColour.every((c) => c === layerColour[0]) && (layerColour[0] ?? 0) > 0, 'a key page lights all ten LEDs in the colour of the layer');
  assert.ok(seen.length >= 1);
  device.go(26);
  /** @type {HTMLElement} */ (document.querySelector('[data-lock="0"]')).click();
  assert.deepEqual(device.currentBar().slice(0, 2), [0xff5000, 0xff5000]);          // Caps fills lamps 0 and 1
  assert.deepEqual(device.currentBar().slice(2), new Array(8).fill(0));
  /** @type {HTMLElement} */ (document.querySelector('[data-demo="bar:rainbow"]')).click();
  await wait(200);
  assert.ok(new Set(device.currentBar()).size > 1, 'a demo paints different colours');
});

test('the log, the shell and the keys are tabs of one drawer under the console, not popups', (t) => {
  const { document } = page(t);
  const drawer = /** @type {HTMLElement} */ (document.getElementById('console-drawer'));
  const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));
  assert.equal(drawer.hidden, true);
  assert.equal(drawer.closest('dialog'), null, 'the drawer is not inside a dialog');
  for (const id of ['demolog', 'shell-in', 'keylog']) assert.equal($(id).closest('dialog'), null, `${id} is not in a dialog`);
  $('shell-open').click();
  assert.equal(drawer.hidden, false);
  assert.equal($('tab-shell').getAttribute('aria-selected'), 'true');
  assert.equal($('panel-shell').hidden, false);
  assert.equal($('panel-log').hidden, true);
  assert.ok($('shell-open').classList.contains('active'));
  $('log-open').click();                                   // another button: the same drawer, another tab
  assert.equal(drawer.hidden, false);
  assert.equal($('panel-log').hidden, false);
  assert.equal($('panel-shell').hidden, true);
  assert.ok(!$('shell-open').classList.contains('active') && $('log-open').classList.contains('active'));
  $('tab-keys').click();
  assert.equal($('panel-keys').hidden, false);
  assert.equal($('keys-open').getAttribute('aria-expanded'), 'true');
  $('keys-open').click();                                  // the button of the open tab closes the drawer
  assert.equal(drawer.hidden, true);
  $('shell-open').click();
  $('drawer-close').click();
  assert.equal(drawer.hidden, true);
  assert.equal($('shell-open').getAttribute('aria-expanded'), 'false');
});

test('Clear empties the tab that is open', async (t) => {
  const { document } = page(t);
  const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));
  /** @type {HTMLElement} */ (document.querySelector('[data-demo="bar:comet"]')).click();
  await wait(60);
  $('demo-stop').click();
  await wait(60);
  $('log-open').click();
  assert.ok($('demolog').children.length > 0);
  $('drawer-clear').click();
  assert.equal($('demolog').children.length, 0);
});

test('every command of the manual answers on the page, as on the board', (t) => {
  const { document, window } = page(t);
  const input = /** @type {HTMLInputElement} */ (document.getElementById('shell-in'));
  const out = /** @type {HTMLElement} */ (document.getElementById('shell-out'));
  const run = (/** @type {string} */ line) => {
    const before = out.children.length;
    input.value = line;
    /** @type {HTMLFormElement} */ (document.getElementById('shell-form')).dispatchEvent(new window.Event('submit', { cancelable: true }));
    return [...out.children].slice(before + 1).map((e) => e.textContent ?? '');
  };
  // the commands of the Core2 build only: the CoreS3 answers them with ERR unknown (or ERR btn)
  const presenterOnly = new Set(['clicker', 'pointer', 'imu', 'mod', 'btn']);
  const refused = [];
  for (const h of data.NG_SHELLHELP_FULL) {
    for (const example of h.examples) {
      if (/^(tap|key|down) /u.test(example)) continue;     // these type on a host: they have their own tests
      const reply = run(example)[0] ?? '';
      if (presenterOnly.has(h.name)) assert.match(reply, /^ERR /u, example);
      else if (!reply.startsWith('OK')) refused.push(`${example} -> ${reply}`);
    }
  }
  assert.deepEqual(refused, []);
});

test('bar and disk answer from the state of the board and of the last transfer', async (t) => {
  const { document, window, device } = page(t);
  const input = /** @type {HTMLInputElement} */ (document.getElementById('shell-in'));
  const out = /** @type {HTMLElement} */ (document.getElementById('shell-out'));
  const run = (/** @type {string} */ line) => {
    const before = out.children.length;
    input.value = line;
    /** @type {HTMLFormElement} */ (document.getElementById('shell-form')).dispatchEvent(new window.Event('submit', { cancelable: true }));
    return [...out.children].slice(before + 1).map((e) => e.textContent ?? '');
  };
  device.go(3);
  assert.match(run('bar')[0] ?? '', /^OK BAR ([0-9a-f]{6} ?){10}$/u);
  assert.notEqual(run('bar')[0], `OK BAR ${new Array(10).fill('000000').join(' ')}`, 'a key page lights the LEDs');
  assert.match(run('disk')[0] ?? '', /state=idle/u);
  /** @type {HTMLElement} */ (document.querySelector('[data-demo="diskfast"]')).click();
  for (let i = 0; i < 40 && !/state=done/u.test(run('disk')[0] ?? ''); i++) await wait(100);
  assert.match(run('disk')[0] ?? '', /state=done .*match=1/u);
  assert.deepEqual(run('disk dir'), ['OK DIR', 'book.txt 620000']);
  assert.deepEqual(run('disk sound off'), ['OK DISK SOUND OFF']);
  assert.deepEqual(run('disk reset'), ['OK DISK RESET']);
});
