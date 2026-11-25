// The CoreS3 in the browser: the screenshots of the real board stitched into a page that can be paged and clicked.
// The arrows and the title (which opens and closes the Locks page) work as on the device; on the Locks page the Caps, Num and Scroll tiles switch
// between eight real screenshots and the two LED bars follow the rule of the firmware; on every key page a tapped tile writes the HID report that
// the device would send into a log. Nothing is sent and nothing here simulates the firmware: the reports come from the keymap it is built from.
import { LOCKS, LOCK_NAMES, PAGES, SCREEN_H, SCREEN_W, barColours, bytes, describe, hex, lockText, pageImage, tileRects } from './keylog.js';

/**
 * @typedef {import('./keylog.js').Binding} Binding
 * @typedef {import('./keylog.js').Description} Description
 * @typedef {import('./keylog.js').Layer} Layer
 */

/**
 * What the page needs from outside, so that a test can give it a page of its own.
 * @typedef {object} Environment
 * @property {Document} document
 * @property {Window & typeof globalThis} window
 * @property {Layer[]} keymap
 * @property {Binding[]} lockKeys
 * @property {number[][]} lockColors
 * @property {() => Date} [now]
 */

const MAX_LOG_LINES = 200;
const FLASH_MS = 160;
const SWIPE_PX = 50;

/**
 * Puts the demo on the page.
 * @param {Environment} env
 * @returns {{go: (page: number) => void, state: () => {page: number, mask: number}} | null} null when the page has no demo
 */
export function start(env) {
  const { document, window, keymap, lockKeys, lockColors } = env;
  const now = env.now ?? (() => new Date());
  const mock = document.getElementById('mock');
  if (!mock || !document.getElementById('mockimg')) return null;

  /**
   * @param {string} id
   * @returns {HTMLElement}
   */
  const byId = (id) => {
    const el = document.getElementById(id);
    if (!el) throw new Error(`the page has no element #${id}`);
    return el;
  };
  /**
   * @param {string} selector
   * @returns {HTMLElement}
   */
  const inMock = (selector) => {
    const el = /** @type {HTMLElement | null} */ (mock.querySelector(selector));
    if (!el) throw new Error(`the demo has no element ${selector}`);
    return el;
  };
  const img = /** @type {HTMLImageElement} */ (byId('mockimg'));
  const status = byId('mockstatus');
  const logEl = document.getElementById('keylog');
  const clearButton = document.getElementById('keylog-clear');
  const screen = inMock('.screen');

  /** @type {Record<string, HTMLElement>} */
  const leds = {};
  mock.querySelectorAll('.bar .led').forEach((el) => {
    leds[el.getAttribute('data-lamp') ?? ''] = /** @type {HTMLElement} */ (el);
  });
  const lockTiles = /** @type {HTMLElement[]} */ ([...mock.querySelectorAll('.hit.tile')]);

  let page = 0;
  let back = 0;
  let mask = 0;
  /** @type {HTMLElement[]} */
  let keyTiles = [];
  /** @type {Record<string, HTMLImageElement>} */
  const preloaded = {};

  /**
   * Places a click area on the screen from its data attributes, in percent so that it scales with the picture.
   * @param {HTMLElement} el
   */
  function place(el) {
    const n = (/** @type {string} */ name) => Number(el.getAttribute(name));
    el.style.left = `${n('data-x') / SCREEN_W * 100}%`;
    el.style.top = `${n('data-y') / SCREEN_H * 100}%`;
    el.style.width = `${n('data-w') / SCREEN_W * 100}%`;
    el.style.height = `${n('data-h') / SCREEN_H * 100}%`;
  }
  mock.querySelectorAll('.hit').forEach((el) => place(/** @type {HTMLElement} */ (el)));

  function drawBar() {
    const colours = barColours(page, mask, keymap[page]?.color ?? '#000000', lockColors);
    colours.forEach((c, lamp) => {
      const led = leds[String(lamp)];
      if (!led) return;
      const lit = c.some((v) => v > 0);
      led.style.background = lit ? `rgb(${c.join(',')})` : '';
      led.style.boxShadow = lit ? `0 0 10px 2px rgba(${c.join(',')},.55)` : '';
    });
  }

  /**
   * @param {string} className
   * @param {string[]} parts
   * @returns {HTMLElement}
   */
  function line(className, parts) {
    const el = document.createElement('div');
    el.className = `kl ${className}`;
    el.textContent = parts.join('  ');
    return el;
  }

  /** What a tap would send, written into the log. Nothing is sent. @param {Description} d */
  function log(d) {
    if (!logEl) return;
    logEl.querySelector('.keylog-empty')?.remove();
    const d2 = now();
    const time = [d2.getHours(), d2.getMinutes(), d2.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':');
    const name = d.text + (d.label ? `  (tile "${d.label.replace(/^\+/u, '')}")` : '');
    if (d.blocked) {
      logEl.append(line('blocked', [time, '⛔', name, d.kind, d.detail, '— shown, never sent: on the device this tile powers down or suspends the computer']));
    } else {
      logEl.append(line('down', [time, '▼', name, d.kind, `report ${hex(d.down[0], 2)}: ${bytes(d.down[1])}`, `(${d.detail})`]));
      logEl.append(line('up', [time, '▲', 'release', d.kind, `report ${hex(d.up[0], 2)}: ${bytes(d.up[1])}`]));
    }
    while (logEl.children.length > MAX_LOG_LINES) logEl.firstElementChild?.remove();
    logEl.scrollTop = logEl.scrollHeight;
  }
  clearButton?.addEventListener('click', () => logEl?.replaceChildren());

  /** @param {HTMLElement} el */
  function flash(el) {
    el.classList.add('pressed');
    window.setTimeout(() => el.classList.remove('pressed'), FLASH_MS);
  }

  /** The tiles of the current key page as click areas, from the keymap that the firmware is built from. */
  function buildTiles() {
    keyTiles.forEach((el) => el.remove());
    keyTiles = [];
    const layer = keymap[page];
    if (page >= LOCKS || !layer) return;
    for (const rect of tileRects(layer)) {
      const tile = layer.tiles[rect.index];
      const description = tile ? describe(tile) : null;
      if (!description) continue;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'hit ktile';
      button.setAttribute('data-x', String(rect.x));
      button.setAttribute('data-y', String(rect.y));
      button.setAttribute('data-w', String(rect.w));
      button.setAttribute('data-h', String(rect.h));
      button.setAttribute('aria-label', description.text);
      place(button);
      button.addEventListener('click', () => {
        flash(button);
        log(description);
        status.textContent = `Tile: ${description.text}. The report is in the log; nothing was sent.`;
      });
      screen.append(button);
      keyTiles.push(button);
    }
  }

  /** Loads the pictures that the next tap is likely to need. */
  function preload() {
    const want = [pageImage((page + 1) % PAGES, mask), pageImage((page + PAGES - 1) % PAGES, mask), pageImage(LOCKS, 0)];
    if (page === LOCKS) for (let m = 0; m < 8; m++) want.push(pageImage(LOCKS, m));
    for (const src of want) {
      if (preloaded[src]) continue;
      const image = new window.Image();
      image.src = src;
      preloaded[src] = image;
    }
  }

  function render() {
    const title = keymap[page]?.title ?? '';
    img.src = pageImage(page, mask);
    img.alt = page < LOCKS ? `CoreS3 screenshot of the page ${title}` : 'CoreS3 screenshot of the Locks page';
    lockTiles.forEach((tile) => { tile.hidden = page !== LOCKS; });
    status.textContent = page < LOCKS
      ? `Page ${page + 1} of ${PAGES}: ${title}. The LED bars show its colour, ${keymap[page]?.color ?? ''}.`
      : `Locks page: ${lockText(mask)}. Tap a tile to switch it, tap the title to go back.`;
    drawBar();
    buildTiles();
    try {
      window.history.replaceState(null, '', `#${page}`);
    } catch {
      // a page opened from a file may refuse to change its address
    }
    preload();
  }

  /** @param {number} p */
  function go(p) {
    page = (p + PAGES) % PAGES;
    render();
  }
  const next = () => go(page + 1);
  const prev = () => go(page - 1);
  const title = () => {
    if (page === LOCKS) {
      go(back);
    } else {
      back = page;
      go(LOCKS);
    }
  };

  inMock('[data-act="prev"]').addEventListener('click', prev);
  inMock('[data-act="next"]').addEventListener('click', next);
  inMock('[data-act="title"]').addEventListener('click', title);

  lockTiles.forEach((tile) => {
    tile.addEventListener('click', () => {
      const k = Number(tile.getAttribute('data-lock'));
      const label = tile.getAttribute('aria-label') ?? LOCK_NAMES[k] ?? '';
      const key = lockKeys[k] ? describe(lockKeys[k]) : null;
      if (key) {
        key.text = `${label} key (${key.text})`;
        flash(tile);
        log(key);
      }
      if (k < LOCK_NAMES.length) {
        mask ^= 1 << k;
        render();
      } else {
        status.textContent = `${label}: its key is in the log. On Linux nothing lights this LED, so the tile stays off.`;
      }
    });
  });

  // The arrow keys of the keyboard, and a swipe on a touch screen.
  mock.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') {
      prev();
      event.preventDefault();
    } else if (event.key === 'ArrowRight') {
      next();
      event.preventDefault();
    }
  });
  /** @type {{x: number, y: number} | null} */
  let touchStart = null;
  screen.addEventListener('touchstart', (event) => {
    const t = event.changedTouches[0];
    if (t) touchStart = { x: t.clientX, y: t.clientY };
  }, { passive: true });
  screen.addEventListener('touchend', (event) => {
    const t = event.changedTouches[0];
    if (!touchStart || !t) return;
    const dx = t.clientX - touchStart.x;
    const dy = t.clientY - touchStart.y;
    touchStart = null;
    if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > 2 * Math.abs(dy)) {
      if (dx < 0) next(); else prev();
    }
  }, { passive: true });

  const fromHash = parseInt(window.location.hash.replace('#', ''), 10);
  if (fromHash >= 0 && fromHash < PAGES) page = fromHash;
  render();
  return { go, state: () => ({ page, mask }) };
}
