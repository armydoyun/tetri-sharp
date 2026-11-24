// 효과음 묶음: 게임 테마마다 하나. 파일 없이 Web Audio로 합성할 조각 목록(데이터만 — DOM·오디오 없음).
// 모든 묶음은 같은 사건에 같은 박자·같은 음(멜로디 틀)을 쓰고, 악기(음색)만 다르다 → 손에 익은 리듬은 그대로.
// 원칙(docs/DESIGN_SYSTEM.md "보드 테마"과 같다): 네모파·톱니파(오래된 게임기 소리) 없이, 실제 물건을 건드리는 소리 쪽으로.
// 소리를 고를 때 쓴 견본 페이지도 이 파일을 그대로 묶어 만들었다 → 페이지에서 들은 소리가 게임 소리다.

/**
 * 소리 한 조각. 소리 하나 = 조각 여러 개.
 * @typedef {{ at: number, f: number, dur: number, wave: OscillatorType | "noise", gain: number, to?: number,
 *   filter?: BiquadFilterType, ff?: number, fto?: number, q?: number, partials?: Array<[number, number]>,
 *   decay?: "fast" | "slow", attack?: number }} Part
 *   f·to: 시작·끝 주파수(Hz, noise면 0) · partials: [배수, 크기] 배음 · filter: ff→fto Hz · attack: 소리가 차오르는 시간(초)
 */

export const note = n => 440 * Math.pow(2, (n - 69) / 12);

/** @returns {Part} */
const P = (at, f, dur, wave, gain, extra = {}) => ({ at, f, dur, wave, gain, ...extra });
const noise = (at, dur, gain, filter, ff, extra = {}) => P(at, 0, dur, "noise", gain, { filter, ff, ...extra });

/** 콤보 음계: 이어질수록 한 칸씩 높아진다(5음 음계라 어느 악기에서도 거슬리지 않게) */
const COMBO_STEPS = [74, 76, 79, 81, 83, 86, 88, 91, 93, 95, 98, 100];

/**
 * 멜로디 틀: 모든 묶음이 같은 박자·같은 음. [시작(초), 미디 번호, 길게?, 크기 배율]
 * @type {Record<string, Array<[number, number, boolean?, number?]>>}
 */
const TUNES = {
  clear1: [[0, 72]],
  clear2: [
    [0, 72],
    [0.07, 76],
  ],
  clear3: [
    [0, 72],
    [0.065, 76],
    [0.13, 79],
  ],
  quad: [
    [0, 72],
    [0.06, 76],
    [0.12, 79],
    [0.18, 84, true, 1.1],
  ],
  tspin: [
    [0.09, 83],
    [0.17, 86, true, 1.1],
  ],
  tspinZero: [[0.04, 74, false, 0.8]],
  b2b: [[0.2, 91, true, 0.6]],
  perfect: [
    [0, 72],
    [0.08, 76],
    [0.16, 79],
    [0.24, 84],
    [0.34, 88, true, 1.1],
  ],
  levelUp: [
    [0, 79],
    [0.08, 84, true],
  ],
  success: [
    [0, 76],
    [0.07, 83, true],
  ],
  miss: [[0, 60, true, 0.85]],
  gameOver: [
    [0, 67],
    [0.16, 62],
    [0.32, 55, true, 1.1],
  ],
  clearGoal: [
    [0, 72],
    [0.1, 79],
    [0.2, 84, true, 1.1],
  ],
  timeUp: [
    [0, 84],
    [0.14, 84, true],
  ],
  ready: [[0, 69]],
  go: [[0, 81, true]],
};

/**
 * 악기 하나로 묶음 전체를 만든다.
 * @param {{
 *   tone: (at: number, midi: number, long: boolean, gain: number) => Part[],
 *   octave?: number,
 *   move: Part[], rotate: Part[], kick: Part[], hold: Part[], lock: Part[], hardDrop: Part[],
 *   garbage: Part[], glide?: (at: number) => Part[],
 * }} inst
 * @returns {Record<string, Part[]>}
 */
const kit = inst => {
  const shift = inst.octave ?? 0;
  /** @param {Array<[number, number, boolean?, number?]>} tune */
  const play = tune => tune.flatMap(([at, m, long = false, k = 1]) => inst.tone(at, m + shift, long, k));
  /** @type {Record<string, Part[]>} */
  const set = {
    move: inst.move,
    rotate: inst.rotate,
    kick: inst.kick,
    hold: inst.hold,
    lock: inst.lock,
    hardDrop: inst.hardDrop,
    garbage: inst.garbage,
  };
  for (const [name, tune] of Object.entries(TUNES)) set[name] = play(tune);
  // T-spin은 회전 소리로 열고 멜로디로 닫는다
  set.tspin = [...(inst.glide ? inst.glide(0) : inst.kick), ...set.tspin];
  set.tspinZero = [...(inst.glide ? inst.glide(0) : inst.kick), ...set.tspinZero];
  for (let c = 1; c <= 12; c++) set[`combo${c}`] = inst.tone(0.1, COMBO_STEPS[c - 1] + shift, false, 0.6);
  return set;
};

// ---- 스튜디오: 사인·삼각파의 깔끔한 클릭과 짧은 음(기본) ----
const STUDIO = kit({
  tone: (at, m, long, k) => [
    long
      ? P(at, note(m), 0.34, "sine", 0.21 * k, { partials: [[2, 0.25]] })
      : P(at, note(m), 0.14, "triangle", 0.2 * k),
  ],
  move: [P(0, 1900, 0.014, "sine", 0.05)],
  rotate: [P(0, 1250, 0.04, "sine", 0.08, { to: 1650 })],
  kick: [P(0, 980, 0.055, "sine", 0.09, { to: 1750 }), P(0.02, 2400, 0.03, "sine", 0.03)],
  hold: [P(0, 600, 0.08, "sine", 0.14, { to: 820 })],
  lock: [P(0, 210, 0.05, "sine", 0.22, { to: 140 })],
  hardDrop: [noise(0, 0.05, 0.08, "lowpass", 1800), P(0, 140, 0.1, "sine", 0.34, { to: 60 })],
  garbage: [P(0, 150, 0.09, "triangle", 0.26, { to: 95 }), P(0.11, 130, 0.12, "triangle", 0.26, { to: 80 })],
  glide: at => [P(at, note(67), 0.1, "sine", 0.13, { to: note(79) })],
});

// ---- 페이퍼: 종이에 톡, 종이 스치는 소리, 칼림바(엄지 피아노) ----
const PAPER = kit({
  tone: (at, m, long, k) => [
    P(at, note(m), long ? 0.55 : 0.28, "sine", 0.2 * k, { partials: [[5.9, 0.18]], decay: "fast" }),
  ],
  move: [noise(0, 0.02, 0.09, "bandpass", 1800, { q: 2 })],
  rotate: [noise(0, 0.05, 0.08, "bandpass", 2500, { fto: 5200, q: 1.5 })],
  kick: [
    noise(0, 0.06, 0.1, "bandpass", 2200, { fto: 6000, q: 1.5 }),
    noise(0.035, 0.015, 0.06, "bandpass", 3000, { q: 3 }),
  ],
  hold: [noise(0, 0.1, 0.08, "bandpass", 1400, { fto: 3000, q: 1.2 })],
  lock: [noise(0, 0.03, 0.12, "lowpass", 900), P(0, 300, 0.04, "sine", 0.14, { to: 220 })],
  hardDrop: [noise(0, 0.08, 0.17, "lowpass", 420), P(0, 105, 0.11, "sine", 0.32, { to: 60 })],
  garbage: [
    noise(0, 0.05, 0.2, "lowpass", 600),
    P(0, 180, 0.08, "sine", 0.24, { to: 120 }),
    noise(0.12, 0.05, 0.2, "lowpass", 600),
    P(0.12, 160, 0.09, "sine", 0.24, { to: 105 }),
  ],
});

// ---- 블루프린트: 샤프펜슬 딸깍, 자 눈금, 맑은 사인 신호음(완전5도 배음) ----
const BLUEPRINT = kit({
  octave: 12,
  tone: (at, m, long, k) => [
    P(at, note(m), long ? 0.4 : 0.12, "sine", 0.16 * k, { partials: [[1.5, 0.22]], attack: 0.008 }),
  ],
  move: [noise(0, 0.008, 0.07, "highpass", 6000)],
  rotate: [noise(0, 0.008, 0.06, "highpass", 5000), noise(0.03, 0.008, 0.05, "highpass", 6500)],
  kick: [
    noise(0, 0.008, 0.07, "highpass", 5000),
    noise(0.025, 0.008, 0.06, "highpass", 6500),
    P(0.04, 2600, 0.04, "sine", 0.04),
  ],
  hold: [P(0, 1500, 0.06, "sine", 0.08), P(0.05, 2250, 0.08, "sine", 0.06)],
  lock: [P(0, 1200, 0.03, "sine", 0.1, { decay: "fast" }), noise(0, 0.006, 0.05, "highpass", 4000)],
  hardDrop: [noise(0, 0.03, 0.07, "highpass", 3000), P(0, 150, 0.09, "sine", 0.3, { to: 70 })],
  garbage: [
    P(0, 220, 0.12, "sine", 0.26, { partials: [[1.5, 0.3]] }),
    P(0.14, 196, 0.16, "sine", 0.26, { partials: [[1.5, 0.3]] }),
  ],
});

// ---- 그라파이트: 거의 무음. 조작은 들릴락 말락, 쓰레기 경고와 게임 오버만 또렷하게 ----
const GRAPHITE = kit({
  tone: (at, m, long, k) => [P(at, note(m + 4), long ? 0.18 : 0.07, "sine", 0.08 * k)],
  move: [noise(0, 0.008, 0.025, "lowpass", 2500)],
  rotate: [noise(0, 0.012, 0.03, "lowpass", 3000)],
  kick: [noise(0, 0.012, 0.035, "lowpass", 3500), noise(0.03, 0.01, 0.025, "lowpass", 3500)],
  hold: [noise(0, 0.02, 0.03, "lowpass", 1500)],
  lock: [P(0, 180, 0.03, "sine", 0.08)],
  hardDrop: [P(0, 110, 0.06, "sine", 0.16, { to: 60 })],
  garbage: [P(0, 150, 0.09, "triangle", 0.24, { to: 95 }), P(0.11, 130, 0.12, "triangle", 0.24, { to: 80 })],
  glide: at => [P(at, note(74), 0.05, "sine", 0.05)],
});
// 게임 오버는 작게만 두지 않는다
GRAPHITE.gameOver = [P(0, note(62), 0.25, "sine", 0.16), P(0.22, note(55), 0.5, "sine", 0.16)];

// ---- 프레임: 금속 — 쇠 클릭, 경첩, 비브라폰 ----
const FRAME = kit({
  octave: 12,
  tone: (at, m, long, k) => [
    P(at, note(m), long ? 0.7 : 0.3, "sine", 0.15 * k, {
      partials: [
        [4, 0.16],
        [9.2, 0.05],
      ],
    }),
  ],
  move: [noise(0, 0.01, 0.07, "bandpass", 7000, { q: 8 })],
  rotate: [P(0, 3200, 0.04, "sine", 0.06, { partials: [[2.1, 0.4]], decay: "fast" })],
  kick: [
    P(0, 2800, 0.05, "sine", 0.07, { to: 3600, partials: [[2.1, 0.4]] }),
    noise(0.03, 0.01, 0.05, "bandpass", 7000, { q: 8 }),
  ],
  hold: [P(0, 1700, 0.1, "sine", 0.07, { partials: [[2.4, 0.3]] })],
  lock: [
    P(0, 900, 0.05, "sine", 0.17, {
      partials: [
        [2.4, 0.5],
        [5.1, 0.2],
      ],
      decay: "fast",
    }),
  ],
  hardDrop: [noise(0, 0.04, 0.08, "bandpass", 5000, { q: 2 }), P(0, 150, 0.1, "sine", 0.32, { to: 65 })],
  garbage: [
    P(0, 330, 0.12, "sine", 0.2, {
      partials: [
        [2.4, 0.4],
        [5.1, 0.15],
      ],
    }),
    P(0.13, 294, 0.16, "sine", 0.2, {
      partials: [
        [2.4, 0.4],
        [5.1, 0.15],
      ],
    }),
  ],
  glide: at => [P(at, 2600, 0.08, "sine", 0.06, { to: 3800, partials: [[2.1, 0.3]] })],
});

// ---- 샌드: 점토 — 모래 쓸리는 소리, 토기 두드림, 오카리나 ----
const SAND = kit({
  tone: (at, m, long, k) => [
    P(at, note(m), long ? 0.45 : 0.2, "triangle", 0.19 * k, { filter: "lowpass", ff: 1400, attack: 0.02 }),
  ],
  move: [noise(0, 0.03, 0.06, "lowpass", 1200)],
  rotate: [P(0, 420, 0.05, "sine", 0.12, { to: 330, partials: [[2.2, 0.25]], decay: "fast" })],
  kick: [
    P(0, 420, 0.05, "sine", 0.12, { to: 330, partials: [[2.2, 0.25]] }),
    P(0.03, 520, 0.04, "sine", 0.08, { to: 400 }),
  ],
  hold: [noise(0, 0.09, 0.06, "lowpass", 900, { fto: 1800 })],
  lock: [P(0, 330, 0.06, "sine", 0.2, { to: 250, partials: [[2.2, 0.3]], decay: "fast" })],
  hardDrop: [noise(0, 0.07, 0.12, "lowpass", 500), P(0, 120, 0.11, "sine", 0.33, { to: 65 })],
  garbage: [
    P(0, 210, 0.08, "sine", 0.27, { to: 170, partials: [[2.2, 0.35]] }),
    P(0.12, 190, 0.1, "sine", 0.27, { to: 150, partials: [[2.2, 0.35]] }),
  ],
});

// ---- 미드나잇: 유리 — 맑은 종소리와 짧은 잔향 ----
const bell = (at, m, dur, gain) =>
  P(at, note(m), dur, "sine", gain, {
    partials: [
      [2.76, 0.35],
      [5.4, 0.12],
    ],
    decay: "slow",
  });
const MIDNIGHT = kit({
  octave: 12,
  tone: (at, m, long, k) => [bell(at, m, long ? 0.8 : 0.5, 0.14 * k)],
  move: [P(0, 3100, 0.012, "sine", 0.035)],
  rotate: [P(0, 2300, 0.07, "sine", 0.06, { partials: [[2.76, 0.2]], decay: "slow" })],
  kick: [P(0, 2000, 0.08, "sine", 0.07, { to: 2600, partials: [[2.76, 0.2]] }), P(0.03, 3600, 0.05, "sine", 0.03)],
  hold: [P(0, 1300, 0.14, "sine", 0.08, { partials: [[2.76, 0.25]], decay: "slow" })],
  lock: [P(0, 520, 0.08, "sine", 0.16, { partials: [[2.76, 0.2]], decay: "fast" })],
  hardDrop: [noise(0, 0.05, 0.06, "highpass", 3000), P(0, 160, 0.1, "sine", 0.3, { to: 70 })],
  garbage: [
    P(0, 196, 0.22, "sine", 0.2, { partials: [[1.02, 0.9]] }),
    P(0.14, 185, 0.26, "sine", 0.2, { partials: [[1.03, 0.9]] }),
  ],
  glide: at => [P(at, note(79), 0.12, "sine", 0.1, { to: note(91) })],
});

// ---- 포레스트: 나무 — 연필 톡, 나무 블록, 마림바 ----
const marimba = (at, m, dur, gain) =>
  P(at, note(m), dur, "sine", gain, {
    partials: [
      [4, 0.35],
      [10, 0.08],
    ],
    decay: "fast",
  });
const knock = (at, f, gain) => P(at, f, 0.06, "sine", gain, { partials: [[2.3, 0.4]], decay: "fast" });
const FOREST = kit({
  tone: (at, m, long, k) => [marimba(at, m, long ? 0.5 : 0.28, 0.21 * k)],
  move: [noise(0, 0.018, 0.11, "bandpass", 2600, { q: 3 })],
  rotate: [noise(0, 0.045, 0.1, "bandpass", 1800, { fto: 4200, q: 2 })],
  kick: [
    noise(0, 0.06, 0.12, "bandpass", 1500, { fto: 5000, q: 2 }),
    noise(0.03, 0.015, 0.08, "bandpass", 3500, { q: 4 }),
  ],
  hold: [noise(0, 0.09, 0.09, "bandpass", 1200, { fto: 2600, q: 1.5 })],
  lock: [
    P(0, 760, 0.045, "sine", 0.2, { partials: [[2.7, 0.3]], decay: "fast" }),
    noise(0, 0.012, 0.06, "bandpass", 3000, { q: 3 }),
  ],
  hardDrop: [
    noise(0, 0.07, 0.16, "lowpass", 500),
    P(0, 120, 0.11, "sine", 0.34, { to: 70 }),
    P(0.004, 640, 0.04, "sine", 0.1, { decay: "fast" }),
  ],
  garbage: [knock(0, 220, 0.27), knock(0.12, 200, 0.27)],
});

// ---- 화이트: 볼펜 딸깍, 책상 톡, 펠트 피아노(부드럽게 눌린 피아노) ----
const WHITE = kit({
  tone: (at, m, long, k) => [
    P(at, note(m), long ? 0.5 : 0.22, "triangle", 0.18 * k, {
      partials: [
        [2, 0.3],
        [3, 0.1],
      ],
      decay: "fast",
      filter: "lowpass",
      ff: 3200,
    }),
  ],
  move: [noise(0, 0.006, 0.08, "highpass", 3500), noise(0.012, 0.006, 0.05, "highpass", 4500)],
  rotate: [noise(0, 0.01, 0.08, "bandpass", 3000, { q: 4 }), P(0, 1600, 0.025, "sine", 0.05)],
  kick: [noise(0, 0.01, 0.09, "bandpass", 3000, { q: 4 }), noise(0.03, 0.01, 0.07, "bandpass", 3800, { q: 4 })],
  hold: [noise(0, 0.006, 0.07, "highpass", 3500), P(0.01, 700, 0.07, "sine", 0.1, { to: 900 })],
  lock: [P(0, 250, 0.04, "sine", 0.2, { to: 180 }), noise(0, 0.01, 0.05, "lowpass", 1500)],
  hardDrop: [noise(0, 0.05, 0.1, "lowpass", 1200), P(0, 130, 0.1, "sine", 0.34, { to: 60 })],
  garbage: [P(0, 165, 0.1, "triangle", 0.26, { to: 110 }), P(0.12, 147, 0.13, "triangle", 0.26, { to: 98 })],
});

// ---- 샤프(숨은 테마): 스튜디오를 모든 음 반음(#) 올려서 ----
const SHARP = Math.pow(2, 1 / 12);
/** @param {Part} p */
const lift = p => ({
  ...p,
  f: p.f * SHARP,
  ...(p.to ? { to: p.to * SHARP } : {}),
  ...(p.ff ? { ff: p.ff * SHARP } : {}),
  ...(p.fto ? { fto: p.fto * SHARP } : {}),
});

/** 테마 키 → 묶음(js/render/themes.js의 키와 같다) */
export const SOUND_SETS = Object.freeze({
  modern: STUDIO,
  retro: PAPER,
  minimal: BLUEPRINT,
  graphite: GRAPHITE,
  frame: FRAME,
  stone: SAND,
  midnight: MIDNIGHT,
  forest: FOREST,
  white: WHITE,
  sharp: Object.fromEntries(Object.entries(STUDIO).map(([k, v]) => [k, v.map(lift)])),
});

export const SOUND_NAMES = Object.freeze(Object.keys(STUDIO));
