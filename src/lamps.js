// The state of the lamps of the fake board: the ten lamps of the LED bar and, on the grid page, a grid of lamps. The demos write into it;
// the screen of the fake board and the "lamps on the PC" panel read from it. Colours are 0xRRGGBB.

/** The lamp area of the device screen: 320 x 190 pixels. */
export const AREA_W = 320;
export const AREA_H = 190;

/**
 * What the lamps show now.
 * @typedef {object} LampSnapshot
 * @property {number[]} bar the ten lamps of the LED bar
 * @property {{cols: number, rows: number, px: number[]} | null} grid the lamp grid, or null when there is none
 * @property {boolean} barPage whether the device shows its bar lamp page (ten swatches instead of a grid)
 */

/**
 * The lamps.
 * @returns {{snapshot: () => LampSnapshot, setBar: (rgb: number[]) => void, setGrid: (px: number[], cols: number, rows: number) => void, barPage: () => void, clear: () => void, subscribe: (listener: (s: LampSnapshot) => void) => () => void, counters: () => {frames: number, lamps: number}}}
 */
export function createLamps() {
  /** @type {number[]} */
  let bar = new Array(10).fill(0);
  /** @type {{cols: number, rows: number, px: number[]} | null} */
  let grid = null;
  let barPage = false;
  let frames = 0;
  let lamps = 0;
  /** @type {Set<(s: LampSnapshot) => void>} */
  const listeners = new Set();

  const snapshot = () => ({ bar: [...bar], grid: grid ? { cols: grid.cols, rows: grid.rows, px: [...grid.px] } : null, barPage });
  const notify = () => {
    const s = snapshot();
    listeners.forEach((l) => l(s));
  };

  return {
    snapshot,
    setBar(rgb) {
      bar = rgb.slice(0, 10).map((c) => c & 0xffffff);
      frames++;
      lamps += 10;
      notify();
    },
    setGrid(px, cols, rows) {
      grid = { cols, rows, px: px.map((c) => c & 0xffffff) };
      barPage = false;
      frames++;
      lamps += cols * rows;
      notify();
    },
    barPage() {
      grid = null;
      barPage = true;
      notify();
    },
    clear() {
      bar = new Array(10).fill(0);
      grid = null;
      barPage = false;
      frames = 0;
      lamps = 0;
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    counters: () => ({ frames, lamps }),
  };
}

/**
 * A colour as a CSS string.
 * @param {number} rgb
 * @returns {string}
 */
export function css(rgb) {
  return `#${(rgb & 0xffffff).toString(16).padStart(6, '0')}`;
}

/**
 * Where a lamp of the LED bar sits on the two vertical bars: lamps 0 to 4 run down the right side, lamps 5 to 9 run up the left side (webcam measurement).
 * @param {number} lamp 0 to 9
 * @returns {{side: 'left' | 'right', row: number}} the row counts from the top
 */
export function barPosition(lamp) {
  return lamp < 5 ? { side: 'right', row: lamp } : { side: 'left', row: 9 - lamp };
}

/**
 * The colours of the lamps of one side of the bar, from the top, as the screen of the PC and the fake board draw them.
 * @param {number[]} bar the ten lamps
 * @param {'left' | 'right'} side
 * @returns {number[]} five colours
 */
export function sideColours(bar, side) {
  return Array.from({ length: 5 }, (_, row) => bar[side === 'right' ? row : 9 - row] ?? 0);
}

/**
 * The layout of the lamp picture inside a panel, with the aspect of the grid (or of the device's lamp area without one).
 * @param {number} width the width available
 * @param {number} height the height available
 * @param {{cols: number, rows: number} | null} grid
 * @returns {{x: number, y: number, w: number, h: number}}
 */
export function fitPicture(width, height, grid) {
  const aspect = grid ? grid.cols / grid.rows : AREA_W / AREA_H;
  let w = width;
  let h = w / aspect;
  if (h > height) {
    h = height;
    w = h * aspect;
  }
  return { x: (width - w) / 2, y: (height - h) / 2, w, h };
}
