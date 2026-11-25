// The slide show: each slide stays for its seconds, and a slide with a demo also waits for that demo to end. The same rules as the player of the desktop app.

/**
 * One slide of the talk (site/slides.js, generated from tools/talk).
 * @typedef {object} Slide
 * @property {string} title
 * @property {number} seconds
 * @property {string | null} demo the demo to start with the slide, for example bar:nightrider
 * @property {string[]} bullets
 * @property {string | null} image
 */

/**
 * @typedef {object} TalkHooks
 * @property {(slide: Slide, index: number) => void} onSlide a slide is shown
 * @property {() => void} onTick the progress changed
 * @property {() => boolean} demoRunning whether a demo is still running
 * @property {() => number} [clock] milliseconds, for tests
 */

/**
 * The player of the talk.
 * @param {Slide[]} slides
 * @param {TalkHooks} hooks
 */
export function createTalk(slides, hooks) {
  const clock = hooks.clock ?? Date.now;
  let index = -1;
  let slideStart = 0;
  let pausedAt = 0;
  let running = false;
  let paused = false;

  const now = () => (paused ? pausedAt : clock());
  const total = () => slides.reduce((n, s) => n + s.seconds * 1000, 0);

  /** @param {number} i */
  function go(i) {
    if (i >= slides.length) {
      stop();
      return;
    }
    index = Math.max(0, i);
    slideStart = clock();
    paused = false;
    const slide = slides[index];
    if (slide) hooks.onSlide(slide, index);
    hooks.onTick();
  }

  function stop() {
    running = false;
    index = -1;
    hooks.onTick();
  }

  return {
    start() {
      running = true;
      paused = false;
      go(0);
    },
    stop,
    pause() {
      if (!running) return;
      if (paused) {
        slideStart += clock() - pausedAt;
        paused = false;
      } else {
        paused = true;
        pausedAt = clock();
      }
      hooks.onTick();
    },
    next() { if (running) go(index + 1); },
    prev() { if (running) go(index - 1); },
    go,
    /** Called about four times a second: moves on when the slide has had its time and its demo is over. */
    tick() {
      if (!running || paused) return;
      const s = slides[index];
      if (!s) return;
      if (clock() - slideStart >= s.seconds * 1000 && !(s.demo !== null && hooks.demoRunning())) go(index + 1);
      else hooks.onTick();
    },
    running: () => running,
    paused: () => paused,
    index: () => index,
    /** @returns {{fraction: number, text: string, slideFraction: number, label: string}} the progress of the talk and of the slide */
    progress() {
      const elapsedSlides = slides.slice(0, Math.max(0, index)).reduce((n, s) => n + s.seconds * 1000, 0);
      const current = slides[index];
      const onSlide = current ? Math.min(current.seconds * 1000, now() - slideStart) : 0;
      const e = Math.trunc((elapsedSlides + onSlide) / 1000);
      const t = Math.trunc(total() / 1000);
      const left = current ? Math.max(0, current.seconds - Math.trunc(onSlide / 1000)) : 0;
      return {
        fraction: t === 0 ? 0 : e / t,
        text: `${minutes(e)} / ${minutes(t)}${paused ? ' ||' : ''}`,
        slideFraction: current && current.seconds > 0 ? Math.min(1, onSlide / (current.seconds * 1000)) : 0,
        label: `slide ${index + 1}/${slides.length}   ${minutes(left)} left`,
      };
    },
    total,
  };
}

/**
 * Seconds as m:ss.
 * @param {number} s
 * @returns {string}
 */
export function minutes(s) {
  return `${Math.trunc(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
