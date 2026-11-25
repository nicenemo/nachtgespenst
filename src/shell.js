// The fake shell of the web demos: the serial shell of the boards (docs/shell/commands.txt) answered by the demo on the page.
// Commands, arguments and replies follow src/SerialCmd.cpp. Whatever needs a real board (heap, stack, crash, the SD card) answers with plausible
// fixed values, and the optional components that the standard firmware lacks (lamps, disk, mic, ...) answer ERR unknown, as a standard board does.

/**
 * What the shell needs from the demo it belongs to.
 * @typedef {object} Api
 * @property {number} pages the number of pages
 * @property {() => number} page the current page
 * @property {() => string} title the title of the current page
 * @property {(page: number) => void} go shows a page
 * @property {() => number} mask the locks that are on: Caps 1, Num 2, Scroll 4
 * @property {() => {presses: number, last: string}} stats the number of key presses and the last key
 * @property {() => Rect[]} rects the tiles of the current page that can be pressed
 * @property {(x: number, y: number, touch: boolean) => 'ok' | 'refused' | 'none'} tap what a touch at the point does; with touch false nothing is touched
 * @property {(layer: number, tile: number) => boolean} press presses a tile as if it was touched
 * @property {(leds: string) => void} leds the mode of the LED bar: off, locks or on
 * @property {((on: boolean) => void) | undefined} [smooth] switches the smooth drawing of the lamp grid
 * @property {(button: number, down: boolean) => boolean} [button] a physical button (A, B, C) of the presenter
 * @property {(name: string) => boolean} [clicker] a clicker action: prev, next, start, blank, end, laser
 * @property {(on: boolean) => void} [pointer] switches the air mouse page
 * @property {() => boolean} [pointerOn] whether the air mouse is on
 * @property {(buttons: number, dx: number, dy: number, wheel: number) => void} [mouse] writes a mouse report
 * @property {(mods: number) => void} [mods] writes the report of the held modifiers
 * @property {((command: string, args: string[]) => string[] | null) | undefined} [extra] the commands of optional components that the page has; null when the command is not one of them
 */

/** @typedef {{index: number, x: number, y: number, w: number, h: number, name: string}} Rect */
/** @typedef {{name: string, usage: string, summary: string, text: string[], replies: string[], examples: string[]}} Help */

const EFFECTS = ['none', 'nightrider', 'breath', 'rainbow', 'comet', 'sparkle', 'vu'];
const MODIFIER_MASKS = /** @type {Record<string, number>} */ ({ ctrl: 1, shift: 2, alt: 4, win: 8, cs: 3, as: 6, meh: 7, hyper: 15 });
const CLICKER_ACTIONS = ['prev', 'next', 'start', 'blank', 'end', 'laser'];
const MOUSE_BUTTONS = /** @type {Record<string, number>} */ ({ left: 1, right: 2, middle: 4 });
const PREFER = ['USB', 'BLE', 'BOTH', 'USB_ONLY', 'BLE_ONLY'];

/**
 * A whole number from a word, or null.
 * @param {string | undefined} text
 * @returns {number | null}
 */
function whole(text) {
  return text !== undefined && /^-?\d+$/u.test(text) ? Number(text) : null;
}

/**
 * A number from a word, or null.
 * @param {string | undefined} text
 * @returns {number | null}
 */
function decimal(text) {
  const n = Number(text);
  return text !== undefined && text.trim() !== '' && Number.isFinite(n) ? n : null;
}

/**
 * The shell of one board.
 * @param {{board: 'S3' | 'C2', help: Help[], api: Api}} options
 * @returns {{run: (line: string) => string[], commands: () => string[], prompt: string}}
 */
export function createShell({ board, help, api }) {
  const presenter = board === 'C2';
  const settings = { led: 'on', bright: 40, ledidle: 0, bl: 128, dim: 60, off: 300, prefer: 'usb', effect: 'none', smooth: 'off' };
  const pointer = { gain: 20, idle: 2, upright: 0, flipx: 0, flipy: 0, reports: 0, clicks: 0, scrolls: 0, mods: 0, state: 'still' };
  let preferred = 0;
  let touching = false;
  const started = Date.now();

  const usb = presenter ? 0 : 1;
  const summary = () => Object.entries(settings).map(([k, v]) => `${k}=${v}`).join(' ');
  const flag = (/** @type {number} */ v) => (v ? 1 : 0);

  /** @param {string} name @returns {Help | undefined} */
  const helpFor = (name) => help.find((h) => h.name === name);

  /** @param {string | undefined} name @returns {string[]} */
  function helpText(name) {
    if (name === undefined) {
      return ['OK HELP', ...help.map((h) => `${h.name.padEnd(8)} ${h.summary}`), 'help <command> explains one command'];
    }
    const h = helpFor(name);
    if (!h) return ['ERR help unknown'];
    return [`OK HELP ${name}`, `usage: ${h.usage}`, `summary: ${h.summary}`, ...h.text, ...h.replies.map((r) => `reply: ${r}`), ...h.examples.map((e) => `example: ${e}`)];
  }

  function state() {
    const { presses, last } = api.stats();
    const mask = api.mask();
    const ptr = presenter ? (api.pointerOn?.() ? pointer.state : 'off') : '-';
    return `OK STATE page=${api.page()}/${api.pages} title=${api.title()} caps=${mask & 1 ? 1 : 0} num=${mask & 2 ? 1 : 0} scroll=${mask & 4 ? 1 : 0} compose=0 kana=0 last=${last || '-'} presses=${presses} conn=1 usb=${usb} ble=1 touch=${flag(touching ? 1 : 0)} btn=0 ptr=${ptr} clicks=${pointer.clicks}`;
  }

  const pointerStatus = () => `OK PRESENTER pointer=${api.pointerOn?.() ? pointer.state : 'off'} gain=${pointer.gain} idle=${pointer.idle.toFixed(1)} upright=${pointer.upright} flipx=${pointer.flipx} flipy=${pointer.flipy} reports=${pointer.reports} clicks=${pointer.clicks} scrolls=${pointer.scrolls} mods=${pointer.mods} ble=1`;

  /** @param {string[]} a @returns {string[]} */
  function set(a) {
    if (a.length === 0) return [`OK SET ${summary()}`];
    const [key, value] = a;
    if (a.length !== 2 || key === undefined || value === undefined) return ['ERR unknown'];
    const n = whole(value);
    /** @param {number} lo @param {number} hi */
    const within = (lo, hi) => n !== null && n >= lo && n <= hi;
    switch (key) {
      case 'led':
        if (!['off', 'locks', 'on'].includes(value)) return ['ERR set'];
        settings.led = value;
        api.leds(value);
        break;
      case 'effect':
        if (!EFFECTS.includes(value)) return ['ERR set'];
        settings.effect = value;
        break;
      case 'smooth':
        if (value !== 'on' && value !== 'off') return ['ERR set'];
        settings.smooth = value;
        api.smooth?.(value === 'on');
        break;
      case 'prefer':
        if (!['usb', 'ble', 'both'].includes(value)) return ['ERR set'];
        settings.prefer = value;
        preferred = ['usb', 'ble', 'both'].indexOf(value);
        break;
      case 'bright': if (!within(1, 120) || n === null) return ['ERR set']; settings.bright = n; break;
      case 'ledidle': if (!within(0, 1440) || n === null) return ['ERR set']; settings.ledidle = n; break;
      case 'bl': if (!within(16, 255) || n === null) return ['ERR set']; settings.bl = n; break;
      case 'dim':
        if (!within(5, 3600) || n === null) return ['ERR set'];
        settings.dim = n;
        if (settings.off <= n) settings.off = n + 10;
        break;
      case 'off': if (!within(15, 86400) || n === null || n <= settings.dim) return ['ERR set']; settings.off = n; break;
      case 'defaults':
        Object.assign(settings, { led: 'on', bright: 40, ledidle: 0, bl: 128, dim: 60, off: 300, prefer: 'usb', effect: 'none', smooth: 'off' });
        preferred = 0;
        api.leds('on');
        api.smooth?.(false);
        break;
      default: return ['ERR set'];
    }
    return [`OK SET ${summary()}`];
  }

  /** @param {string[]} a @returns {string[]} */
  function pointerCommand(a) {
    const [first, second, third] = a;
    if (first === undefined) return [pointerStatus()];
    const setter = api.pointer;
    if (a.length === 1 && setter && (first === 'on' || first === 'off' || first === 'toggle')) {
      setter(first === 'toggle' ? !api.pointerOn?.() : first === 'on');
      return [pointerStatus()];
    }
    if (first === 'click' && a.length <= 2 && (second === undefined || second in MOUSE_BUTTONS)) {
      pointer.clicks++;
      api.mouse?.(MOUSE_BUTTONS[second ?? 'left'] ?? 1, 0, 0, 0);
      return ['OK POINTER CLICK'];
    }
    const ticks = whole(second);
    if (first === 'scroll' && a.length === 2 && ticks !== null && ticks >= -127 && ticks <= 127) {
      if (ticks !== 0) {
        pointer.scrolls++;
        api.mouse?.(0, 0, 0, ticks);
      }
      return ['OK POINTER SCROLL'];
    }
    if (first === 'feed' && a.length === 3) {
      moveBy(Number(second), Number(third));
      return ['OK POINTER FEED'];
    }
    if (a.length === 2 && second !== undefined && third === undefined) {
      return [tune(first, second) ? 'OK POINTER SET' : 'ERR pointer'];
    }
    return ['ERR unknown'];
  }

  /**
   * One 0.6 s turn: while the air mouse is on, the reports of the pointer.
   * @param {number} yaw degrees per second
   * @param {number} pitch degrees per second
   */
  function moveBy(yaw, pitch) {
    if (!api.pointerOn?.()) return;
    const sign = (/** @type {number} */ flip) => (flip ? -1 : 1);
    const dx = Math.max(-127, Math.min(127, Math.round(yaw * 0.6 * pointer.gain / 10 * sign(pointer.flipx))));
    const dy = Math.max(-127, Math.min(127, Math.round(-pitch * 0.6 * pointer.gain / 10 * sign(pointer.flipy))));
    if (dx === 0 && dy === 0) return;
    pointer.reports++;
    pointer.state = 'moving';
    api.mouse?.(0, dx, dy, 0);
  }

  /**
   * @param {string} key
   * @param {string} value
   * @returns {boolean}
   */
  function tune(key, value) {
    const f = decimal(value) ?? 0;
    if (key === 'gain' && f >= 1 && f <= 100) { pointer.gain = Math.round(f); return true; }
    if (key === 'idle' && f >= 0.5 && f <= 30) { pointer.idle = f; return true; }
    if (value !== 'on' && value !== 'off') return false;
    const on = value === 'on' ? 1 : 0;
    if (key === 'upright' || key === 'flipx' || key === 'flipy') { pointer[key] = on; return true; }
    return false;
  }

  /** @param {string[]} a @returns {string[]} */
  function tiles(a) {
    if (a.length > 0) return ['ERR unknown'];
    const list = api.rects();
    return [`OK TILES page=${api.page()} count=${list.length}`, ...list.map((r) => `TILE ${r.index} ${r.x} ${r.y} ${r.w} ${r.h} ${r.name.replace(/ /gu, '_')}`)];
  }

  /** @param {string} command @param {string[]} a @returns {string[] | null} null when it is not this command's shape */
  function touch(command, a) {
    const x = whole(a[0]);
    const y = whole(a[1]);
    if (x === null || y === null || a.length !== 2) return null;
    if (command === 'tapok') return [`OK TAPOK ${api.tap(x, y, false) === 'refused' ? 'refused' : 'allowed'}`];
    if (command === 'tap') return [api.tap(x, y, true) === 'ok' ? 'OK TAP' : 'ERR tap'];
    touching = api.tap(x, y, true) === 'ok';
    return [touching ? 'OK DOWN' : 'ERR down'];
  }

  /**
   * Runs a line.
   * @param {string} line
   * @returns {string[]} the lines of the reply
   */
  function run(line) {
    const words = line.trim().split(/\s+/u).filter(Boolean);
    const [command, ...a] = words;
    if (command === undefined) return [];
    const none = a.length === 0;
    const n = whole(a[0]);
    switch (command) {
      case 'help': return a.length <= 1 ? helpText(a[0]) : ['ERR unknown'];
      case 'ping': return none ? ['OK PONG'] : ['ERR unknown'];
      case 'info':
        return none ? [`OK INFO board=${board} name=NG-${board} fw=web-demo w=320 h=240 pages=${api.pages} locks=${presenter ? 255 : 26} presenter=${presenter ? 1 : 0}`] : ['ERR unknown'];
      case 'state': return none ? [state()] : ['ERR unknown'];
      case 'wake': return none ? ['OK WAKE'] : ['ERR unknown'];
      case 'heap':
        if (none) return ['OK HEAP free=3073680 min=71616 largest=2949108 internal=74044 internal_min=72344 psram=3000408'];
        return a.length === 1 && a[0] === 'check' ? ['OK HEAP CHECK ok=1'] : ['ERR unknown'];
      case 'stack': return none ? ['OK STACK loop=1716 bar-fx=3508'] : ['ERR unknown'];
      case 'crash': return none ? [`OK CRASH reason=poweron boots=1 uptime_s=${Math.floor((Date.now() - started) / 1000)} last=- crumbs=0`] : ['ERR unknown'];
      case 'perf': return none ? [`OK PERF build_ms=21.9 render_ms=72.2 flush_ms=29.8 strips=6 page=${api.page()}`] : ['ERR unknown'];
      case 'sd': return none ? ['OK SD present=0 (a browser has no SD card)'] : ['ERR unknown'];
      case 'bl':
        if (a.length !== 1) return ['ERR unknown'];
        if (a[0] === 'auto') return ['OK BL AUTO'];
        return n !== null && n >= 0 && n <= 255 ? [`OK BL ${n}`] : ['ERR bl'];
      case 'leds':
        if (none) return [`OK LEDS ${summary()}`];
        return a.length === 1 && a[0] !== undefined && set(['led', a[0]])[0]?.startsWith('OK') ? [`OK LEDS ${a[0].toUpperCase()}`] : ['ERR leds'];
      case 'set': return set(a);
      case 'prefer':
        if (none) return [`OK PREFER ${PREFER[preferred]} usb=${usb} ble=1`];
        if (a.length === 1 && a[0] !== undefined && ['usb', 'ble', 'both'].includes(a[0])) {
          preferred = ['usb', 'ble', 'both'].indexOf(a[0]);
          settings.prefer = a[0];
          return [`OK PREFER ${a[0].toUpperCase()}`];
        }
        return a.length === 1 ? ['ERR prefer'] : ['ERR unknown'];
      case 'only':
        if (a.length !== 1) return ['ERR unknown'];
        if (a[0] === 'usb' || a[0] === 'ble') {
          preferred = a[0] === 'usb' ? 3 : 4;
          return [`OK ONLY ${a[0].toUpperCase()}`];
        }
        return ['ERR only'];
      case 'tiles': return tiles(a);
      case 'shot': return none ? ['OK SHOT 320 240 (the picture is the screen on this page)'] : ['ERR unknown'];
      case 'layer':
        if (n === null || a.length !== 1) return ['ERR unknown'];
        if (n < 0 || n >= api.pages) return ['ERR range'];
        api.go(n);
        return [`OK LAYER ${api.page()}`];
      case 'key':
        return n !== null && whole(a[1]) !== null && a.length === 2 ? [api.press(n, Number(a[1])) ? 'OK KEY' : 'ERR key'] : ['ERR unknown'];
      case 'tap':
      case 'tapok':
      case 'down':
        return touch(command, a) ?? ['ERR unknown'];
      case 'up':
        if (!none) return ['ERR unknown'];
        touching = false;
        return ['OK UP'];
      case 'btn': {
        const index = a[0] === undefined ? -1 : 'abc'.indexOf(a[0]);
        if (a.length !== 2 || a[0]?.length !== 1 || index < 0 || (a[1] !== 'down' && a[1] !== 'up')) return ['ERR unknown'];
        const ok = api.button?.(index, a[1] === 'down') ?? false;
        return [ok ? `OK BTN ${a[1].toUpperCase()}` : 'ERR btn'];
      }
      default: break;
    }
    const more = api.extra?.(command, a);
    if (more) return more;
    if (!presenter) return ['ERR unknown'];
    switch (command) {
      case 'clicker': {
        if (a.length !== 1 || a[0] === undefined || !CLICKER_ACTIONS.includes(a[0])) return a.length === 1 ? ['ERR clicker'] : ['ERR unknown'];
        return [api.clicker?.(a[0]) ? 'OK CLICKER' : 'ERR clicker'];
      }
      case 'pointer': return pointerCommand(a);
      case 'imu': {
        const [x, , z] = a.map(Number);
        if (a.length !== 3 || [x, z].some((v) => v === undefined || Number.isNaN(v))) return ['ERR unknown'];
        moveBy(pointer.upright ? Number(a[1]) : (z ?? 0), x ?? 0);
        return ['OK IMU'];
      }
      case 'mod': {
        if (a.length !== 1 || a[0] === undefined) return ['ERR unknown'];
        const mask = MODIFIER_MASKS[a[0]];
        if (a[0] === 'off') pointer.mods = 0;
        else if (mask === undefined) return ['ERR mod'];
        else pointer.mods = pointer.mods === mask ? 0 : mask;
        api.mods?.(pointer.mods);
        return [`OK MOD ${pointer.mods}`];
      }
      default: return ['ERR unknown'];
    }
  }

  return { run, commands: () => help.map((h) => h.name), prompt: `NG-${board}> ` };
}
