import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { start } from '../src/mock.js';
import { start as startClicker } from '../src/clicker.js';

const read = (/** @type {string} */ f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const data = vm.runInNewContext(`${read('keymap.js')}; ${read('shellhelp.js')}; ({NG_KEYMAP, NG_LOCKKEYS, NG_SHELLHELP})`);
const COLOURS = [[255, 80, 0], [0, 220, 60], [40, 80, 255]];

/** A demo page with its shell: type a line and read the reply lines from the output. */
function page(/** @type {'device' | 'clicker'} */ which) {
  const dom = new JSDOM(read(`${which}.html`), { url: `http://localhost/${which}.html` });
  const { document } = dom.window;
  const window = /** @type {any} */ (dom.window);
  const demo = which === 'device'
    ? start({ document, window, keymap: data.NG_KEYMAP, lockKeys: data.NG_LOCKKEYS, lockColors: COLOURS, help: data.NG_SHELLHELP })
    : startClicker({ document, window, help: data.NG_SHELLHELP });
  assert.ok(demo);
  const input = /** @type {HTMLInputElement} */ (document.getElementById('shell-in'));
  const out = /** @type {HTMLElement} */ (document.getElementById('shell-out'));
  const log = /** @type {HTMLElement} */ (document.getElementById('keylog'));
  /** Types a line and returns the new reply lines (without the echo of the line). */
  const type = (/** @type {string} */ line) => {
    const before = out.children.length;
    input.value = line;
    /** @type {HTMLFormElement} */ (document.getElementById('shell-form')).dispatchEvent(new window.Event('submit', { cancelable: true }));
    return [...out.children].slice(before + 1).map((e) => e.textContent ?? '');
  };
  return { demo: /** @type {any} */ (demo), type, log, document, input, out };
}

test('the help covers the standard commands only', () => {
  const names = data.NG_SHELLHELP.map((/** @type {{name: string}} */ h) => h.name);
  assert.ok(names.includes('tapok') && names.includes('layer'));
  for (const optional of ['lamps', 'disk', 'mic', 'wave', 'bar', 'telem']) assert.ok(!names.includes(optional), optional);
});

test('S3: ping, info, help', () => {
  const { type } = page('device');
  assert.deepEqual(type('ping'), ['OK PONG']);
  assert.match(type('info')[0] ?? '', /^OK INFO board=S3 name=NG-S3 fw=\S+ w=320 h=240 pages=30 locks=26 presenter=0$/u);
  assert.equal(type('help')[0], 'OK HELP');
  assert.match(type('help layer').join('\n'), /usage: layer <n>/u);
  assert.deepEqual(type('help nonsense'), ['ERR help unknown']);
  assert.deepEqual(type('lamps'), ['ERR unknown']);
  assert.deepEqual(type('pointer on'), ['ERR unknown']);
});

test('S3: layer, state and tiles follow the page', () => {
  const { type, demo } = page('device');
  assert.deepEqual(type('layer 3'), ['OK LAYER 3']);
  assert.equal(demo.state().page, 3);
  assert.match(type('state')[0] ?? '', /^OK STATE page=3\/30 title=\S+ caps=0 num=0 scroll=0 .* presses=0 /u);
  const tiles = type('tiles');
  assert.match(tiles[0] ?? '', /^OK TILES page=3 count=\d+$/u);
  assert.equal(tiles.length, Number(/count=(\d+)/u.exec(tiles[0] ?? '')?.[1]) + 1);
  assert.deepEqual(type('layer 29'), ['OK LAYER 29']);
  assert.match(type('state')[0] ?? '', /page=29\/30 title=Lamps:_bar /u);
  assert.deepEqual(type('tiles'), ['OK TILES page=29 count=0']);
  assert.deepEqual(type('layer 30'), ['ERR range']);
  assert.deepEqual(type('layer x'), ['ERR unknown']);
});

test('S3: the Locks page, key and tap write reports and switch the locks', () => {
  const { type, demo, log } = page('device');
  type('layer 26');
  assert.deepEqual(type('key 26 2'), ['OK KEY']);          // Scroll Lock
  assert.equal(demo.state().mask, 4);
  assert.match(type('state')[0] ?? '', /scroll=1 .* presses=1 /u);
  assert.ok(log.textContent?.includes('report 01'));
  assert.deepEqual(type('tap 10 10'), ['OK TAP']);          // the Caps tile
  assert.equal(demo.state().mask, 5);
  assert.deepEqual(type('tap 300 235'), ['ERR tap']);       // the bottom bar is not a tile
});

test('S3: Power Down and Sleep are refused by key, tap and tapok', () => {
  const { type, document } = page('device');
  const system = data.NG_KEYMAP.findIndex((/** @type {{tiles: any[][]}} */ l) => l.tiles.some((t) => t[0] === 1 && t[1] === 0x81));
  assert.ok(system >= 0);
  const index = data.NG_KEYMAP[system].tiles.findIndex((/** @type {any[]} */ t) => t[0] === 1 && t[1] === 0x81);
  assert.deepEqual(type(`key ${system} ${index}`), ['ERR key']);
  type(`layer ${system}`);
  const tile = type('tiles').slice(1).map((l) => l.split(' ')).find((w) => Number(w[1]) === index);
  assert.ok(tile);
  const [, , x = 0, y = 0, w = 0, h = 0] = tile.map(Number);
  assert.deepEqual(type(`tapok ${x} ${y}`), ['OK TAPOK refused']);
  assert.deepEqual(type(`tap ${x + w / 2} ${y + h / 2}`), ['ERR tap']);
  assert.deepEqual(type(`tapok ${x - 2} ${y}`), ['OK TAPOK refused']);   // within 2 px
  assert.equal(document.querySelectorAll('#keylog .kl.down').length, 0);  // nothing was logged as sent
});

test('S3: set, leds, prefer, only', () => {
  const { type } = page('device');
  assert.match(type('set')[0] ?? '', /^OK SET led=on bright=40 ledidle=0 bl=128 dim=60 off=300 prefer=usb effect=none$/u);
  assert.match(type('set effect rainbow')[0] ?? '', /effect=rainbow$/u);
  assert.deepEqual(type('set effect nonsense'), ['ERR set']);
  assert.deepEqual(type('set bright 500'), ['ERR set']);
  assert.deepEqual(type('leds off'), ['OK LEDS OFF']);
  assert.deepEqual(type('prefer ble'), ['OK PREFER BLE']);
  assert.deepEqual(type('prefer'), ['OK PREFER BLE usb=1 ble=1']);
  assert.deepEqual(type('only usb'), ['OK ONLY USB']);
  assert.deepEqual(type('only foo'), ['ERR only']);
  assert.deepEqual(type('bl 100'), ['OK BL 100']);
  assert.deepEqual(type('bl 999'), ['ERR bl']);
});

test('the terminal: history with the arrow keys and Tab completion', () => {
  const { type, input, document } = page('device');
  type('ping');
  type('info');
  const key = (/** @type {string} */ k) => input.dispatchEvent(new /** @type {any} */ (document.defaultView).KeyboardEvent('keydown', { key: k, cancelable: true }));
  key('ArrowUp');
  assert.equal(input.value, 'info');
  key('ArrowUp');
  assert.equal(input.value, 'ping');
  key('ArrowDown');
  assert.equal(input.value, 'info');
  input.value = 'tapo';
  key('Tab');
  assert.equal(input.value, 'tapok ');
});

test('C2: info, the clicker and the pointer', () => {
  const { type, demo, log } = page('clicker');
  assert.match(type('info')[0] ?? '', /board=C2 name=NG-C2 .* pages=1 locks=255 presenter=1$/u);
  assert.deepEqual(type('clicker next'), ['OK CLICKER']);
  assert.match(log.textContent ?? '', /Page Down.*report 01: 00 00 4E/u);
  assert.deepEqual(type('clicker nonsense'), ['ERR clicker']);
  assert.match(type('pointer')[0] ?? '', /^OK PRESENTER pointer=off gain=20 idle=2\.0 /u);
  assert.match(type('pointer on')[0] ?? '', /pointer=still/u);
  assert.equal(demo.mode(), 'pointer');
  assert.deepEqual(type('pointer click right'), ['OK POINTER CLICK']);
  assert.match(log.textContent ?? '', /Right mouse button.*report 0C: 02 00 00 00/u);
  assert.deepEqual(type('pointer scroll -3'), ['OK POINTER SCROLL']);
  assert.match(log.textContent ?? '', /Mouse wheel down.*report 0C: 00 00 00 FD/u);
  assert.deepEqual(type('pointer gain 50'), ['OK POINTER SET']);
  assert.deepEqual(type('pointer gain 500'), ['ERR pointer']);
  assert.deepEqual(type('imu 0 0 60'), ['OK IMU']);
  assert.match(log.textContent ?? '', /Mouse move.*report 0C: 00 /u);
  assert.match(type('pointer')[0] ?? '', /pointer=moving gain=50 .* reports=1 clicks=1 scrolls=1/u);
  assert.match(type('pointer off')[0] ?? '', /pointer=off/u);
  assert.equal(demo.mode(), 'clicker');
});

test('C2: mod toggles a sticky modifier', () => {
  const { type, log } = page('clicker');
  assert.deepEqual(type('mod ctrl'), ['OK MOD 1']);
  assert.deepEqual(type('mod meh'), ['OK MOD 7']);
  assert.deepEqual(type('mod meh'), ['OK MOD 0']);
  assert.deepEqual(type('mod ctrl'), ['OK MOD 1']);
  assert.deepEqual(type('mod off'), ['OK MOD 0']);
  assert.deepEqual(type('mod nonsense'), ['ERR mod']);
  assert.match(log.textContent ?? '', /report 01: 07 00 00/u);
});

test('C2: tiles, tap and the buttons', () => {
  const { type, demo, log } = page('clicker');
  assert.match(type('tiles').join('\n'), /OK TILES page=0 count=6\nTILE 0 161 27 156 210 Next\nTILE 1 3 27 155 84 Previous/u);
  assert.deepEqual(type('tap 240 130'), ['OK TAP']);       // Next
  assert.match(log.textContent ?? '', /Page Down/u);
  assert.deepEqual(type('tap 120 205'), ['OK TAP']);       // Pointer mode
  assert.equal(demo.mode(), 'pointer');
  assert.deepEqual(type('btn a down'), ['OK BTN DOWN']);
  assert.deepEqual(type('btn a up'), ['OK BTN UP']);
  assert.deepEqual(type('btn d down'), ['ERR unknown']);
  assert.deepEqual(type('layer 0'), ['OK LAYER 0']);
  assert.deepEqual(type('layer 1'), ['ERR range']);
});
