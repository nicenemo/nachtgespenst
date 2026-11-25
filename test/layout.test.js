// The demo must keep its size while paging: jsdom has no layout, so these tests check the rules that fix the size.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { start } from '../src/mock.js';

const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
const data = vm.runInNewContext(`${readFileSync(new URL('../keymap.js', import.meta.url), 'utf8')}; ({NG_KEYMAP, NG_LOCKKEYS})`);

/** @param {string} selector @returns {string} the declarations of the first rule with exactly this selector */
const rule = (selector) => {
  const match = css.match(new RegExp(`(^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}\\s*\\{([^}]*)\\}`, 'u'));
  assert.ok(match, `no rule for ${selector}`);
  return match[2] ?? '';
};

test('the demo column has a fixed width that does not depend on its content', () => {
  assert.match(rule('.demo-left'), /(^|[\s;])width:\s*calc\(var\(--screen-w\)/u);
});
test('the status line has a fixed height and clips, so a long text cannot move the page', () => {
  const status = rule('.mock-status');
  assert.match(status, /(^|[\s;])height:\s*[\d.]+em/u);
  assert.match(status, /overflow:\s*hidden/u);
});
test('all screenshots of the demo have the size of the screen, so the image never changes the layout', () => {
  const html = readFileSync(new URL('../device.html', import.meta.url), 'utf8');
  assert.match(html, /<img id="mockimg" src="[^"]+" width="320" height="240"/u);
});
test('every page keeps the status text short enough for its box (two lines of the box width)', () => {
  const dom = new JSDOM(readFileSync(new URL('../device.html', import.meta.url), 'utf8'), { url: 'http://localhost/device.html' });
  const { document } = dom.window;
  const demo = start({ document, window: /** @type {any} */ (dom.window), keymap: data.NG_KEYMAP, lockKeys: data.NG_LOCKKEYS, lockColors: [[255, 80, 0], [0, 220, 60], [40, 80, 255]] });
  assert.ok(demo);
  const status = /** @type {HTMLElement} */ (document.getElementById('mockstatus'));
  for (let page = 0; page < 27; page++) {
    demo.go(page);
    assert.ok((status.textContent ?? '').length <= 110, `page ${page}: ${status.textContent}`);
    for (const tile of document.querySelectorAll('.ktile')) {
      /** @type {HTMLElement} */ (tile).click();
      assert.ok((status.textContent ?? '').length <= 110, `page ${page} tile ${tile.getAttribute('aria-label')}: ${status.textContent}`);
    }
  }
});

test('the console of the demo window has a fixed height, so no slide can change the size of the page', () => {
  assert.match(rule('.console'), /(^|[\s;])height:\s*clamp\(/u);
  assert.doesNotMatch(rule('.console'), /min-height|max-height:\s*none/u);
  assert.match(rule('.c-slide'), /overflow:\s*hidden/u);
  assert.match(rule('.c-frame'), /min-height:\s*0/u);
  assert.match(rule('.c-info'), /white-space:\s*nowrap/u);
  assert.match(rule('.c-slide ul'), /font:[^;]*cqw/u);
});
