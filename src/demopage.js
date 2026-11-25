// The page of the demo app in the browser: the slide show, the popup with all demos, the fake board with its lamps and the lamps on the PC.
// Everything is wired here; the demos themselves are in demos.js.

import { DEMOS, createRunner, demoById } from './demos.js';
import { drawBoard, drawPc } from './lampviews.js';
import { loadPhotos } from './photos.js';
import { readouts } from './readouts.js';
import { createTalk } from './talk.js';

/**
 * @typedef {object} PageEnv
 * @property {Document} document
 * @property {Window & typeof globalThis} window
 * @property {import('./talk.js').Slide[]} slides
 * @property {{go: (page: number) => void, bar: (rgb: number[] | null) => void, pages: number, currentBar: () => number[], onBar: (listener: (rgb: number[]) => void) => void}} device the fake board of mock.js
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
  const READY = 'Connected: NG-S3 (pretend), 27 pages';
  const logEl = byId('demolog');
  const status = byId('demo-status');
  const boardCanvas = /** @type {HTMLCanvasElement} */ (byId('board-lamps'));
  const pcCanvas = /** @type {HTMLCanvasElement} */ (byId('pc-lamps'));
  const dialog = /** @type {HTMLDialogElement} */ (byId('demos-dialog'));
  let message = '';

  const say = (/** @type {string} */ line) => {
    for (const r of readouts(line)) {
      lcd.delete(r.label);
      lcd.set(r.label, r);
      while (lcd.size > 3) lcd.delete(lcd.keys().next().value ?? '');
    }
    if (lcd.size) drawLcd();
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
    status.textContent = text === 'Ready' ? READY : text;
    status.classList.toggle('busy', text.startsWith('Running'));
  };
  /** The readouts of the bottom bar: the three most recent numbers of the log, oldest first. @type {Map<string, import('./readouts.js').Readout>} */
  const lcd = new Map();
  const drawLcd = () => {
    const cells = [...lcd.values()].map((r) => {
      const cell = document.createElement('div');
      cell.className = 'lcd-cell';
      const label = Object.assign(document.createElement('span'), { className: 'lcd-label', textContent: r.label });
      const digits = Object.assign(document.createElement('span'), { className: `lcd-digits ${r.tint === 'amber' ? '' : r.tint}`, textContent: r.text });
      digits.setAttribute('data-ghost', r.text.replace(/[0-9A-Za-z]/gu, '8'));
      const meter = Object.assign(document.createElement('span'), { className: `meter ${r.tint === 'amber' ? '' : r.tint}` });
      meter.style.setProperty('--f', String(Math.max(0, Math.min(1, r.value / r.max))));
      cell.append(label, digits, meter);
      return cell;
    });
    byId('lcd-readouts').replaceChildren(...cells);
  };

  // The lamps: the fake board and the PC panel draw the same state.
  // The ten lamps of the bar on the PC are the LEDs of the board: the colour of the page, the locks, an effect of the board and what the PC paints.
  const pcSnapshot = () => ({ ...lamps.snapshot(), bar: device.currentBar() });
  lamps.subscribe((snap) => {
    const active = snap.grid !== null || snap.barPage || snap.bar.some((c) => c !== 0);
    device.bar(active ? snap.bar : null);
    drawBoard(boardCanvas, snap, document);
    drawPc(pcCanvas, pcSnapshot(), document);
  });
  device.onBar(() => drawPc(pcCanvas, pcSnapshot(), document));
  const sizePc = () => {
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    pcCanvas.width = Math.round((pcCanvas.clientWidth || 480) * ratio);
    pcCanvas.height = Math.round((pcCanvas.clientHeight || 300) * ratio);
    drawPc(pcCanvas, pcSnapshot(), document);
  };
  sizePc();
  window.addEventListener('resize', sizePc);
  if (typeof window.ResizeObserver === 'function') new window.ResizeObserver(sizePc).observe(pcCanvas);

  const seconds = /** @type {HTMLInputElement} */ (byId('opt-seconds'));
  const option = (/** @type {string} */ id) => /** @type {HTMLInputElement} */ (byId(id));

  const runner = createRunner(() => ({
    lamps,
    log: say,
    seconds: Math.max(2, Number(seconds.value) || 8),
    device: { go: device.go, pages: device.pages },
    audio: audio ?? undefined,
    photos: (cols, rows) => loadPhotos(document, window, cols, rows),
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
  for (const [button, id] of [['demo-open', 'demos-dialog'], ['keys-open', 'keys-dialog'], ['sound-open', 'sound-dialog'], ['log-open', 'log-dialog'], ['shell-open', 'shell-dialog']]) {
    byId(button ?? '').addEventListener('click', () => /** @type {HTMLDialogElement} */ (byId(id ?? '')).showModal());
  }
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
  const total = byId('talk-progress');
  const perSlide = byId('slide-progress');
  const talkText = byId('lcd-talk-text');
  const talkLabel = byId('lcd-talk-label');
  const showSlide = (/** @type {import("./talk.js").Slide} */ s) => {
    title.textContent = s.title;
    bullets.replaceChildren(...s.bullets.map((b) => Object.assign(document.createElement('li'), { textContent: b })));
    image.hidden = s.image === null;
    if (s.image) image.src = s.image;
    const id = s.demo;
    if (runner.running()) runner.stop();
    if (id && demoById(id)) window.setTimeout(() => { if (!runner.start(id)) say(`could not start ${id}`); }, 120);
  };
  /** @type {ReturnType<typeof createTalk>} */
  const talk = createTalk(slides, {
    onSlide: showSlide,
    onTick: () => showProgress(),
    demoRunning: () => runner.running(),
  });
  function showProgress() {
    const p = talk.progress();
    total.style.setProperty('--f', String(p.fraction));
    perSlide.style.setProperty('--f', String(p.slideFraction));
    talkText.textContent = p.text;
    talkText.setAttribute('data-ghost', p.text.replace(/[0-9]/gu, '8'));
    talkLabel.textContent = talk.running() ? p.label : 'talk';
  }
  showProgress();
  const first = slides[0];
  if (first) showSlide({ ...first, demo: null });
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
  // A link can start a demo: device.html#demo=grid:raster%20bars (demos with sound wait for a click: the browser does not play before one)
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
