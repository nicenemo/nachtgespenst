// The readouts of the bottom bar of the demo window: numbers that the log lines of the demos hold (speeds, tones, rates and the hash check), shown like the
// display of a measuring instrument. The rules follow demo/LogReadout.java of the desktop app, for the lines that the browser demos write.

/**
 * One readout.
 * @typedef {object} Readout
 * @property {string} label
 * @property {number} value
 * @property {number} max the full scale of the meter
 * @property {string} text
 * @property {'amber' | 'peach' | 'lavender' | 'coral'} tint
 */

/** @type {Array<{label: string, pattern: RegExp, max: number, tint: Readout['tint']}>} */
const RULES = [
  { label: 'send kB/s', pattern: /([0-9.,]+) kB\/s to the board/u, max: 60, tint: 'amber' },
  { label: 'load kB/s', pattern: /and ([0-9.,]+) kB\/s back/u, max: 60, tint: 'amber' },
  { label: 'pictures/s', pattern: /([0-9.,]+) pictures per second/u, max: 60, tint: 'peach' },
  { label: 'tone Hz', pattern: /hears (?:about )?([0-9.,]+) Hz|measured: ([0-9.,]+) Hz/u, max: 2000, tint: 'lavender' },
];

/**
 * A number with a decimal point or comma; 0 when it is not one.
 * @param {string} v
 * @returns {number}
 */
export function number(v) {
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

/**
 * The text of a readout: a whole number from 100 up, else one decimal.
 * @param {string} v
 * @returns {string}
 */
export function format(v) {
  const n = number(v);
  return n >= 100 ? String(Math.round(n)) : n.toFixed(1);
}

/**
 * All readouts that a log line holds: the numbers first, then the hash check.
 * @param {string} line
 * @returns {Readout[]}
 */
export function readouts(line) {
  /** @type {Readout[]} */
  const out = [];
  for (const rule of RULES) {
    const m = rule.pattern.exec(line);
    const v = m?.slice(1).find((g) => g !== undefined);
    if (v !== undefined) out.push({ label: rule.label, value: number(v), max: rule.max, text: format(v), tint: rule.tint });
  }
  if (line.includes('SHA-256')) {
    if (line.includes('DIFFERENT')) out.push({ label: 'SHA-256', value: 1, max: 1, text: 'differs', tint: 'coral' });
    else if (line.includes('MATCH')) out.push({ label: 'SHA-256', value: 1, max: 1, text: 'match', tint: 'peach' });
  }
  return out;
}
