// The CoreS3 in the browser: the screenshots of the real board stitched into a page that can be paged and clicked.
// The arrows and the title (which opens and closes the Locks page) work as on the device; on the Locks page the Caps, Num and Scroll tiles switch
// between eight real screenshots and the two LED bars follow the rule of the firmware; on every key page a tapped tile writes the HID report that
// the device would send into a log. Nothing is sent and nothing here simulates the firmware: the reports come from the keymap it is built from.
import { attachShell } from './shellui.js';
import { createShell } from './shell.js';
import { LAMP_PAGES, LOCKS, LOCK_NAMES, PAGES, SCREEN_H, SCREEN_W, barColours, bytes, describe, hex, lockText, pageImage, tileRects } from './keylog.js';

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
 * @property {import('./shell.js').Help[]} [help] the manual of the shell; without it the page has no shell
 * @property {((command: string, args: string[]) => string[] | null) | undefined} [extra] the commands of optional components that this page has
 */

const MAX_LOG_LINES = 200;
const FLASH_MS = 160;
const SWIPE_PX = 50;

/**
 * Puts the demo on the page.
 * @param {Environment} env
 * @returns {{go: (page: number) => void, state: () => {page: number, mask: number}, bar: (rgb: number[] | null) => void, pages: number, currentBar: () => number[], onBar: (listener: (rgb: number[]) => void) => void, onPage: (listener: (page: number) => void) => void} | null} null when the page has no demo
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
  let presses = 0;
  let last = '';
  let ledMode = 'on';
  /** @type {number[] | null} colours of the ten lamps that a demo sets; null shows the colour of the page */
  let barOverride = null;
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

  /** @type {Array<(rgb: number[]) => void>} */
  const barListeners = [];
  /** @type {Array<(page: number) => void>} */
  const pageListeners = [];
  /** @type {number[]} what the ten LEDs show now, as 0xRRGGBB */
  let barNow = new Array(10).fill(0);

  /** The title of the current page: a key layer, the Locks page or one of the three pages of the lamps. */
  function pageTitle() {
    return page < LOCKS ? keymap[page]?.title ?? '' : page === LOCKS ? 'Locks' : LAMP_PAGES[page - LOCKS - 1] ?? '';
  }

  function drawBar() {
    const dark = ledMode === 'off' || (ledMode === 'locks' && page < LOCKS);
    const colours = barOverride ? barOverride.map((rgb) => [(rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255]) : dark ? Array.from({ length: 10 }, () => [0, 0, 0]) : barColours(page, mask, keymap[page]?.color ?? '#000000', lockColors);
    colours.forEach((c, lamp) => {
      const led = leds[String(lamp)];
      if (!led) return;
      const lit = c.some((v) => v > 0);
      led.style.background = lit ? `rgb(${c.join(',')})` : '';
      led.style.boxShadow = lit ? `0 0 10px 2px rgba(${c.join(',')},.55)` : '';
    });
    barNow = colours.map((c) => ((c[0] ?? 0) << 16) | ((c[1] ?? 0) << 8) | (c[2] ?? 0));
    barListeners.forEach((listener) => listener(barNow));
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
      presses++;
      last = d.text.replace(/\s+/gu, '_');
      logEl.append(line('down', [time, '▼', name, d.kind, `report ${hex(d.down[0], 2)}: ${bytes(d.down[1])}`, `(${d.detail})`]));
      if (d.up) logEl.append(line('up', [time, '▲', 'release', d.kind, `report ${hex(d.up[0], 2)}: ${bytes(d.up[1])}`]));
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
      if (description.blocked) button.setAttribute('data-blocked', 'true');
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
      if (!src || preloaded[src]) continue;
      const image = new window.Image();
      image.src = src;
      preloaded[src] = image;
    }
  }

  function render() {
    const title = pageTitle();
    if (page <= LOCKS) img.src = pageImage(page, mask);
    img.alt = page < LOCKS ? `CoreS3 screenshot of the page ${title}` : page === LOCKS ? 'CoreS3 screenshot of the Locks page' : `The ${title} page of the CoreS3`;
    img.style.visibility = page > LOCKS ? 'hidden' : '';
    lockTiles.forEach((tile) => { tile.hidden = page !== LOCKS; });
    status.textContent = page < LOCKS
      ? `Page ${page + 1} of ${PAGES}: ${title}. The LED bars show its colour, ${keymap[page]?.color ?? ''}.`
      : page === LOCKS ? `Locks page: ${lockText(mask)}. Tap a tile to switch it, tap the title to go back.`
        : `Page ${page + 1} of ${PAGES}: ${title}. The lamps are drawn by the PC: start a demo to see them.`;
    drawBar();
    buildTiles();
    pageListeners.forEach((listener) => listener(page));
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

  /**
   * What a touch at a point of the screen does. A point on, or within 2 pixels of, a tile that powers the computer down is refused.
   * @param {number} x
   * @param {number} y
   * @param {boolean} touch whether to touch; false only asks
   * @returns {'ok' | 'refused' | 'none'}
   */
  function tapAt(x, y, touch) {
    const candidates = page === LOCKS ? lockTiles : keyTiles;
    /** @param {HTMLElement} el @param {number} margin */
    const inside = (el, margin) => {
      const n = (/** @type {string} */ name) => Number(el.getAttribute(name));
      return x >= n('data-x') - margin && x < n('data-x') + n('data-w') + margin && y >= n('data-y') - margin && y < n('data-y') + n('data-h') + margin;
    };
    if (candidates.some((el) => el.getAttribute('data-blocked') === 'true' && inside(el, 2))) return 'refused';
    const hit = candidates.find((el) => inside(el, 0));
    if (!hit) return 'none';
    if (touch) hit.click();
    return 'ok';
  }

  /**
   * Presses a tile as the shell command key does, without showing its page.
   * @param {number} layer
   * @param {number} tile
   * @returns {boolean}
   */
  function pressTile(layer, tile) {
    if (layer === LOCKS) {
      const el = lockTiles[tile];
      if (!el) return false;
      el.click();
      return true;
    }
    const binding = keymap[layer]?.tiles[tile];
    const d = binding ? describe(binding) : null;
    if (!d || d.blocked) return false;
    log(d);
    return true;
  }

  /** @returns {import('./shell.js').Rect[]} */
  function rects() {
    if (page === LOCKS) {
      return lockTiles.map((el, index) => ({ index, x: Number(el.getAttribute('data-x')), y: Number(el.getAttribute('data-y')), w: Number(el.getAttribute('data-w')), h: Number(el.getAttribute('data-h')), name: el.getAttribute('aria-label') ?? '' }));
    }
    const layer = keymap[page];
    if (!layer) return [];
    return tileRects(layer).map((r) => ({ ...r, name: layer.tiles[r.index]?.[4]?.replace(/^\+/u, '') ?? layer.tiles[r.index]?.[3] ?? '' }));
  }

  if (env.help) {
    const shell = createShell({
      board: 'S3',
      help: env.help,
      api: {
        pages: PAGES,
        page: () => page,
        title: () => pageTitle(),
        go,
        mask: () => mask,
        stats: () => ({ presses, last }),
        rects,
        tap: tapAt,
        press: pressTile,
        leds: (mode) => { ledMode = mode; drawBar(); },
        extra: env.extra,
      },
    });
    attachShell(document, shell);
  }

  const fromHash = parseInt(window.location.hash.replace('#', ''), 10);
  if (fromHash >= 0 && fromHash < PAGES) page = fromHash;
  render();
  return {
    go,
    state: () => ({ page, mask }),
    /** A demo sets the ten lamps of the bar; null gives the bar back to the page. */
    bar: (/** @type {number[] | null} */ rgb) => { barOverride = rgb; drawBar(); },
    pages: PAGES,
    /** What the ten LEDs of the fake board show now: the colour of the page, the locks, a demo or an effect. */
    currentBar: () => [...barNow],
    /** Tells the listener whenever the LEDs change. */
    onBar: (/** @type {(rgb: number[]) => void} */ listener) => { barListeners.push(listener); },
    /** Tells the listener whenever another page is shown. */
    onPage: (/** @type {(page: number) => void} */ listener) => { pageListeners.push(listener); },
  };
}
