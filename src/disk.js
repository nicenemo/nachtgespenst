// The Disk demo: a file goes to the board over the lamps and comes back over the game pad, with a CRC-32 on every block and SHA-256 on both ends.
// The framing follows docs/wiki/disk-drive.md: blocks of 4 bytes per lamp (a block is 12 bytes of header and CRC plus the data), acknowledgement keys F13 to F20 (the
// block number modulo 8), F21 to ask for a resend, F23 / F24 at the end, and a game pad report of 48 bytes with up to 38 bytes of data on the way back. Nothing here
// touches a board: the board is a small model in this file, so the CRC, the SHA-256 and the variable bit rate are real, the HID reports are not.

import { random } from './effects.js';

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/**
 * The CRC-32 of some bytes (as in zlib and PNG).
 * @param {Uint8Array} data
 * @returns {number}
 */
export function crc32(data) {
  let c = 0xffffffff;
  for (const b of data) c = (CRC_TABLE[(c ^ b) & 255] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * A SHA-256 as hexadecimal text.
 * @param {Uint8Array} data
 * @returns {Promise<string>}
 */
export async function sha256(data) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', /** @type {BufferSource} */ (data)));
  return [...digest].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Packs or unpacks a stream with deflate.
 * @param {Uint8Array} data
 * @param {'compress' | 'decompress'} how
 * @returns {Promise<Uint8Array>}
 */
export async function deflate(data, how) {
  const stream = new Blob([/** @type {BlobPart} */ (data)]).stream();
  const piped = how === 'compress' ? stream.pipeThrough(new CompressionStream('deflate')) : stream.pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(piped).arrayBuffer());
}

/**
 * The stand-in for the book of the real demo (Twenty Thousand Leagues under the Sea, 618,734 bytes): text of words that are made up here, so that nothing has
 * to be downloaded and it packs about as well as a book.
 * @param {number} bytes about this many bytes
 * @returns {Uint8Array}
 */
export function standInBook(bytes) {
  const rnd = random(11);
  const vowels = 'aeiou';
  const consonants = 'bcdfghjklmnprstvwz';
  const word = () => {
    let w = '';
    for (let i = 0, n = 2 + Math.floor(rnd() * 4); i < n; i++) w += (consonants[Math.floor(rnd() * consonants.length)] ?? 'b') + (vowels[Math.floor(rnd() * vowels.length)] ?? 'a');
    return w;
  };
  const vocabulary = Array.from({ length: 1800 }, word);
  let text = '';
  while (text.length < bytes) {
    let line = '';
    for (let i = 0, n = 6 + Math.floor(rnd() * 9); i < n; i++) line += `${vocabulary[Math.floor(rnd() * rnd() * vocabulary.length)]} `;
    text += `${line.trim()}.\n`;
  }
  return new TextEncoder().encode(text.slice(0, bytes));
}

/**
 * One block of the way in: the header (sequence 2 bytes, flags 1, session 1, length 2, offset 4 as a parameter), the payload and a CRC-32.
 * @typedef {object} Block
 * @property {number} seq
 * @property {number} offset
 * @property {Uint8Array} data
 * @property {number} crc the CRC-32 over header and payload
 * @property {boolean} last
 */

/**
 * Cuts a file into blocks.
 * @param {Uint8Array} file
 * @param {number} dataBytes the data of each block (a block of n lamps carries 4 n - 12 bytes)
 * @param {number} from the offset to start at
 * @param {number} seq the sequence number of the first block
 * @returns {Block[]}
 */
export function makeBlocks(file, dataBytes, from = 0, seq = 0) {
  /** @type {Block[]} */
  const blocks = [];
  for (let offset = from; offset < file.length || (offset === 0 && blocks.length === 0); offset += dataBytes) {
    const data = file.subarray(offset, Math.min(file.length, offset + dataBytes));
    const header = new Uint8Array([seq & 255, (seq >> 8) & 255, 0, 0, data.length & 255, data.length >> 8, offset & 255, (offset >> 8) & 255, (offset >> 16) & 255, offset >>> 24]);
    const body = new Uint8Array(header.length + data.length);
    body.set(header);
    body.set(data, header.length);
    blocks.push({ seq: seq++, offset, data, crc: crc32(body), last: offset + dataBytes >= file.length });
  }
  return blocks;
}

/**
 * Whether a block arrived whole: its CRC-32 is worked out again from what the board saw.
 * @param {Block} block
 * @param {Uint8Array} seen the payload as the board received it
 * @returns {boolean}
 */
export function blockIntact(block, seen) {
  const header = new Uint8Array([block.seq & 255, (block.seq >> 8) & 255, 0, 0, seen.length & 255, seen.length >> 8, block.offset & 255, (block.offset >> 8) & 255, (block.offset >> 16) & 255, block.offset >>> 24]);
  const body = new Uint8Array(header.length + seen.length);
  body.set(header);
  body.set(seen, header.length);
  return crc32(body) === block.crc;
}

/** The pace of the way in, which the sender steers: first larger blocks, then a larger window, then a smaller gap; an error cuts it all back. */
export class Pacing {
  lamps = 16;
  window = 1;
  gapMs = 2;
  clean = 0;

  /** One window was acknowledged. */
  good() {
    if (++this.clean < 3) return;
    this.clean = 0;
    if (this.lamps < 1024) this.lamps *= 2;
    else if (this.window < 8) this.window++;
    else if (this.gapMs > 0.3) this.gapMs = Math.max(0.3, this.gapMs / 2);
  }

  /** A window went wrong: halve the block and the window, double the gap. */
  bad() {
    this.clean = 0;
    this.lamps = Math.max(16, this.lamps / 2);
    this.window = Math.max(1, this.window >> 1);
    this.gapMs = Math.min(40, this.gapMs * 2);
  }

  /** The data bytes of a block now. */
  get dataBytes() {
    return this.lamps * 4 - 12;
  }
}

/**
 * What the Disk run reports while it goes.
 * @typedef {object} DiskHooks
 * @property {(line: string) => void} log
 * @property {(stage: 'save' | 'load', fraction: number, bytes: Uint8Array) => void} frame called for every block that moved: the data to draw on the lamps
 * @property {(ms: number) => Promise<void>} wait waits for simulated time (the caller may speed it up or stop on abort)
 */

/**
 * @typedef {object} DiskResult
 * @property {boolean} match
 * @property {string} sha
 * @property {number} packed the size of the file after deflate
 * @property {number} size
 * @property {number} saveSeconds the simulated seconds of the way in
 * @property {number} loadSeconds the simulated seconds of the way back
 * @property {number} errors
 */

/**
 * SAVE the file to the board (the model of the board checks every block), then LOAD it back, and compare SHA-256 on both ends.
 * @param {Uint8Array} file
 * @param {DiskHooks} hooks
 * @param {{injectPercent?: number, seed?: number}} [options] injectPercent drops that share of the blocks on purpose, as `LampTest disk --inject` does
 * @returns {Promise<DiskResult>}
 */
export async function runDisk(file, hooks, options = {}) {
  const inject = options.injectPercent ?? 0;
  let seed = (options.seed ?? 7) >>> 0;
  const dropped = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return (seed >>> 8) % 1000 < inject * 10;
  };
  const packed = await deflate(file, 'compress');
  const sha = await sha256(file);
  hooks.log(`file: ${file.length} bytes, deflate ${packed.length} bytes (${Math.round(packed.length * 100 / file.length)} %), SHA-256 ${sha.slice(0, 16)}…`);

  // SAVE: the PC sends windows of blocks, the board acknowledges with F13 to F20 (the block number modulo 8) or asks for a resend with F21.
  const pacing = new Pacing();
  const board = new Uint8Array(packed.length);
  let received = 0;
  let nextSeq = 0;
  let errors = 0;
  let windows = 0;
  let simulated = 0;
  let totalMs = 0;
  while (received < packed.length) {
    const blocks = makeBlocks(packed, pacing.dataBytes, received, nextSeq).slice(0, pacing.window);
    let accepted = 0;
    for (const block of blocks) {
      const seen = dropped() ? block.data.map((b) => b ^ 0x10) : block.data;      // a damaged block: one bit flips
      simulated += pacing.gapMs + (block.data.length + 12) / 4 / 8;           // eight lamps per report, about a thousand reports a second
      if (!blockIntact(block, seen)) break;
      board.set(seen, block.offset);
      accepted++;
      received = block.offset + block.data.length;
      hooks.frame('save', received / packed.length, block.data);
    }
    const last = blocks[accepted - 1];
    if (accepted === blocks.length) {
      pacing.good();
      nextSeq += accepted;
    } else {
      errors++;
      pacing.bad();
      nextSeq += accepted;
      hooks.log(`F21: resend from block ${nextSeq} (CRC error), now ${pacing.lamps} lamps, window ${pacing.window}`);
    }
    if (++windows % 25 === 0) hooks.log(`F${13 + (last ? last.seq % 8 : 0)}: window ${windows}, ${Math.round(received * 100 / packed.length)} %, block ${pacing.lamps} lamps, window ${pacing.window}, gap ${pacing.gapMs.toFixed(1)} ms`);
    totalMs += simulated;
    await hooks.wait(simulated);
    simulated = 0;
    if (nextSeq > 1_000_000) throw new Error('the transfer does not finish');
  }
  const saveSeconds = Math.max(0.001, totalMs / 1000);
  const unpacked = await deflate(board, 'decompress');
  const onBoard = await sha256(unpacked);
  hooks.log(`F23: saved to the SD card, SHA-256 on the board ${onBoard.slice(0, 16)}… ${onBoard === sha ? 'MATCH' : 'DIFFERENT'}`);

  // LOAD: the board answers with game pad reports of 48 bytes (4 offset, 1 flags, 1 length, up to 38 data, 4 CRC) within the window that the PC grants.
  const back = new Uint8Array(unpacked.length);
  let reports = 0;
  for (let offset = 0; offset < unpacked.length; offset += 38) {
    const chunk = unpacked.subarray(offset, offset + 38);
    back.set(chunk, offset);
    reports++;
    if (reports % 64 === 0) {
      hooks.frame('load', offset / unpacked.length, chunk);
      await hooks.wait(64);
    }
  }
  const backSha = await sha256(back);
  hooks.log(`LOAD: ${reports} reports of 48 bytes, SHA-256 on the PC ${backSha.slice(0, 16)}… ${backSha === sha ? 'MATCH' : 'DIFFERENT'}`);
  return { match: backSha === sha && onBoard === sha, sha, packed: packed.length, size: file.length, saveSeconds, loadSeconds: reports / 1000, errors };
}

/**
 * Draws bytes as lamps: four bytes make one lamp's r, g and b (the fourth is the intensity), so a block becomes a row of coloured lamps.
 * @param {number[]} px the picture, changed in place
 * @param {Uint8Array} bytes
 * @param {number} at the lamp to start at
 * @returns {number} the lamp after the last one that was painted
 */
export function paintBytes(px, bytes, at) {
  let lamp = at;
  for (let i = 0; i + 2 < bytes.length; i += 4) {
    px[lamp % px.length] = ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    lamp++;
  }
  return lamp;
}
