// The five photographs of the dissolve demo, from Wikimedia Commons under open licences (CC0, CC BY-SA 3.0 and 4.0), and how they become a grid of lamps:
// cut to the aspect of the grid (centre crop) and reduced with a box filter, as the desktop app does. The credits are shown on the page where the photos are.

/**
 * One photograph.
 * @typedef {object} Photo
 * @property {string} file the copy on this site (480 pixels wide, without metadata)
 * @property {string} title
 * @property {string} author
 * @property {string} licence
 * @property {string} licenceUrl
 * @property {string} source the page on Wikimedia Commons
 */

/** @type {Photo[]} */
export const PHOTOS = [
  {
    file: 'img/photos/photo0.jpg', title: 'Eiffel Tower and the Pont des Invalides, Paris', author: 'Pierre Blaché', licence: 'CC0 1.0',
    licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/', source: 'https://commons.wikimedia.org/wiki/File:Pont_des_Invalides_and_the_Eiffel_Tower,_Paris_31_August_2019.jpg',
  },
  {
    file: 'img/photos/photo1.jpg', title: 'Tower Bridge from Shad Thames, London', author: 'Colin', licence: 'CC BY-SA 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0/', source: 'https://commons.wikimedia.org/wiki/File:Tower_Bridge_from_Shad_Thames.jpg',
  },
  {
    file: 'img/photos/photo2.jpg', title: 'Brandenburg Gate in the evening, Berlin', author: 'Thomas Wolf (www.foto-tw.de)', licence: 'CC BY-SA 3.0',
    licenceUrl: 'https://creativecommons.org/licenses/by-sa/3.0/', source: 'https://commons.wikimedia.org/wiki/File:Brandenburger_Tor_abends.jpg',
  },
  {
    file: 'img/photos/photo3.jpg', title: 'Matterhorn at sunset', author: 'Sam Ferrara', licence: 'CC0 1.0',
    licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/', source: 'https://commons.wikimedia.org/wiki/File:Matterhorn_sunset_2016_(Unsplash).jpg',
  },
  {
    file: 'img/photos/photo4.jpg', title: 'Deventer seen from across the IJssel', author: 'Smiley.toerist', licence: 'CC BY-SA 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0/', source: 'https://commons.wikimedia.org/wiki/File:Deventer_aan_de_IJssel_2024.jpg',
  },
];

/**
 * A picture cut to the aspect of the grid and reduced to cols x rows lamps with a box filter.
 * @param {ArrayLike<number>} rgba the pixels of the picture, four bytes each
 * @param {number} width
 * @param {number} height
 * @param {number} cols
 * @param {number} rows
 * @returns {number[]} 0xRRGGBB per lamp
 */
export function toGrid(rgba, width, height, cols, rows) {
  const aspect = cols / rows;
  const cw = Math.min(width, height * aspect);
  const ch = cw / aspect;
  const x0 = (width - cw) / 2;
  const y0 = (height - ch) / 2;
  const out = new Array(cols * rows).fill(0);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const xa = Math.trunc(x0 + (x * cw) / cols);
      const xb = Math.max(xa + 1, Math.trunc(x0 + ((x + 1) * cw) / cols));
      const ya = Math.trunc(y0 + (y * ch) / rows);
      const yb = Math.max(ya + 1, Math.trunc(y0 + ((y + 1) * ch) / rows));
      let r = 0;
      let g = 0;
      let b = 0;
      let count = 0;
      for (let yy = ya; yy < yb && yy < height; yy++) {
        for (let xx = xa; xx < xb && xx < width; xx++) {
          const i = (yy * width + xx) * 4;
          r += rgba[i] ?? 0;
          g += rgba[i + 1] ?? 0;
          b += rgba[i + 2] ?? 0;
          count++;
        }
      }
      const n = Math.max(1, count);
      out[y * cols + x] = (Math.trunc(r / n) << 16) | (Math.trunc(g / n) << 8) | Math.trunc(b / n);
    }
  }
  return out;
}

/**
 * Loads the photographs as grids of lamps. Resolves to null when a picture cannot be loaded (the demo then draws its own scenes).
 * @param {Document} document
 * @param {Window & typeof globalThis} window
 * @param {number} cols
 * @param {number} rows
 * @returns {Promise<number[][] | null>}
 */
export async function loadPhotos(document, window, cols, rows) {
  try {
    return await Promise.all(PHOTOS.map((photo) => new Promise((resolve, reject) => {
      const image = new window.Image();
      image.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const g = canvas.getContext('2d');
        if (!g) {
          reject(new Error('no canvas'));
          return;
        }
        g.drawImage(image, 0, 0);
        resolve(toGrid(g.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height, cols, rows));
      };
      image.onerror = () => reject(new Error(`cannot load ${photo.file}`));
      image.src = photo.file;
    })));
  } catch {
    return null;
  }
}
