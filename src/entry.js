// The script of the page: starts the demo with the real window and the keymap that keymap.js defines.
import { start as startClicker } from './clicker.js';
import { startDemoPage } from './demopage.js';
import { createLamps } from './lamps.js';
import { createAudioRig } from './audioweb.js';
import { createOptional } from './optional.js';
import { start } from './mock.js';

/** @type {import('./keylog.js').Layer[]} */
const keymap = globalThis.NG_KEYMAP ?? [];
// the address names a demo to start (device.html#demo=bar:comet); the page of the device rewrites the address, so it is read first
const link = decodeURIComponent(window.location.hash);
const lamps = createLamps();
const onDemoPage = document.getElementById('demo-page') !== null;
const audio = onDemoPage ? createAudioRig(window) : null;
const optional = createOptional(lamps, () => audio?.wave() ?? new Array(512).fill(0));
const device = start({
  document,
  window,
  keymap,
  lockKeys: globalThis.NG_LOCKKEYS ?? [],
  lockColors: globalThis.NG_LOCKCOLORS ?? [],
  help: globalThis.NG_SHELLHELP_FULL ?? globalThis.NG_SHELLHELP ?? [],
  extra: onDemoPage ? optional : undefined,
});
startClicker({ document, window, help: globalThis.NG_SHELLHELP ?? [] });
if (device) startDemoPage({ document, window, slides: globalThis.NG_SLIDES ?? [], device, lamps, audio, link });
