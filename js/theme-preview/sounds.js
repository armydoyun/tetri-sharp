// 견본에서만 불러오는 악기. 게임의 멜로디 틀과 합성기를 그대로 쓴다.
import { makeSoundSet, noisePart as noise, note, tonePart as tone } from "../audio/sound-sets.js";

const ceramicTap = (at, hz, gain) =>
  tone(at, hz, 0.046, "sine", gain, {
    partials: [
      [2.67, 0.28],
      [4.03, 0.13],
    ],
    decay: "fast",
    attack: 0.001,
  });

const porcelain = makeSoundSet({
  tone: (at, m, long, k) => [
    tone(at, note(m), long ? 0.25 : 0.13, "sine", 0.21 * k, {
      partials: [
        [2.67, 0.35],
        [4.03, 0.15],
      ],
      decay: "fast",
      attack: 0.002,
    }),
  ],
  move: [ceramicTap(0, 1110, 0.065)],
  rotate: [ceramicTap(0, 1190, 0.09), ceramicTap(0.024, 1480, 0.052)],
  kick: [ceramicTap(0, 890, 0.12), ceramicTap(0.035, 1370, 0.09)],
  hold: [ceramicTap(0, 730, 0.1), ceramicTap(0.055, 970, 0.078)],
  lock: [ceramicTap(0, 530, 0.16)],
  hardDrop: [ceramicTap(0, 470, 0.17), tone(0, 165, 0.085, "sine", 0.26, { to: 93 })],
  garbage: [ceramicTap(0, 320, 0.24), ceramicTap(0.12, 235, 0.24)],
});

const contact = (at, hz, gain) => noise(at, 0.016, gain, "bandpass", hz, { q: 1.3, attack: 0.001 });
const coil = (at, hz, gain) =>
  tone(at, hz, 0.073, "triangle", gain, { to: hz * 0.66, filter: "lowpass", ff: 1500, attack: 0.002 });

const relay = makeSoundSet({
  tone: (at, m, long, k) => [
    tone(at, note(m), long ? 0.23 : 0.095, "triangle", 0.2 * k, {
      filter: "lowpass",
      ff: 2200,
      fto: 950,
      attack: 0.004,
    }),
  ],
  move: [contact(0, 1700, 0.105)],
  rotate: [contact(0, 1780, 0.13), contact(0.038, 2510, 0.11)],
  kick: [contact(0, 1560, 0.15), coil(0.034, 390, 0.11)],
  hold: [contact(0, 1850, 0.11), coil(0.025, 330, 0.13)],
  lock: [contact(0, 1600, 0.13), coil(0.005, 275, 0.16)],
  hardDrop: [contact(0, 1240, 0.16), coil(0, 177, 0.31), contact(0.027, 2250, 0.08)],
  garbage: [coil(0, 219, 0.28), coil(0.125, 174, 0.28)],
});

const bubble = (at, hz, to, gain) =>
  tone(at, hz, 0.056, "sine", gain, { to, attack: 0.011, partials: [[1.94, 0.14]], decay: "fast" });
const current = (at, hz, to, gain) => noise(at, 0.073, gain, "bandpass", hz, { fto: to, q: 2, attack: 0.014 });

const tide = makeSoundSet({
  tone: (at, m, long, k) => [
    tone(at, note(m), long ? 0.29 : 0.15, "sine", 0.22 * k, {
      partials: [[2, 0.17]],
      attack: 0.022,
    }),
  ],
  move: [bubble(0, 420, 810, 0.075)],
  rotate: [current(0, 680, 2350, 0.14), bubble(0.026, 550, 910, 0.055)],
  kick: [current(0, 850, 2800, 0.15), bubble(0.022, 490, 930, 0.095)],
  hold: [bubble(0, 350, 530, 0.085), bubble(0.048, 460, 790, 0.078)],
  lock: [bubble(0, 270, 175, 0.18)],
  hardDrop: [current(0, 980, 330, 0.14), tone(0, 140, 0.11, "sine", 0.31, { to: 72, attack: 0.012 })],
  garbage: [bubble(0, 255, 130, 0.28), bubble(0.14, 225, 100, 0.28)],
});

const brush = (at, hz, to, gain, dur) => noise(at, dur, gain, "lowpass", hz, { fto: to, attack: dur * 0.25 });

const velvet = makeSoundSet({
  tone: (at, m, long, k) => [
    tone(at, note(m), long ? 0.32 : 0.16, "sine", 0.19 * k, {
      partials: [
        [2, 0.46],
        [3, 0.23],
        [5, 0.09],
      ],
      filter: "lowpass",
      ff: 2800,
      fto: 1050,
      decay: "fast",
      attack: 0.003,
    }),
  ],
  move: [brush(0, 1250, 710, 0.12, 0.027)],
  rotate: [brush(0, 820, 2050, 0.15, 0.056)],
  kick: [brush(0, 940, 2380, 0.17, 0.065), brush(0.045, 1360, 800, 0.11, 0.032)],
  hold: [brush(0, 1800, 520, 0.17, 0.09)],
  lock: [brush(0, 580, 240, 0.15, 0.049), tone(0, 192, 0.054, "sine", 0.15, { to: 140, attack: 0.009 })],
  hardDrop: [brush(0, 780, 255, 0.15, 0.08), tone(0, 124, 0.12, "triangle", 0.3, { to: 68, attack: 0.012 })],
  garbage: [tone(0, 176, 0.09, "triangle", 0.24, { to: 125 }), tone(0.13, 144, 0.11, "triangle", 0.24, { to: 93 })],
});

export const CANDIDATE_SOUNDS = Object.freeze({ porcelain, relay, tide, velvet });
