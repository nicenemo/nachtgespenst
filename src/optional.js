// The commands of the optional components that the demo page has (lamps, bar, wave, mic, disk, telem), answered from the state of the lamps.
// The replies follow docs/shell/commands.txt.

import { level } from './audio.js';

/**
 * Makes the handler for these commands.
 * @param {ReturnType<typeof import('./lamps.js').createLamps>} lamps
 * @param {() => number[]} wave the last waveform: 512 samples
 * @returns {(command: string, args: string[]) => string[] | null} null when the command is not one of these
 */
export function createOptional(lamps, wave) {
  let mic = false;
  let telem = 'OFF';
  let disk = 'idle';
  return (command, args) => {
    const [a, b, c] = args;
    switch (command) {
      case 'lamps': {
        const snap = lamps.snapshot();
        const { frames, lamps: count } = lamps.counters();
        if (a === undefined) return [`OK LAMPS mode=auto lamps=${10 + (snap.grid ? snap.grid.cols * snap.grid.rows : 0)} grid=${snap.grid ? `${snap.grid.cols}x${snap.grid.rows}` : '0x0'} frames=${frames} updated=${count}`];
        if (a === 'reset' && b === undefined) {
          lamps.clear();
          return ['OK LAMPS RESET'];
        }
        if (a === 'grid' && /^\d+$/u.test(b ?? '') && /^\d+$/u.test(c ?? '')) {
          const cols = Number(b);
          const rows = Number(c);
          if (cols < 1 || rows < 1 || cols * rows > 60800) return ['ERR grid'];
          lamps.setGrid(new Array(cols * rows).fill(0), cols, rows);
          return [`OK LAMPS GRID ${cols} ${rows} lamps=${cols * rows} max=60800`];
        }
        if (a === 'get' && /^\d+$/u.test(b ?? '')) {
          const id = Number(b);
          const rgb = id < 10 ? snap.bar[id] ?? 0 : snap.grid?.px[id - 10] ?? 0;
          return [`OK LAMP ${id} ${(rgb >> 16) & 255} ${(rgb >> 8) & 255} ${rgb & 255} 255`];
        }
        return ['ERR lamps'];
      }
      case 'bar':
        return args.length === 0 ? [`OK BAR ${lamps.snapshot().bar.map((rgb) => rgb.toString(16).padStart(6, '0')).join(' ')}`] : ['ERR unknown'];
      case 'wave':
        return args.length === 0 ? [`OK WAVE ${wave().map((s) => (s & 0xffff).toString(16).padStart(4, '0')).join('')}`] : ['ERR unknown'];
      case 'mic': {
        if (a === undefined) {
          const w = wave();
          return [`OK MIC active=${mic ? 1 : 0} level=${Math.round(level(w))} peak=${Math.max(0, ...w.map(Math.abs))} freq=0 buffers=0 failures=0`];
        }
        if (b === undefined && (a === 'on' || a === 'off')) {
          mic = a === 'on';
          return [`OK MIC ${a.toUpperCase()}`];
        }
        return ['ERR unknown'];
      }
      case 'telem':
        if (a === undefined) return [`OK TELEM ${telem}`];
        if (b === undefined && ['off', 'bar', 'wave', 'both'].includes(a)) {
          telem = a.toUpperCase();
          return [`OK TELEM ${telem}`];
        }
        return ['ERR telem'];
      case 'disk':
        if (a === undefined) return [`OK DISK state=${disk} ok=0 speaker=0 mic=${mic ? 1 : 0}`];
        if (a === 'reset' && b === undefined) {
          disk = 'idle';
          return ['OK DISK RESET'];
        }
        return ['ERR unknown'];
      default:
        return null;
    }
  };
}
