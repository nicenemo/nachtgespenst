// The sound of the browser demos: Web Audio plays the test tones (440, 1000, 2000 Hz and so on) and an analyser takes the place of the microphone of the board.
// By default the analyser listens to the tones that the page plays itself, so nothing has to be allowed and the tones can stay silent; with the checkbox it listens
// to the real microphone of the computer (the browser asks first) and the tones go out through the speakers.

import { toWave } from './audio.js';

/**
 * The sound rig.
 * @param {Window & typeof globalThis} window
 * @returns {{tones: (list: number[], seconds: number) => Promise<void>, wave: () => number[], stop: () => void, source: () => string, useMicrophone: (on: boolean) => Promise<boolean>, speakers: (on: boolean) => void} | null} null without Web Audio
 */
export function createAudioRig(window) {
  const Context = window.AudioContext ?? /** @type {typeof AudioContext | undefined} */ (/** @type {any} */ (window).webkitAudioContext);
  if (!Context) return null;
  /** @type {AudioContext | null} */
  let ctx = null;
  /** @type {AnalyserNode | null} */
  let analyser = null;
  /** @type {GainNode | null} */
  let loud = null;
  /** @type {MediaStreamAudioSourceNode | null} */
  let mic = null;
  /** @type {OscillatorNode[]} */
  let playing = [];
  let toSpeakers = false;
  let stopped = false;

  function ensure() {
    if (ctx && analyser && loud) return { ctx, analyser, loud };
    ctx = new Context();
    analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    loud = ctx.createGain();
    loud.gain.value = toSpeakers ? 1 : 0;
    loud.connect(ctx.destination);
    return { ctx, analyser, loud };
  }

  return {
    async tones(list, seconds) {
      const { ctx: c, analyser: a, loud: l } = ensure();
      await c.resume();
      stopped = false;
      for (const hz of list) {
        if (stopped) return;
        const osc = c.createOscillator();
        const gain = c.createGain();
        osc.frequency.value = hz;
        gain.gain.value = 0.5;
        osc.connect(gain);
        if (!mic) gain.connect(a);
        gain.connect(l);
        playing.push(osc);
        osc.start();
        await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
        osc.stop();
        osc.disconnect();
        gain.disconnect();
        playing = playing.filter((o) => o !== osc);
      }
    },
    wave() {
      if (!analyser || !ctx) return new Array(512).fill(0);
      const buffer = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(buffer);
      return toWave(buffer, ctx.sampleRate);
    },
    stop() {
      stopped = true;
      for (const o of playing) {
        try { o.stop(); } catch { /* already stopped */ }
      }
      playing = [];
    },
    source: () => (mic ? 'listening to the microphone of this computer' : 'listening to the tones that this page plays'),
    async useMicrophone(on) {
      const { ctx: c, analyser: a } = ensure();
      if (!on) {
        mic?.disconnect();
        mic = null;
        return true;
      }
      try {
        const stream = await window.navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
        mic = c.createMediaStreamSource(stream);
        mic.connect(a);
        return true;
      } catch {
        return false;
      }
    },
    speakers(on) {
      toSpeakers = on;
      if (loud) loud.gain.value = on ? 1 : 0;
    },
  };
}
