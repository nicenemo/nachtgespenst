// The two pictures of the lamps: what the screen of the fake board shows (hard pixel edges, as the device draws them) and what the PC window shows
// (the ten bar lamps in two columns and the grid smoothed by the browser, which scales it up with an interpolating filter: the same oversampling as the
// bicubic scaling of the Java app). Both read a snapshot of the lamps (lamps.js).

import { AREA_H, AREA_W, css, fitPicture, sideColours } from './lamps.js';

/**
 * A picture of cols x rows lamps as an offscreen canvas.
 * @param {Document} document
 * @param {{cols: number, rows: number, px: number[]}} grid
 * @returns {HTMLCanvasElement}
 */
function gridCanvas(document, grid) {
  const c = document.createElement('canvas');
  c.width = grid.cols;
  c.height = grid.rows;
  const g = c.getContext('2d');
  if (!g) return c;
  const image = g.createImageData(grid.cols, grid.rows);
  grid.px.forEach((rgb, i) => {
    image.data[i * 4] = (rgb >> 16) & 255;
    image.data[i * 4 + 1] = (rgb >> 8) & 255;
    image.data[i * 4 + 2] = rgb & 255;
    image.data[i * 4 + 3] = 255;
  });
  g.putImageData(image, 0, 0);
  return c;
}

/**
 * The screen of the fake board while it shows lamps: on one of the three pages of the lamps (a page number from 27 on, with the title) the whole screen is drawn here,
 * with the bottom bar of the device; on any other page the canvas is only shown while the PC paints a grid or the bar lamp page over it.
 * @param {HTMLCanvasElement} canvas 320 x 240
 * @param {import('./lamps.js').LampSnapshot} snap
 * @param {Document} document
 * @param {{page: number, title: string, pages: number} | null} [lampPage] the page of the board when it is a page of the lamps
 */
export function drawBoard(canvas, snap, document, lampPage = null) {
  const show = lampPage !== null || snap.grid !== null || snap.barPage;
  canvas.hidden = !show;
  const g = canvas.getContext('2d');
  if (!g || !show) return;
  g.fillStyle = '#000';
  g.fillRect(0, 0, canvas.width, canvas.height);
  const barPage = snap.barPage || (snap.grid === null && lampPage?.title === 'Lamps: bar');
  if (snap.grid) {
    g.imageSmoothingEnabled = false;
    const fit = fitPicture(AREA_W, AREA_H, snap.grid);
    g.drawImage(gridCanvas(document, snap.grid), fit.x, fit.y, fit.w, fit.h);
  } else if (barPage) {
    const gap = 3;
    const sw = Math.trunc((AREA_W - 11 * gap) / 10);
    g.fillStyle = '#080808';
    g.fillRect(0, 0, AREA_W, AREA_H);
    g.font = '10px monospace';
    snap.bar.forEach((rgb, i) => {
      const x = gap + i * (sw + gap);
      g.fillStyle = css(rgb);
      g.fillRect(x, 6, sw, AREA_H - 22 - 6);
      g.strokeStyle = '#404040';
      g.strokeRect(x - 0.5, 5.5, sw + 1, AREA_H - 22 - 5);
      g.fillStyle = '#fff';
      g.fillText('255', x + 2, AREA_H - 22 + 6);
      g.fillStyle = '#888';
      g.fillText(String(i), x + sw / 2 - 3, AREA_H - 22 + 18);
    });
  } else {
    g.fillStyle = '#080808';
    g.fillRect(0, 0, AREA_W, AREA_H);
    g.fillStyle = '#5a5f78';
    g.font = '14px sans-serif';
    g.fillText(lampPage?.title === 'Disk' ? 'Disk: nothing sent yet' : 'The PC paints the lamps here', 16, AREA_H / 2);
  }
  // the bottom bar of the device: the arrows and the title with the page number
  g.fillStyle = '#1b1d26';
  g.fillRect(0, AREA_H, canvas.width, canvas.height - AREA_H);
  const pill = (/** @type {number} */ x, /** @type {number} */ w, /** @type {string} */ fill) => {
    g.fillStyle = fill;
    g.beginPath();
    g.roundRect(x, 202, w, 34, 10);
    g.fill();
  };
  pill(2, 47, '#99f');
  pill(53, 214, '#fc9');
  pill(271, 47, '#99f');
  g.fillStyle = '#000';
  g.font = 'bold 16px sans-serif';
  g.textAlign = 'center';
  g.fillText('\u2190', 25, 225);
  g.fillText('\u2192', 294, 225);
  const label = lampPage ? `${lampPage.title} ${lampPage.page + 1}/${lampPage.pages}` : snap.grid ? `Lamps ${snap.grid.cols} x ${snap.grid.rows}` : 'LED bar lamps';
  g.fillText(label, 160, 225);
  g.textAlign = 'start';
}

/**
 * The lamps on the PC: the bar as two columns of five lamps left and right of the picture (lamps 0 to 4 run down the right side, lamps 5 to 9 up the left
 * side), and the grid in between, scaled smoothly.
 * @param {HTMLCanvasElement} canvas
 * @param {import('./lamps.js').LampSnapshot} snap
 * @param {Document} document
 */
export function drawPc(canvas, snap, document) {
  const g = canvas.getContext('2d');
  if (!g) return;
  const w = canvas.width;
  const h = canvas.height;
  g.fillStyle = '#000';
  g.fillRect(0, 0, w, h);
  const barW = Math.max(26, Math.min(46, Math.trunc(w / 14)));
  const gap = 10;
  const avail = w - 2 * (barW + gap) - 8;
  const top = 6;
  const room = h - 34;
  const fit = fitPicture(avail, room, snap.grid);
  const px = 4 + barW + gap + fit.x;
  const py = top + fit.y;
  for (const side of /** @type {const} */ (['left', 'right'])) {
    const bx = side === 'left' ? px - gap - barW : px + fit.w + gap;
    sideColours(snap.bar, side).forEach((rgb, i) => {
      const cell = fit.h / 5;
      const ly = py + i * cell + 3;
      g.fillStyle = rgb ? css(rgb) : '#1b1d26';
      g.shadowColor = rgb ? css(rgb) : 'transparent';
      g.shadowBlur = rgb ? 12 : 0;
      g.beginPath();
      g.roundRect(bx, ly, barW, cell - 6, 6);
      g.fill();
      g.shadowBlur = 0;
    });
  }
  if (snap.grid) {
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(gridCanvas(document, snap.grid), px, py, fit.w, fit.h);
    g.fillStyle = '#8a8a8a';
    g.font = '11px monospace';
    g.fillText(`${snap.grid.cols} x ${snap.grid.rows} lamps`, 8, Math.min(h - 6, py + fit.h + 18));
  } else {
    g.fillStyle = '#101010';
    g.fillRect(px, py, fit.w, fit.h);
    g.strokeStyle = '#808080';
    g.strokeRect(px + 0.5, py + 0.5, fit.w - 1, fit.h - 1);
    g.fillStyle = '#808080';
    g.font = '12px monospace';
    g.fillText(snap.barPage ? 'the lamps of the bar' : 'the lamp grid appears here', px + 12, py + fit.h / 2);
  }
}
