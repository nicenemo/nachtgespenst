// The script of the page: starts the demo with the real window and the keymap that keymap.js defines.
import { start as startClicker } from './clicker.js';
import { start } from './mock.js';

/** @type {import('./keylog.js').Layer[]} */
const keymap = globalThis.NG_KEYMAP ?? [];
start({
  document,
  window,
  keymap,
  lockKeys: globalThis.NG_LOCKKEYS ?? [],
  lockColors: globalThis.NG_LOCKCOLORS ?? [],
});
startClicker({ document, window });
