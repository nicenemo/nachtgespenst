// The Core2 clicker in the browser: two screenshots of the real board with click areas on them. A tap writes the HID report that the
// board would send into a log; nothing is sent. The keys are those of src/Presenter.cpp; the keyboard reports come from the same
// description as on the device page (keylog.js), the click is a mouse report (report ID 12: buttons, dx, dy, wheel).
import { bytes, describe, hex } from './keylog.js';

/**
 * @typedef {import('./keylog.js').Binding} Binding
 * @typedef {import('./keylog.js').Description} Description
 */

/**
 * One tile of the clicker, on the screen of the board.
 * @typedef {object} Tile
 * @property {string} name the label on the tile
 * @property {[number, number, number, number]} rect x, y, width and height on the 320 x 240 screen
 * @property {Binding | 'click' | 'mode'} action the key it types, the mouse click, or the switch of the page
 */

const PAGE_UP = /** @type {Binding} */ ([7, 0x4b, 0, 'PAGEUP', null]);
const PAGE_DOWN = /** @type {Binding} */ ([7, 0x4e, 0, 'PAGEDOWN', null]);

/** The tiles of the clicker page and of the pointer page (src/Presenter.cpp; the rectangles are those of the shell command `tiles`). @type {Record<'clicker' | 'pointer', Tile[]>} */
export const PAGES = {
  clicker: [
    { name: 'Next', rect: [161, 27, 156, 210], action: PAGE_DOWN },
    { name: 'Previous', rect: [3, 27, 155, 84], action: PAGE_UP },
    { name: 'Start', rect: [3, 114, 76, 60], action: [7, 0x3e, 0, 'F5', null] },
    { name: 'Blank', rect: [82, 114, 76, 60], action: [7, 0x05, 0, 'B', null] },
    { name: 'End', rect: [3, 177, 76, 60], action: [7, 0x29, 0, 'ESCAPE', null] },
    { name: 'Pointer', rect: [82, 177, 76, 60], action: 'mode' },
  ],
  pointer: [
    { name: 'Click', rect: [3, 27, 186, 88], action: 'click' },
    { name: 'Laser', rect: [192, 27, 125, 88], action: [7, 0x0f, 1, 'L', null] },
    { name: 'Clicker mode', rect: [161, 118, 156, 54], action: 'mode' },
    { name: 'Previous', rect: [3, 175, 155, 62], action: PAGE_UP },
    { name: 'Next', rect: [161, 175, 156, 62], action: PAGE_DOWN },
  ],
};

/** The three buttons under the screen: A is Previous, B switches the air mouse, C is Next. */
export const BUTTONS = /** @type {const} */ ({ A: 'Previous', B: 'Pointer', C: 'Next' });

/** The left mouse button as the board sends it: report ID 12 with the buttons, dx, dy and the wheel. @type {Description} */
export const CLICK = {
  text: 'Left mouse button', kind: 'mouse', down: [12, [1, 0, 0, 0]], up: [12, [0, 0, 0, 0]], detail: 'buttons 0x01, no movement', label: null,
};

const W = 320;
const H = 240;
const MAX_LOG_LINES = 200;

/**
 * Puts the clicker demo on the page.
 * @param {{document: Document, window: Window & typeof globalThis, now?: () => Date}} env
 * @returns {{mode: () => string} | null} null when the page has no demo
 */
export function start(env) {
  const { document, window } = env;
  const now = env.now ?? (() => new Date());
  const found = ['clicker-screen', 'clicker-img', 'keylog', 'mockstatus'].map((id) => document.getElementById(id));
  if (found.some((el) => el === null)) return null;
  const [screen, img, logEl, status] = /** @type {[HTMLElement, HTMLImageElement, HTMLElement, HTMLElement]} */ (found);
  /** @type {'clicker' | 'pointer'} */
  let mode = 'clicker';
  /** @type {HTMLElement[]} */
  let areas = [];

  /** @param {string} className @param {string[]} parts */
  function line(className, parts) {
    const el = document.createElement('div');
    el.className = `kl ${className}`;
    el.textContent = parts.join('  ');
    return el;
  }

  /** @param {Description} d */
  function log(d) {
    logEl.querySelector('.keylog-empty')?.remove();
    const t = now();
    const time = [t.getHours(), t.getMinutes(), t.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':');
    logEl.append(line('down', [time, '▼', d.text, d.kind, `report ${hex(d.down[0], 2)}: ${bytes(d.down[1])}`, `(${d.detail})`]));
    logEl.append(line('up', [time, '▲', 'release', d.kind, `report ${hex(d.up[0], 2)}: ${bytes(d.up[1])}`]));
    while ((logEl.children.length ?? 0) > MAX_LOG_LINES) logEl.firstElementChild?.remove();
    logEl.scrollTop = logEl.scrollHeight;
  }

  /** @param {Tile['action']} action */
  function press(action) {
    if (action === 'mode') {
      mode = mode === 'clicker' ? 'pointer' : 'clicker';
      render();
      status.textContent = mode === 'pointer'
        ? 'Air mouse on: turning the board moves the pointer. Nothing is sent from this page.'
        : 'Air mouse off: back on the clicker page.';
      return;
    }
    const d = action === 'click' ? CLICK : describe(action);
    if (!d) return;
    log(d);
    status.textContent = `${d.text}: the report is in the log; nothing was sent.`;
  }

  function render() {
    img.src = `img/clicker/${mode}.png`;
    img.alt = mode === 'clicker' ? 'Core2 screenshot of the clicker page' : 'Core2 screenshot of the pointer page';
    areas.forEach((el) => el.remove());
    areas = PAGES[mode].map((tile) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'hit ktile';
      button.setAttribute('aria-label', tile.name);
      const [x, y, w, h] = tile.rect;
      button.style.left = `${x / W * 100}%`;
      button.style.top = `${y / H * 100}%`;
      button.style.width = `${w / W * 100}%`;
      button.style.height = `${h / H * 100}%`;
      button.addEventListener('click', () => {
        button.classList.add('pressed');
        window.setTimeout(() => button.classList.remove('pressed'), 160);
        press(tile.action);
      });
      screen.append(button);
      return button;
    });
  }

  // The physical buttons under the screen do what the tile of the same name does on the current page.
  document.querySelectorAll('[data-button]').forEach((el) => {
    el.addEventListener('click', () => {
      const name = BUTTONS[/** @type {keyof typeof BUTTONS} */ (el.getAttribute('data-button'))];
      const tile = PAGES[mode].find((t) => t.name === name || (name === 'Pointer' && t.action === 'mode'));
      if (tile) press(tile.action);
    });
  });
  document.getElementById('keylog-clear')?.addEventListener('click', () => logEl.replaceChildren());

  render();
  return { mode: () => mode };
}
