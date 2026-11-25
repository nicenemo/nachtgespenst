// The CoreS3 in the browser: the screenshots of the real board stitched into a page that can be paged and clicked.
// Previous, next and the title (which opens and closes the Locks page) work as on the device; on the Locks page the Caps, Num and Scroll tiles
// switch between eight real screenshots, and the LED bar below follows the way the firmware lights it. Nothing here is a simulation of the firmware.
(function () {
  'use strict';
  var mock = document.getElementById('mock');
  if (!mock) return;
  var TITLES = ["Maven Tools", "Office/Prod", "Edit/Nav", "System", "F1-F10", "F1-F10 MEH", "F1-F10 HYP", "F11-F20", "F11-20 MEH", "F11-20 HYP", "F21-F24", "F21+ MEH", "F21+ HYP", "Symbols", "Numpad", "Intl", "Language", "Hard Locks", "Media", "MS Teams", "Outlook", "Slides", "Browser", "Debug IDE", "Apps", "Edit Keys"];
  var COLORS = ["#0000FF", "#FF0000", "#FFA500", "#008000", "#800080", "#00FFFF", "#FFFF00", "#FFFFFF", "#FF00FF", "#00FF00", "#800000", "#000080", "#808000", "#008080", "#FF1493", "#FFD700", "#4B0082", "#006400", "#FF8C00", "#9400D3", "#87CEEB", "#F08080", "#98FB98", "#F0E68C", "#E6E6FA", "#FFE4E1"];
  var NAMES = ["Blue", "Red", "Orange", "Green", "Purple", "Cyan", "Yellow", "White", "Magenta", "Lime", "Maroon", "Navy", "Olive", "Teal", "DeepPink", "Gold", "Indigo", "DarkGreen", "DarkOrange", "DarkViolet", "SkyBlue", "LightCoral", "PaleGreen", "Khaki", "Lavender", "MistyRose"];
  var LOCKS = 26;            // the index of the Locks page: pages 0 to 25 are the key layers
  var PAGES = 27;            // the three demo pages after the Locks page are not shown
  var LOCK_NAMES = ['Caps', 'Num', 'Scroll'];
  var LOCK_RGB = [[255, 80, 0], [0, 220, 60], [40, 80, 255]];   // LOCK_COLORS of the firmware
  var SCREEN_W = 320, SCREEN_H = 240;

  var KEYMAP = window.NG_KEYMAP || [];
  var LOCKKEYS = window.NG_LOCKKEYS || [];
  var img = document.getElementById('mockimg');
  var status = document.getElementById('mockstatus');
  var leds = {};
  var ledEls = mock.querySelectorAll('.bar .led');
  for (var li = 0; li < ledEls.length; li++) leds[ledEls[li].getAttribute('data-lamp')] = ledEls[li];
  var page = 0, back = 0, mask = 0;   // mask: Caps 1, Num 2, Scroll 4
  var started = false;

  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function lockName(m) { return (m & 1 ? 1 : 0) + '' + (m & 2 ? 1 : 0) + (m & 4 ? 1 : 0); }
  function src(p, m) { return p < LOCKS ? 'img/lvgl/s3-' + pad(p) + '.png' : 'img/lvgl/s3-26-' + lockName(m) + '.png'; }

  function place(el) {
    el.style.left = (el.getAttribute('data-x') / SCREEN_W * 100) + '%';
    el.style.top = (el.getAttribute('data-y') / SCREEN_H * 100) + '%';
    el.style.width = (el.getAttribute('data-w') / SCREEN_W * 100) + '%';
    el.style.height = (el.getAttribute('data-h') / SCREEN_H * 100) + '%';
  }
  var hits = mock.querySelectorAll('.hit');
  for (var i = 0; i < hits.length; i++) place(hits[i]);
  var tiles = mock.querySelectorAll('.hit.tile');

  // The LED bar as the firmware lights it: the colour of the layer on a key page; on the Locks page one active lock fills its segment of two LEDs (lamps 0 and 1 for Caps, 2 and 3 for Num, 4 and 5 for Scroll),
  // several active locks add up over the whole bar, and with none the bar is dark.
  function barColours() {
    var out = [], i, j;
    if (page < LOCKS) {
      for (i = 0; i < 10; i++) out.push(hex(COLORS[page]));
      return out;
    }
    var active = [];
    for (i = 0; i < 3; i++) if (mask & (1 << i)) active.push(i);
    for (i = 0; i < 10; i++) out.push([0, 0, 0]);
    if (active.length > 1) {
      var mix = [0, 0, 0];
      for (i = 0; i < active.length; i++) for (j = 0; j < 3; j++) mix[j] = Math.min(255, mix[j] + LOCK_RGB[active[i]][j]);
      for (i = 0; i < 10; i++) out[i] = mix;
    } else if (active.length === 1) {
      var first = active[0];
      for (i = Math.floor(first * 10 / 5); i < Math.floor((first + 1) * 10 / 5); i++) out[i] = LOCK_RGB[first];
    }
    return out;
  }
  function hex(h) { return [parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16), parseInt(h.substr(5, 2), 16)]; }

  function drawBar() {
    var c = barColours();
    for (var i = 0; i < 10; i++) {
      var lit = c[i][0] + c[i][1] + c[i][2] > 0;
      leds[i].style.background = lit ? 'rgb(' + c[i].join(',') + ')' : '';
      leds[i].style.boxShadow = lit ? '0 0 10px 2px rgba(' + c[i].join(',') + ',.55)' : '';
    }
  }

  // ---------- the key log: what a tile would send. Nothing is sent: the report is only written down.
  var MODS = [[1, 'Ctrl'], [2, 'Shift'], [4, 'Alt'], [8, 'Win'], [16, 'RCtrl'], [32, 'RShift'], [64, 'RAlt'], [128, 'RWin']];
  var logEl = document.getElementById('keylog');
  var clearBtn = document.getElementById('keylog-clear');
  var GAP = 3, BODY_H = 202;          // the grid of a key page: the same arithmetic as the page builder of the firmware
  var dynTiles = [];

  function hex(n, w) { var h = n.toString(16).toUpperCase(); while (h.length < w) h = '0' + h; return h; }
  function pretty(name) {
    if (name.length <= 3) return name;
    return name.replace(/^SYS_/, '').toLowerCase().split('_').map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join(' ');
  }
  function modText(m) {
    var out = [];
    for (var i = 0; i < MODS.length; i++) if (m & MODS[i][0]) out.push(MODS[i][1]);
    return out.join('+');
  }
  function bytes(a) { return a.map(function (b) { return hex(b, 2); }).join(' '); }

  // What the device does for a binding [page, usage, modifier byte, usage name, label]: the report ids and bytes of src/HIDManager.cpp.
  function describe(t) {
    var page = t[0], id = t[1], mod = t[2], name = t[3], label = t[4];
    if (page === 7) {
      var m = mod, key = 0;
      if (id >= 0xE0 && id <= 0xE7) m |= 1 << (id - 0xE0); else if (id <= 0xDD) key = id;
      var mt = modText(mod), kt = pretty(name);
      var text = (mt ? mt + '+' : '') + kt;
      return { text: text, kind: 'keyboard', down: [1, [m, 0, key, 0, 0, 0, 0, 0]], up: [1, [0, 0, 0, 0, 0, 0, 0, 0]], detail: 'modifiers 0x' + hex(m, 2) + ', key 0x' + hex(key, 2), label: label };
    }
    if (page === 12) {
      return { text: pretty(name), kind: 'consumer', down: [2, [id & 255, id >> 8]], up: [2, [0, 0]], detail: 'usage 0x' + hex(id, 4) + ' (page 0x0C)', label: label };
    }
    if (page === 1) {
      var power = id === 0x81 || id === 0x82;
      return { text: pretty(name), kind: 'system', down: [3, [1 << (id - 0x81)]], up: [3, [0]], detail: 'usage 0x' + hex(id, 2) + ' (page 0x01)', label: label, blocked: power };
    }
    return null;
  }

  function stamp() { var d = new Date(); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + ':' + ('0' + d.getSeconds()).slice(-2); }
  function line(cls, parts) {
    var el = document.createElement('div');
    el.className = 'kl ' + cls;
    el.textContent = parts.join('  ');
    return el;
  }
  function log(d) {
    if (!logEl) return;
    var empty = logEl.querySelector('.keylog-empty');
    if (empty) logEl.removeChild(empty);
    var t = stamp(), name = d.text + (d.label ? '  (tile "' + String(d.label).replace(/^\+/, '') + '")' : '');
    if (d.blocked) {
      logEl.appendChild(line('blocked', [t, '⛔', name, d.kind, d.detail, '— shown, never sent: on the device this tile powers down or suspends the computer']));
    } else {
      logEl.appendChild(line('down', [t, '▼', name, d.kind, 'report ' + hex(d.down[0], 2) + ': ' + bytes(d.down[1]), '(' + d.detail + ')']));
      logEl.appendChild(line('up', [t, '▲', 'release', d.kind, 'report ' + hex(d.up[0], 2) + ': ' + bytes(d.up[1])]));
    }
    while (logEl.children.length > 200) logEl.removeChild(logEl.firstChild);
    logEl.scrollTop = logEl.scrollHeight;
  }
  if (clearBtn) clearBtn.addEventListener('click', function () { while (logEl.firstChild) logEl.removeChild(logEl.firstChild); });

  function flash(el) {
    el.classList.add('pressed');
    setTimeout(function () { el.classList.remove('pressed'); }, 160);
  }

  // The tiles of the current key page as click areas, from the keymap that the firmware is built from.
  function buildTiles() {
    for (var i = 0; i < dynTiles.length; i++) dynTiles[i].parentNode.removeChild(dynTiles[i]);
    dynTiles = [];
    if (page >= LOCKS || !KEYMAP[page]) return;
    var L = KEYMAP[page];
    var cw = Math.floor((SCREEN_W - (L.cols + 1) * GAP) / L.cols), ch = Math.floor((BODY_H - (L.rows + 1) * GAP) / L.rows);
    for (var k = 0; k < L.tiles.length; k++) {
      var tile = L.tiles[k], d = describe(tile);
      if (tile[0] === 0 || !d) continue;                     // an empty tile
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'hit ktile';
      b.setAttribute('data-x', GAP + (k % L.cols) * (cw + GAP)); b.setAttribute('data-y', GAP + Math.floor(k / L.cols) * (ch + GAP));
      b.setAttribute('data-w', cw); b.setAttribute('data-h', ch);
      b.setAttribute('aria-label', d.text);
      place(b);
      b.addEventListener('click', (function (dd, el) { return function () { flash(el); log(dd); status.textContent = 'Tile: ' + dd.text + '. The report is in the log; nothing was sent.'; }; })(d, b));
      mock.querySelector('.screen').appendChild(b);
      dynTiles.push(b);
    }
  }

  function render() {
    img.src = src(page, mask);
    img.alt = page < LOCKS ? 'CoreS3 screenshot of the page ' + TITLES[page] : 'CoreS3 screenshot of the Locks page';
    for (var i = 0; i < tiles.length; i++) tiles[i].hidden = page !== LOCKS;
    if (page < LOCKS) {
      status.textContent = 'Page ' + (page + 1) + ' of ' + PAGES + ': ' + TITLES[page] + '. The LED bars show its colour, ' + NAMES[page] + '.';
    } else {
      var parts = [];
      for (var k = 0; k < 3; k++) parts.push(LOCK_NAMES[k] + (mask & (1 << k) ? ' on' : ' off'));
      status.textContent = 'Locks page: ' + parts.join(', ') + '. Tap a tile to switch it, tap the title to go back.';
    }
    drawBar();
    buildTiles();
    try { history.replaceState(null, '', '#' + page); } catch (e) { /* a file:// page may refuse */ }
    preload();
  }

  var preloaded = {};
  function preload() {
    var want = [src((page + 1) % PAGES, mask), src((page + PAGES - 1) % PAGES, mask), 'img/lvgl/s3-26-000.png'];
    if (page === LOCKS) for (var m = 0; m < 8; m++) want.push(src(LOCKS, m));
    for (var i = 0; i < want.length; i++) if (!preloaded[want[i]]) { preloaded[want[i]] = new Image(); preloaded[want[i]].src = want[i]; }
  }

  function go(p) { page = (p + PAGES) % PAGES; started = true; render(); }
  function next() { go(page + 1); }
  function prev() { go(page - 1); }
  function title() {
    if (page === LOCKS) go(back);
    else { back = page; go(LOCKS); }
  }
  function toggle(k) { mask ^= (1 << k); render(); }
  function sendOnly(name, text) { status.textContent = name + ': ' + text; }

  mock.querySelector('[data-act="prev"]').addEventListener('click', prev);
  mock.querySelector('[data-act="next"]').addEventListener('click', next);
  mock.querySelector('[data-act="title"]').addEventListener('click', title);
  var extra = mock.querySelectorAll('.controls [data-act]');
  for (var e = 0; e < extra.length; e++) {
    extra[e].addEventListener('click', (function (a) {
      return function () { if (a === 'prev') prev(); else if (a === 'next') next(); else title(); };
    })(extra[e].getAttribute('data-act')));
  }
  for (var t = 0; t < tiles.length; t++) {
    tiles[t].addEventListener('click', (function (el) {
      return function () {
        var k = parseInt(el.getAttribute('data-lock'), 10);
        var lk = LOCKKEYS[k] ? describe(LOCKKEYS[k]) : null;
        if (lk) { lk.text = el.getAttribute('aria-label') + ' key (' + lk.text + ')'; flash(el); log(lk); }
        if (k < 3) toggle(k);
        else sendOnly(el.getAttribute('aria-label'), 'its key is in the log. On Linux nothing lights this LED, so the tile stays off.');
      };
    })(tiles[t]));
  }

  // Keys on the keyboard, and a swipe on a touch screen.
  mock.addEventListener('keydown', function (ev) {
    if (ev.key === 'ArrowLeft') { prev(); ev.preventDefault(); }
    else if (ev.key === 'ArrowRight') { next(); ev.preventDefault(); }
  });
  var screen = mock.querySelector('.screen'), sx = null, sy = null;
  screen.addEventListener('touchstart', function (ev) { var t = ev.changedTouches[0]; sx = t.clientX; sy = t.clientY; }, { passive: true });
  screen.addEventListener('touchend', function (ev) {
    if (sx === null) return;
    var t = ev.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
    sx = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > 2 * Math.abs(dy)) { if (dx < 0) next(); else prev(); }
  }, { passive: true });

  var h = parseInt((location.hash || '').replace('#', ''), 10);
  if (h >= 0 && h < PAGES) page = h;
  render();
})();
