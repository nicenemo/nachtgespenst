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

  function render() {
    img.src = src(page, mask);
    img.alt = page < LOCKS ? 'CoreS3 screenshot of the page ' + TITLES[page] : 'CoreS3 screenshot of the Locks page';
    for (var i = 0; i < tiles.length; i++) tiles[i].hidden = page !== LOCKS;
    if (page < LOCKS) {
      status.textContent = 'Page ' + (page + 1) + ' of ' + PAGES + ': ' + TITLES[page] + '. The LED bar shows its colour, ' + NAMES[page] + '.';
    } else {
      var parts = [];
      for (var k = 0; k < 3; k++) parts.push(LOCK_NAMES[k] + (mask & (1 << k) ? ' on' : ' off'));
      status.textContent = 'Locks page: ' + parts.join(', ') + '. Tap a tile to switch it, tap the title to go back.';
    }
    drawBar();
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
        if (k < 3) toggle(k);
        else sendOnly(el.getAttribute('aria-label'), 'its key was sent. On Linux nothing lights this LED, so the tile stays off.');
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
