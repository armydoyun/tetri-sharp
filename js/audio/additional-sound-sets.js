// 새 테마 11종의 악기. 같은 멜로디 틀과 합성기를 쓴다.
import { kit, noise, note, P as tone } from "./sound-kit.js";

const ceramicTap = (at, hz, gain) =>
  tone(at, hz, 0.046, "sine", gain, {
    partials: [
      [2.67, 0.28],
      [4.03, 0.13],
    ],
    decay: "fast",
    attack: 0.001,
  });

const porcelain = kit({
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

const relay = kit({
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

const tide = kit({
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

const velvet = kit({
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

const tap = (at, hz, gain) => noise(at, 0.022, gain, "bandpass", hz, { q: 1.8, attack: 0.0015 });
const sweep = (at, hz, to, gain, dur) => noise(at, dur, gain, "bandpass", hz, { fto: to, q: 0.8, attack: dur * 0.18 });
const thud = (at, hz, to, dur, gain) => tone(at, hz, dur, "sine", gain, { to, attack: 0.004 });

const press = kit({
  tone: (at, m, long, k) => [
    tone(at, note(m - 12), long ? 0.2 : 0.095, "triangle", 0.23 * k, { filter: "lowpass", ff: 970 }),
    tap(at, 1150, 0.075 * k),
  ],
  move: [tap(0, 830, 0.1)],
  rotate: [tap(0, 920, 0.12), thud(0.022, 250, 170, 0.04, 0.1)],
  kick: [tap(0, 1080, 0.15), thud(0.028, 280, 145, 0.063, 0.14)],
  hold: [sweep(0, 650, 960, 0.14, 0.083)],
  lock: [thud(0, 224, 104, 0.085, 0.22), tap(0.008, 920, 0.12)],
  hardDrop: [thud(0, 190, 70, 0.13, 0.35), tap(0.009, 700, 0.17)],
  garbage: [thud(0, 135, 68, 0.1, 0.29), thud(0.12, 120, 55, 0.13, 0.27)],
});

const sprocket = (at, hz, gain) => noise(at, 0.011, gain, "bandpass", hz, { q: 3, attack: 0.001 });
const shutter = (at, gain) => [sprocket(at, 2900, gain), sprocket(at + 0.018, 1700, gain * 0.75)];
const film = kit({
  tone: (at, m, long, k) => [
    ...shutter(at, 0.115 * k),
    tone(at + 0.01, note(m), long ? 0.25 : 0.12, "sine", 0.185 * k),
  ],
  move: [sprocket(0, 1700, 0.075), sprocket(0.013, 2150, 0.065), sprocket(0.026, 2500, 0.04)],
  rotate: [...shutter(0, 0.118)],
  kick: [...shutter(0, 0.16), sprocket(0.048, 3300, 0.08)],
  hold: [sweep(0, 1500, 2600, 0.12, 0.065), sprocket(0.065, 2300, 0.1)],
  lock: [sprocket(0, 1550, 0.145), thud(0, 290, 210, 0.056, 0.15)],
  hardDrop: [...shutter(0, 0.185), thud(0, 205, 110, 0.082, 0.25)],
  garbage: [thud(0, 240, 170, 0.084, 0.22), thud(0.115, 200, 135, 0.11, 0.23)],
});

const flick = (at, hz, gain, dur = 0.045) => sweep(at, hz, hz * 0.6, gain, dur);
const stamp = (at, gain) => [
  noise(at, 0.041, gain * 0.75, "lowpass", 830, { attack: 0.002 }),
  thud(at, 244, 98, 0.088, gain),
];
const post = kit({
  tone: (at, m, long, k) => [
    flick(at, 2300, 0.075 * k, 0.03),
    tone(at, note(m), long ? 0.26 : 0.135, "triangle", 0.205 * k, { filter: "lowpass", ff: 1480 }),
  ],
  move: [flick(0, 2000, 0.09)],
  rotate: [flick(0, 2600, 0.13), flick(0.032, 1170, 0.055)],
  kick: [flick(0, 3270, 0.14), tap(0.04, 1250, 0.105)],
  hold: [flick(0, 1400, 0.13, 0.105)],
  lock: [...stamp(0, 0.175)],
  hardDrop: [...stamp(0, 0.3), flick(0.028, 1380, 0.08)],
  garbage: [...stamp(0, 0.2), ...stamp(0.13, 0.23)],
});

const graphiteTip = (at, hz, gain) =>
  tone(at, hz, 0.024, "sine", gain, { partials: [[1.77, 0.28]], decay: "fast", attack: 0.001 });
const carbon = kit({
  tone: (at, m, long, k) => [
    tone(at, note(m), long ? 0.22 : 0.095, "sine", 0.2 * k, { partials: [[2.08, 0.4]], decay: "fast" }),
    tap(at, 1650, 0.065 * k),
  ],
  move: [graphiteTip(0, 2370, 0.058)],
  rotate: [graphiteTip(0, 1880, 0.085), graphiteTip(0.021, 2820, 0.07)],
  kick: [graphiteTip(0, 1580, 0.11), graphiteTip(0.029, 2410, 0.09), tap(0.035, 4800, 0.06)],
  hold: [sweep(0, 1900, 3400, 0.1, 0.06), graphiteTip(0.041, 1390, 0.06)],
  lock: [graphiteTip(0, 700, 0.16), tap(0, 1200, 0.1)],
  hardDrop: [graphiteTip(0, 530, 0.18), thud(0, 211, 82, 0.087, 0.29)],
  garbage: [thud(0, 305, 174, 0.09, 0.23), thud(0.12, 255, 130, 0.105, 0.24)],
});

const seed = (at, hz, gain) =>
  tone(at, hz, 0.04, "sine", gain, { to: hz * 0.83, partials: [[2.45, 0.23]], decay: "fast", attack: 0.002 });
const chestnut = kit({
  tone: (at, m, long, k) => [
    tone(at, note(m - 12), long ? 0.3 : 0.155, "triangle", 0.218 * k, {
      partials: [
        [3, 0.23],
        [5, 0.11],
      ],
      filter: "lowpass",
      ff: 2400,
      attack: 0.025,
    }),
  ],
  move: [seed(0, 710, 0.072)],
  rotate: [seed(0, 640, 0.096), seed(0.024, 790, 0.081), seed(0.051, 535, 0.055)],
  kick: [seed(0, 555, 0.13), seed(0.027, 900, 0.08), seed(0.061, 760, 0.105)],
  hold: [seed(0, 920, 0.1), seed(0.056, 575, 0.095)],
  lock: [seed(0, 405, 0.18), seed(0.031, 605, 0.11)],
  hardDrop: [seed(0, 350, 0.21), thud(0, 157, 76, 0.12, 0.27), seed(0.044, 510, 0.09)],
  garbage: [seed(0, 260, 0.22), thud(0.13, 190, 84, 0.11, 0.26)],
});

const foot = (at, gain) => noise(at, 0.052, gain, "lowpass", 410, { attack: 0.009 });
const flute = (at, hz, dur, gain) =>
  tone(at, hz, dur, "sine", gain, {
    partials: [
      [2, 0.22],
      [3, 0.08],
    ],
    attack: 0.025,
  });
const whiteNight = kit({
  tone: (at, m, long, k) => [flute(at, note(m), long ? 0.36 : 0.17, 0.21 * k), sweep(at, 2250, 1600, 0.042 * k, 0.065)],
  move: [foot(0, 0.115), thud(0, 320, 240, 0.039, 0.045)],
  rotate: [foot(0, 0.125), foot(0.04, 0.09)],
  kick: [foot(0, 0.145), tap(0.042, 1600, 0.085)],
  hold: [flute(0, 494, 0.12, 0.115), sweep(0, 1600, 2000, 0.08, 0.056)],
  lock: [foot(0, 0.18), thud(0, 186, 106, 0.065, 0.14)],
  hardDrop: [foot(0, 0.215), thud(0, 118, 65, 0.12, 0.28)],
  garbage: [flute(0, 294, 0.12, 0.22), flute(0.13, 220, 0.18, 0.22)],
});

const ink = kit({
  tone: (at, m, long, k) => [
    tone(at, note(m - 12), long ? 0.33 : 0.17, "sine", 0.215 * k, {
      partials: [
        [1.59, 0.33],
        [2.14, 0.17],
      ],
      decay: "fast",
    }),
  ],
  move: [brush(0, 1950, 1020, 0.125, 0.037)],
  rotate: [sweep(0, 470, 3200, 0.21, 0.092)],
  kick: [sweep(0, 750, 3800, 0.195, 0.09), tap(0.066, 1280, 0.11)],
  hold: [brush(0, 2180, 280, 0.14, 0.11)],
  lock: [thud(0, 159, 85, 0.095, 0.2)],
  hardDrop: [thud(0, 133, 51, 0.15, 0.33), tone(0, 340, 0.063, "sine", 0.1, { to: 230 })],
  garbage: [thud(0, 145, 72, 0.105, 0.27), thud(0.14, 118, 53, 0.13, 0.28)],
});

export const ADDITIONAL_SOUND_SETS = Object.freeze({
  porcelain,
  relay,
  tide,
  velvet,
  press,
  film,
  post,
  carbon,
  chestnut,
  whiteNight,
  ink,
});
