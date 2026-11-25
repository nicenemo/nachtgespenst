import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Pacing, blockIntact, crc32, deflate, makeBlocks, paintBytes, runDisk, sha256, standInBook } from '../src/disk.js';

test('crc32 and sha256 are the real ones', async () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  assert.equal(await sha256(new TextEncoder().encode('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('deflate round trip', async () => {
  const book = standInBook(5000);
  const packed = await deflate(book, 'compress');
  assert.ok(packed.length < book.length);
  assert.deepEqual(await deflate(packed, 'decompress'), book);
});

test('blocks carry the offset and a CRC that notices damage', () => {
  const file = standInBook(1000);
  const blocks = makeBlocks(file, 52);
  assert.equal(blocks[0]?.offset, 0);
  assert.equal(blocks[1]?.offset, 52);
  assert.equal(blocks.at(-1)?.last, true);
  const block = blocks[3];
  assert.ok(block);
  assert.equal(blockIntact(block, block.data), true);
  assert.equal(blockIntact(block, block.data.map((b) => b ^ 1)), false);
  assert.equal(blocks.reduce((n, b) => n + b.data.length, 0), 1000);
});

test('the pacing grows after clean windows and falls back on an error', () => {
  const p = new Pacing();
  for (let i = 0; i < 9; i++) p.good();
  assert.equal(p.lamps, 128);
  assert.equal(p.dataBytes, 128 * 4 - 12);
  p.bad();
  assert.equal(p.lamps, 64);
  assert.ok(p.gapMs > 2);
});

test('a whole run: the file arrives and the SHA-256 matches on both ends', async () => {
  const file = standInBook(20000);
  /** @type {string[]} */
  const log = [];
  const result = await runDisk(file, { log: (l) => log.push(l), frame: () => undefined, wait: async () => undefined });
  assert.equal(result.match, true);
  assert.equal(result.errors, 0);
  assert.ok(result.packed < result.size);
  assert.ok(log.some((l) => l.startsWith('F23')));
  assert.ok(log.some((l) => l.includes('MATCH')));
});

test('with damaged blocks the transfer still completes, after resends', async () => {
  const file = standInBook(30000);
  /** @type {string[]} */
  const log = [];
  const result = await runDisk(file, { log: (l) => log.push(l), frame: () => undefined, wait: async () => undefined }, { injectPercent: 5 });
  assert.equal(result.match, true);
  assert.ok(result.errors > 0);
  assert.ok(log.some((l) => l.startsWith('F21')));
});

test('bytes become lamps', () => {
  const px = new Array(8).fill(0);
  const next = paintBytes(px, new Uint8Array([1, 2, 3, 255, 4, 5, 6, 255]), 0);
  assert.equal(next, 2);
  assert.deepEqual(px.slice(0, 2), [0x010203, 0x040506]);
});
