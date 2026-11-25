// The page of the demo app in the browser: the slide show, the popup with all demos, the fake board with its lamps and the lamps on the PC.
// Everything is wired here; the demos themselves are in demos.js.

import { DEMOS, createRunner, demoById } from './demos.js';
import { drawBoard, drawPc } from './lampviews.js';
import { createTalk } from './talk.js';

/**
 * @typedef {object} PageEnv
 * @property {Document} document
 * @property {Window & typeof globalThis} window
 * @property {import('./talk.js').Slide[]} slides
 * @property {{go: (page: number) => void, bar: (rgb: number[] | null) => void, pages: number}} device the fake board of mock.js
 * @property {ReturnType<typeof import('./lamps.js').createLamps>} lamps
 * @property {ReturnType<typeof import('./audioweb.js').createAudioRig>} audio the sound rig, or null without Web Audio
 * @property {string} link the address fragment, for example #demo=bar:comet
 */

const GROUPS = /** @type {const} */ ([
  ['parts', 'Parts'],
  ['microphone', 'Microphone, the page plays tones'],
  ['bar', 'LED bar, painted by the PC'],
  ['board', 'On the board itself'],
  ['grid', 'Lamp grid, in the style of a home computer'],
  ['photos', 'Dissolve between pictures'],
]);

/**
 * The page wiring. Returns what the shell and the tests need.
 * @param {PageEnv} env
 * @returns {{runner: ReturnType<typeof createRunner>, talk: ReturnType<typeof createTalk>, audio: ReturnType<typeof import('./audioweb.js').createAudioRig>, tick: () => void, dispose: () => void} | null} null when the page is not the demo page
 */
export function startDemoPage(env) {
  const { document, window, slides, device, lamps, audio } = env;
  if (!document.getElementById('demo-page')) return null;
  /** @param {string} id @returns {HTMLElement} */
  const byId = (id) => {
    const el = document.getElementById(id);
    if (!el) throw new Error(`the page has no element #${id}`);
    return el;
  };
  const logEl = byId('demolog');
  const status = byId('demo-status');
  const boardCanvas = /** @type {HTMLCanvasElement} */ (byId('board-lamps'));
  const pcCanvas = /** @type {HTMLCanvasElement} */ (byId('pc-lamps'));
  const dialog = /** @type {HTMLDialogElement} */ (byId('demos-dialog'));
  let message = '';

  const say = (/** @type {string} */ line) => {
    const t = new Date();
    const stamp = [t.getHours(), t.getMinutes(), t.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':');
    const el = document.createElement('div');
    el.className = 'kl';
    el.textContent = `${stamp}  ${line}`;
    logEl.append(el);
    while (logEl.children.length > 300) logEl.firstElementChild?.remove();
    logEl.scrollTop = logEl.scrollHeight;
  };
  const showStatus = (/** @type {string} */ text) => {
    message = text;
    status.textContent = text;
  };

  // The lamps: the fake board and the PC panel draw the same state.
  lamps.subscribe((snap) => {
    const active = snap.grid !== null || snap.barPage || snap.bar.some((c) => c !== 0);
    device.bar(active ? snap.bar : null);
    drawBoard(boardCanvas, snap, document);
    drawPc(pcCanvas, snap, document);
  });
  const sizePc = () => {
    const width = pcCanvas.clientWidth || 480;
    pcCanvas.width = Math.round(width * Math.min(2, window.devicePixelRatio || 1));
    pcCanvas.height = Math.round(pcCanvas.width * 0.62);
    drawPc(pcCanvas, lamps.snapshot(), document);
  };
  sizePc();
  window.addEventListener('resize', sizePc);

  const seconds = /** @type {HTMLInputElement} */ (byId('opt-seconds'));
  const option = (/** @type {string} */ id) => /** @type {HTMLInputElement} */ (byId(id));

  const runner = createRunner(() => ({
    lamps,
    log: say,
    seconds: Math.max(2, Number(seconds.value) || 8),
    device: { go: device.go, pages: device.pages },
    audio: audio ?? undefined,
    progress: (text) => showStatus(`Running: ${text}`),
  }), {
    onStart: (label) => {
      lamps.clear();
      showStatus(`Running: ${label}`);
      say(`=== ${label}`);
      setBusy(true);
    },
    onEnd: (note) => {
      say(`→ ${note}`);
      showStatus('Ready');
      setBusy(false);
      window.setTimeout(() => { if (!runner.running()) lamps.clear(); }, 1500);
    },
  });

  /** @param {boolean} busy */
  function setBusy(busy) {
    document.querySelectorAll('#demos-dialog button[data-demo], #demo-cycle').forEach((b) => { /** @type {HTMLButtonElement} */ (b).disabled = busy; });
    /** @type {HTMLButtonElement} */ (byId('demo-stop')).disabled = !busy;
  }

  // The popup: every demo of the desktop app, in groups.
  const columns = byId('demo-columns');
  for (const [group, title] of GROUPS) {
    const column = document.createElement('div');
    column.className = 'demo-group';
    const heading = document.createElement('h3');
    heading.textContent = title;
    column.append(heading);
    for (const demo of DEMOS.filter((d) => d.group === group)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = demo.label;
      button.setAttribute('data-demo', demo.id);
      button.addEventListener('click', () => {
        dialog.close();
        if (!runner.start(demo.id)) say('a demo is running: stop it first');
      });
      column.append(button);
    }
    columns.append(column);
  }
  byId('demo-cycle').addEventListener('click', () => {
    dialog.close();
    if (!runner.startCycle({ fast: option('opt-fast').checked, mic: option('opt-mic').checked })) say('a demo is running: stop it first');
  });
  byId('demo-open').addEventListener('click', () => dialog.showModal());
  byId('demo-stop').addEventListener('click', () => runner.stop());
  byId('demolog-clear').addEventListener('click', () => logEl.replaceChildren());
  if (audio) {
    option('opt-mic-real').addEventListener('change', async (e) => {
      const input = /** @type {HTMLInputElement} */ (e.target);
      if (!(await audio.useMicrophone(input.checked))) {
        input.checked = false;
        say('the microphone is not available (the browser asked and was refused, or there is none); the tones of the page are used');
      }
    });
    option('opt-speakers').addEventListener('change', (e) => audio.speakers(/** @type {HTMLInputElement} */ (e.target).checked));
  } else {
    document.querySelectorAll('.opt-audio').forEach((el) => { /** @type {HTMLElement} */ (el).hidden = true; });
  }
  setBusy(false);

  // The talk.
  const title = byId('slide-title');
  const bullets = byId('slide-bullets');
  const image = /** @type {HTMLImageElement} */ (byId('slide-image'));
  const counter = byId('slide-count');
  const total = /** @type {HTMLProgressElement} */ (byId('talk-progress'));
  const perSlide = /** @type {HTMLProgressElement} */ (byId('slide-progress'));
  const showSlide = (/** @type {import('./talk.js').Slide} */ s, /** @type {number} */ i) => {
    title.textContent = s.title;
    bullets.replaceChildren(...s.bullets.map((b) => Object.assign(document.createElement('li'), { textContent: b })));
    image.hidden = s.image === null;
    if (s.image) image.src = s.image;
    counter.textContent = `${i + 1} / ${slides.length}`;
    const id = s.demo;
    if (runner.running()) runner.stop();
    if (id && demoById(id)) window.setTimeout(() => { if (!runner.start(id)) say(`could not start ${id}`); }, 120);
  };
  const talk = createTalk(slides, {
    onSlide: showSlide,
    onTick: () => {
      const p = talk.progress();
      total.value = p.fraction;
      perSlide.value = p.slideFraction;
      if (talk.running()) counter.title = `${p.text}  ${p.label}`;
    },
    demoRunning: () => runner.running(),
  });
  const first = slides[0];
  if (first) showSlide({ ...first, demo: null }, 0);
  byId('talk-start').addEventListener('click', () => { say(`=== the talk starts, ${slides.length} slides, about ${Math.round(talk.total() / 60000)} minutes`); talk.start(); });
  byId('talk-pause').addEventListener('click', () => talk.pause());
  byId('talk-prev').addEventListener('click', () => (talk.running() ? talk.prev() : undefined));
  byId('talk-next').addEventListener('click', () => (talk.running() ? talk.next() : undefined));
  byId('talk-stop').addEventListener('click', () => { talk.stop(); runner.stop(); say('The talk is stopped.'); });
  const tick = () => talk.tick();
  const timer = window.setInterval(tick, 250);
  document.addEventListener('keydown', (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    if (target.closest('input, textarea, dialog')) return;
    if (e.key === 'F5') { e.preventDefault(); byId('talk-start').click(); }
    else if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') talk.next();
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') talk.prev();
    else if (e.key === 'p' || e.key === 'P') talk.pause();
    else if (e.key === 'Escape') { talk.stop(); runner.stop(); }
  });
  showStatus(message || 'Ready');
  // A link can start a demo: demo-app.html#demo=grid:raster%20bars (demos with sound wait for a click: the browser does not play before one)
  const linked = env.link.match(/^#demo=(.+)$/u)?.[1];
  if (linked && demoById(linked) && !linked.match(/^(scope|vu|miccheck)$/u)) window.setTimeout(() => runner.start(linked), 300);
  return {
    runner,
    talk,
    audio,
    tick,
    /** Stops the timer of the talk (for tests and when the page goes). */
    dispose: () => { window.clearInterval(timer); runner.stop(); },
  };
}
