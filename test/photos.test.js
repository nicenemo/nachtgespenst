import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';
import { PHOTOS, toGrid } from '../src/photos.js';

test('every photograph is on the site and has its credit', () => {
  assert.equal(PHOTOS.length, 5);
  for (const p of PHOTOS) {
    assert.ok(existsSync(new URL(`../${p.file}`, import.meta.url)), p.file);
    assert.ok(p.title && p.author && p.licence && p.licenceUrl.startsWith('https://creativecommons.org/') && p.source.startsWith('https://commons.wikimedia.org/wiki/File:'), p.file);
    assert.match(p.licence, /^(CC0 1\.0|CC BY-SA [34]\.0)$/u, `${p.file}: only open licences`);
  }
});

test('the picture is cut to the aspect of the grid and averaged', () => {
  // 4 x 2 picture: left half red, right half blue; a 2 x 1 grid sees one colour per lamp
  const px = [];
  for (let y = 0; y < 2; y++) for (let x = 0; x < 4; x++) px.push(...(x < 2 ? [255, 0, 0, 255] : [0, 0, 255, 255]));
  assert.deepEqual(toGrid(px, 4, 2, 2, 1), [0xff0000, 0x0000ff]);
  // a square grid of a wide picture crops the sides: the middle two columns of 4 x 2 are one red and one blue
  assert.deepEqual(toGrid(px, 4, 2, 1, 1).length, 1);
});
