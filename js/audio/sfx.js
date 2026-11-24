// 효과음: 파일 없이 Web Audio로 그때그때 합성한다(한 파일 배포본 용량을 늘리지 않는다).
// 엔진 이벤트를 받아 소리를 고른다. 같은 프레임에 같은 소리가 여러 번 나지 않게 한 번만 낸다.
// 소리를 고르는 부분(soundsFor)은 DOM·오디오 없이 돌아서 Node 테스트로 확인한다.

/**
 * 이벤트 한 프레임 분량 → 낼 소리 이름들(순서대로, 중복 없음)
 * @param {any[]} events
 * @returns {string[]}
 */
export const soundsFor = events => {
  /** @type {string[]} */
  const out = [];
  const add = name => {
    if (!out.includes(name)) out.push(name);
  };
  let dropped = false;
  for (const e of events) {
    if (e.type === "move") add("move");
    else if (e.type === "rotate") add(e.kick > 0 ? "kick" : "rotate");
    else if (e.type === "hold") add("hold");
    else if (e.type === "hardDrop") {
      dropped = true;
      add("hardDrop");
    } else if (e.type === "lock") {
      if (e.perfect) add("perfect");
      else if (e.tspin !== "none" && e.lines > 0) add("tspin");
      else if (e.lines >= 4) add("quad");
      else if (e.lines > 0) add(`clear${e.lines}`);
      else if (e.tspin !== "none") add("tspinZero");
      else if (!dropped) add("lock");
      if (e.b2b) add("b2b");
      if (e.combo >= 1) add(`combo${Math.min(e.combo, 12)}`);
    } else if (e.type === "levelUp") add("levelUp");
    else if (e.type === "garbage") add("garbage");
    else if (e.type === "practice" && !e.reset) add(e.success ? "success" : "miss");
    else if (e.type === "gameOver") add("gameOver");
    else if (e.type === "finish") add(e.result === "clear" ? "clearGoal" : "timeUp");
  }
  return out;
};

const note = n => 440 * Math.pow(2, (n - 69) / 12);

/**
 * 소리 한 조각. 소리 하나 = 조각 여러 개.
 * @typedef {{ at: number, f: number, dur: number, wave: OscillatorType | "noise", gain: number, to?: number,
 *   filter?: BiquadFilterType, ff?: number, fto?: number, q?: number, partials?: Array<[number, number]>, decay?: "fast" | "slow" }} Part
 *   f·to: 시작·끝 주파수(Hz, noise면 0), partials: [배수, 크기] 배음(마림바·종), filter: 잡음·음을 거르는 필터(ff→fto Hz)
 */
/** @returns {Part} */
const P = (at, f, dur, wave, gain, extra = {}) => ({ at, f, dur, wave, gain, ...extra });
const arp = (notes, step, dur, wave, gain, extra = {}) =>
  notes.map((m, i) => P(i * step, note(m), dur, wave, gain, extra));
/** 콤보 음계: 이어질수록 한 칸씩 높아진다(5음 음계라 어느 묶음에서도 거슬리지 않게) */
const COMBO_STEPS = [74, 76, 79, 81, 83, 86, 88, 91, 93, 95, 98, 100];

// ---- 기본(스튜디오·프레임·화이트): 사인·삼각파의 깔끔한 클릭과 짧은 음. 네모파(오래된 게임기 소리)는 쓰지 않는다 ----
const CLEAN = {
  move: [P(0, 1900, 0.014, "sine", 0.05)],
  rotate: [P(0, 1250, 0.04, "sine", 0.08, { to: 1650 })],
  kick: [P(0, 980, 0.055, "sine", 0.09, { to: 1750 }), P(0.02, 2400, 0.03, "sine", 0.03)],
  hold: [P(0, 600, 0.08, "sine", 0.14, { to: 820 })],
  lock: [P(0, 210, 0.05, "sine", 0.22, { to: 140 })],
  hardDrop: [P(0, 0, 0.05, "noise", 0.08, { filter: "lowpass", ff: 1800 }), P(0, 140, 0.1, "sine", 0.34, { to: 60 })],
  clear1: [P(0, note(72), 0.14, "triangle", 0.2)],
  clear2: arp([72, 76], 0.07, 0.14, "triangle", 0.2),
  clear3: arp([72, 76, 79], 0.065, 0.14, "triangle", 0.2),
  quad: [
    ...arp([72, 76, 79], 0.06, 0.1, "triangle", 0.19),
    P(0.18, note(84), 0.34, "sine", 0.22, { partials: [[2, 0.25]] }),
  ],
  tspin: [
    P(0, note(67), 0.1, "sine", 0.14, { to: note(79) }),
    P(0.09, note(83), 0.12, "triangle", 0.17),
    P(0.17, note(86), 0.26, "sine", 0.2, { partials: [[2, 0.3]] }),
  ],
  tspinZero: [P(0, note(67), 0.1, "sine", 0.12, { to: note(74) })],
  b2b: [P(0.2, note(91), 0.2, "sine", 0.1, { partials: [[2, 0.3]] })],
  perfect: [
    ...arp([72, 76, 79, 84], 0.08, 0.12, "triangle", 0.17),
    P(0.34, note(88), 0.5, "sine", 0.2, {
      partials: [
        [2, 0.3],
        [3, 0.12],
      ],
    }),
  ],
  levelUp: arp([79, 84], 0.08, 0.16, "triangle", 0.16),
  garbage: [P(0, 150, 0.09, "triangle", 0.26, { to: 95 }), P(0.11, 130, 0.12, "triangle", 0.26, { to: 80 })],
  success: arp([76, 83], 0.07, 0.14, "triangle", 0.18),
  miss: [P(0, note(60), 0.16, "triangle", 0.16, { to: note(55) })],
  gameOver: [
    P(0, note(67), 0.18, "triangle", 0.18),
    P(0.16, note(62), 0.18, "triangle", 0.18),
    P(0.32, note(55), 0.5, "sine", 0.22),
  ],
  clearGoal: [
    ...arp([72, 79], 0.1, 0.12, "triangle", 0.18),
    P(0.2, note(84), 0.5, "sine", 0.2, { partials: [[2, 0.3]] }),
  ],
  timeUp: [P(0, note(84), 0.12, "triangle", 0.16), P(0.14, note(84), 0.3, "triangle", 0.16)],
  ready: [P(0, note(69), 0.09, "sine", 0.18)],
  go: [P(0, note(81), 0.18, "sine", 0.2)],
  combo: c => [P(0.1, note(COMBO_STEPS[c - 1]), 0.09, "sine", 0.12)],
};

// ---- 종이·나무(페이퍼·샌드·포레스트): 연필 톡, 종이 스치는 소리, 나무 블록, 마림바 ----
const marimba = (at, m, dur, gain) =>
  P(at, note(m), dur, "sine", gain, {
    partials: [
      [4, 0.35],
      [10, 0.08],
    ],
    decay: "fast",
  });
const knock = (at, f, gain) => P(at, f, 0.06, "sine", gain, { partials: [[2.3, 0.4]], decay: "fast" });
const WOOD = {
  move: [P(0, 0, 0.018, "noise", 0.11, { filter: "bandpass", ff: 2600, q: 3 })],
  rotate: [P(0, 0, 0.045, "noise", 0.1, { filter: "bandpass", ff: 1800, fto: 4200, q: 2 })],
  kick: [
    P(0, 0, 0.06, "noise", 0.12, { filter: "bandpass", ff: 1500, fto: 5000, q: 2 }),
    P(0.03, 0, 0.015, "noise", 0.08, { filter: "bandpass", ff: 3500, q: 4 }),
  ],
  hold: [P(0, 0, 0.09, "noise", 0.09, { filter: "bandpass", ff: 1200, fto: 2600, q: 1.5 })],
  lock: [
    P(0, 760, 0.045, "sine", 0.2, { partials: [[2.7, 0.3]], decay: "fast" }),
    P(0, 0, 0.012, "noise", 0.06, { filter: "bandpass", ff: 3000, q: 3 }),
  ],
  hardDrop: [
    P(0, 0, 0.07, "noise", 0.16, { filter: "lowpass", ff: 500 }),
    P(0, 120, 0.11, "sine", 0.34, { to: 70 }),
    P(0.004, 640, 0.04, "sine", 0.1, { decay: "fast" }),
  ],
  clear1: [marimba(0, 72, 0.3, 0.22)],
  clear2: [marimba(0, 72, 0.28, 0.21), marimba(0.075, 76, 0.32, 0.21)],
  clear3: [marimba(0, 72, 0.28, 0.2), marimba(0.07, 76, 0.28, 0.2), marimba(0.14, 79, 0.34, 0.2)],
  quad: [
    marimba(0, 72, 0.26, 0.2),
    marimba(0.06, 76, 0.26, 0.2),
    marimba(0.12, 79, 0.26, 0.2),
    marimba(0.18, 84, 0.5, 0.22),
    marimba(0.18, 72, 0.5, 0.12),
  ],
  tspin: [
    P(0, 0, 0.06, "noise", 0.1, { filter: "bandpass", ff: 1500, fto: 5000, q: 2 }),
    marimba(0.06, 79, 0.24, 0.2),
    marimba(0.13, 86, 0.42, 0.22),
  ],
  tspinZero: [
    P(0, 0, 0.06, "noise", 0.1, { filter: "bandpass", ff: 1500, fto: 5000, q: 2 }),
    marimba(0.05, 74, 0.2, 0.16),
  ],
  b2b: [marimba(0.2, 91, 0.3, 0.12)],
  perfect: [
    marimba(0, 72, 0.25, 0.18),
    marimba(0.08, 76, 0.25, 0.18),
    marimba(0.16, 79, 0.25, 0.18),
    marimba(0.24, 84, 0.25, 0.18),
    marimba(0.34, 88, 0.6, 0.22),
    marimba(0.34, 76, 0.6, 0.12),
  ],
  levelUp: [marimba(0, 79, 0.2, 0.17), marimba(0.08, 84, 0.3, 0.17)],
  garbage: [knock(0, 220, 0.27), knock(0.12, 200, 0.27)],
  success: [marimba(0, 76, 0.2, 0.18), marimba(0.07, 83, 0.3, 0.18)],
  miss: [knock(0, 300, 0.2), marimba(0.06, 60, 0.3, 0.14)],
  gameOver: [marimba(0, 67, 0.3, 0.2), marimba(0.16, 62, 0.3, 0.2), marimba(0.32, 55, 0.7, 0.24)],
  clearGoal: [marimba(0, 72, 0.25, 0.18), marimba(0.1, 79, 0.25, 0.18), marimba(0.2, 84, 0.7, 0.22)],
  timeUp: [marimba(0, 84, 0.2, 0.16), marimba(0.14, 84, 0.45, 0.16)],
  ready: [marimba(0, 69, 0.2, 0.18)],
  go: [marimba(0, 81, 0.35, 0.2)],
  combo: c => [marimba(0.1, COMBO_STEPS[c - 1], 0.18, 0.16)],
};

// ---- 유리·종(미드나잇·블루프린트): 맑은 종과 짧은 잔향. 이동·회전은 아주 높고 작게 ----
const bell = (at, m, dur, gain) =>
  P(at, note(m), dur, "sine", gain, {
    partials: [
      [2.76, 0.35],
      [5.4, 0.12],
    ],
    decay: "slow",
  });
const GLASS = {
  move: [P(0, 3100, 0.012, "sine", 0.035)],
  rotate: [P(0, 2300, 0.07, "sine", 0.06, { partials: [[2.76, 0.2]], decay: "slow" })],
  kick: [P(0, 2000, 0.08, "sine", 0.07, { to: 2600, partials: [[2.76, 0.2]] }), P(0.03, 3600, 0.05, "sine", 0.03)],
  hold: [P(0, 1300, 0.14, "sine", 0.08, { partials: [[2.76, 0.25]], decay: "slow" })],
  lock: [P(0, 520, 0.08, "sine", 0.16, { partials: [[2.76, 0.2]], decay: "fast" })],
  hardDrop: [P(0, 0, 0.05, "noise", 0.06, { filter: "highpass", ff: 3000 }), P(0, 160, 0.1, "sine", 0.3, { to: 70 })],
  clear1: [bell(0, 84, 0.6, 0.16)],
  clear2: [bell(0, 84, 0.55, 0.15), bell(0.08, 88, 0.65, 0.15)],
  clear3: [bell(0, 84, 0.5, 0.14), bell(0.07, 88, 0.55, 0.14), bell(0.14, 91, 0.7, 0.14)],
  quad: [
    bell(0, 84, 0.45, 0.13),
    bell(0.06, 88, 0.45, 0.13),
    bell(0.12, 91, 0.45, 0.13),
    bell(0.18, 96, 0.9, 0.15),
    bell(0.18, 84, 0.9, 0.08),
  ],
  tspin: [P(0, note(79), 0.12, "sine", 0.12, { to: note(91) }), bell(0.1, 91, 0.5, 0.15), bell(0.18, 98, 0.8, 0.14)],
  tspinZero: [P(0, note(79), 0.12, "sine", 0.1, { to: note(86) }), bell(0.08, 86, 0.4, 0.12)],
  b2b: [bell(0.2, 103, 0.5, 0.1)],
  perfect: [
    bell(0, 84, 0.5, 0.13),
    bell(0.09, 88, 0.5, 0.13),
    bell(0.18, 91, 0.5, 0.13),
    bell(0.27, 96, 0.5, 0.13),
    bell(0.38, 100, 1.1, 0.16),
  ],
  levelUp: [bell(0, 91, 0.4, 0.13), bell(0.08, 96, 0.6, 0.13)],
  garbage: [
    P(0, 196, 0.22, "sine", 0.2, { partials: [[1.02, 0.9]] }),
    P(0.14, 185, 0.26, "sine", 0.2, { partials: [[1.03, 0.9]] }),
  ],
  success: [bell(0, 88, 0.4, 0.14), bell(0.07, 95, 0.55, 0.14)],
  miss: [bell(0, 72, 0.5, 0.14)],
  gameOver: [bell(0, 79, 0.5, 0.16), bell(0.2, 74, 0.5, 0.16), bell(0.4, 67, 1.2, 0.18)],
  clearGoal: [bell(0, 84, 0.45, 0.14), bell(0.1, 91, 0.45, 0.14), bell(0.2, 96, 1, 0.16)],
  timeUp: [bell(0, 96, 0.3, 0.13), bell(0.14, 96, 0.7, 0.13)],
  ready: [bell(0, 81, 0.4, 0.15)],
  go: [bell(0, 93, 0.6, 0.17)],
  combo: c => [bell(0.1, COMBO_STEPS[c - 1] + 12, 0.3, 0.1)],
};

// ---- 거의 무음(그라파이트): 조작은 들릴락 말락 한 틱. 쓰레기 경고와 게임 오버만 또렷하게 ----
const pip = (at, m, gain = 0.08, dur = 0.07) => P(at, note(m), dur, "sine", gain);
const QUIET = {
  move: [P(0, 0, 0.008, "noise", 0.025, { filter: "lowpass", ff: 2500 })],
  rotate: [P(0, 0, 0.012, "noise", 0.03, { filter: "lowpass", ff: 3000 })],
  kick: [
    P(0, 0, 0.012, "noise", 0.035, { filter: "lowpass", ff: 3500 }),
    P(0.03, 0, 0.01, "noise", 0.025, { filter: "lowpass", ff: 3500 }),
  ],
  hold: [P(0, 0, 0.02, "noise", 0.03, { filter: "lowpass", ff: 1500 })],
  lock: [P(0, 180, 0.03, "sine", 0.08)],
  hardDrop: [P(0, 110, 0.06, "sine", 0.16, { to: 60 })],
  clear1: [pip(0, 76)],
  clear2: [pip(0, 76), pip(0.08, 76)],
  clear3: [pip(0, 76), pip(0.08, 76), pip(0.16, 76)],
  quad: [pip(0, 76), pip(0.08, 76), pip(0.16, 76), pip(0.24, 81, 0.1, 0.14)],
  tspin: [pip(0, 76), pip(0.08, 83, 0.1, 0.14)],
  tspinZero: [pip(0, 74, 0.06)],
  b2b: [pip(0.2, 88, 0.05)],
  perfect: [pip(0, 76, 0.09), pip(0.09, 79, 0.09), pip(0.18, 83, 0.09), pip(0.27, 88, 0.1, 0.25)],
  levelUp: [pip(0, 79), pip(0.08, 84)],
  garbage: CLEAN.garbage,
  success: [pip(0, 79), pip(0.07, 83)],
  miss: [pip(0, 60, 0.08, 0.12)],
  gameOver: [P(0, note(62), 0.25, "sine", 0.16), P(0.22, note(55), 0.5, "sine", 0.16)],
  clearGoal: [pip(0, 76, 0.09), pip(0.1, 83, 0.1, 0.25)],
  timeUp: [pip(0, 84), pip(0.14, 84, 0.08, 0.2)],
  ready: [pip(0, 69, 0.1)],
  go: [pip(0, 81, 0.12, 0.14)],
  combo: c => [pip(0.1, 78 + c, 0.06, 0.05)],
};

// ---- 샤프(숨은 테마): 기본 묶음의 모든 음을 반음(#) 올린다 ----
const SHARP = Math.pow(2, 1 / 12);
/** @param {Part} p */
const lift = p => ({
  ...p,
  f: p.f * SHARP,
  ...(p.to ? { to: p.to * SHARP } : {}),
  ...(p.ff ? { ff: p.ff * SHARP } : {}),
  ...(p.fto ? { fto: p.fto * SHARP } : {}),
});

/** 묶음 하나를 이름 → 조각 목록으로 펼친다(콤보 1~12 포함) */
const expand = set => {
  /** @type {Record<string, Part[]>} */
  const out = {};
  for (const [name, parts] of Object.entries(set)) if (name !== "combo") out[name] = parts;
  for (let c = 1; c <= 12; c++) out[`combo${c}`] = set.combo(c);
  return out;
};
const CLEAN_FULL = expand(CLEAN);

/** 효과음 묶음: 테마마다 하나(js/render/themes.js의 sound). 뜻과 박자는 같고 음색만 다르다 */
export const SOUND_SETS = Object.freeze({
  clean: CLEAN_FULL,
  wood: expand(WOOD),
  glass: expand(GLASS),
  quiet: expand(QUIET),
  sharp: Object.fromEntries(Object.entries(CLEAN_FULL).map(([k, v]) => [k, v.map(lift)])),
});
/** 설정에서 고를 수 있는 묶음(숨은 묶음 샤프는 테마로만) */
export const SOUND_SET_IDS = Object.freeze(["clean", "wood", "glass", "quiet"]);
const SOUNDS = CLEAN_FULL;

export const SOUND_NAMES = Object.freeze(Object.keys(SOUNDS));

/**
 * @param {{ getVolume: () => number, getSet?: () => string }} options  getVolume: 0~100, 0이면 소리 없음. getSet: 지금 쓸 묶음 id
 */
export const createSfx = ({ getVolume, getSet = () => "clean" }) => {
  /** @type {AudioContext | null} */
  let ctx = null;
  /** @type {GainNode | null} */
  let master = null;
  /** @type {AudioBuffer | null} */
  let noise = null;

  const ensure = () => {
    if (!ctx) {
      const AC = globalThis.AudioContext ?? /** @type {any} */ (globalThis).webkitAudioContext;
      if (!AC) return null;
      try {
        ctx = new AC();
      } catch {
        return null;
      }
      master = ctx.createGain();
      master.connect(ctx.destination);
      noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.2), ctx.sampleRate);
      const data = noise.getChannelData(0);
      // 소리 고르기와 상관없는 잡음이라 Math.random을 써도 결정론에 영향이 없다.
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
  };

  /** 조각 하나: 소리(또는 잡음) → [배음] → 엔벨로프 → [필터] → 전체 크기 */
  const voice = (ac, out, /** @type {Part} */ p, t0, mix) => {
    const start = t0 + p.at;
    const tail = p.decay === "slow" ? p.dur * 1.6 : p.dur;
    const env = ac.createGain();
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, p.gain * mix), start + 0.005);
    env.gain.exponentialRampToValueAtTime(0.0001, start + tail);
    /** @type {AudioNode} */
    let last = env;
    if (p.filter && ac.createBiquadFilter) {
      const f = ac.createBiquadFilter();
      f.type = p.filter;
      f.frequency.setValueAtTime(p.ff ?? 1000, start);
      if (p.fto) f.frequency.exponentialRampToValueAtTime(p.fto, start + p.dur);
      if (p.q) f.Q.value = p.q;
      env.connect(f);
      last = f;
    }
    last.connect(out);
    const source = (ratio, level) => {
      /** @type {AudioScheduledSourceNode} */
      let src;
      if (p.wave === "noise") {
        const b = ac.createBufferSource();
        b.buffer = noise;
        src = b;
      } else {
        const o = ac.createOscillator();
        o.type = p.wave;
        o.frequency.setValueAtTime(p.f * ratio, start);
        if (p.to) o.frequency.exponentialRampToValueAtTime(p.to * ratio, start + p.dur);
        src = o;
      }
      if (level === 1) src.connect(env);
      else {
        // 배음은 더 빨리 사라진다(마림바·종의 울림)
        const g = ac.createGain();
        g.gain.setValueAtTime(0.0001, start);
        g.gain.exponentialRampToValueAtTime(level, start + 0.003);
        g.gain.exponentialRampToValueAtTime(0.0001, start + tail * (p.decay === "fast" ? 0.35 : 0.6));
        src.connect(g);
        g.connect(env);
      }
      src.start(start);
      src.stop(start + tail + 0.03);
    };
    source(1, 1);
    for (const [ratio, level] of p.partials ?? []) source(ratio, level);
  };

  /**
   * @param {string} name
   * @param {number} [mix] 같은 프레임의 다른 소리와 섞을 때의 비율
   * @param {{ set?: string, volume?: number, delay?: number }} [options] set: 이번만 다른 묶음, volume: 이번만 다른 크기(미리 듣기)
   */
  const play = (name, mix = 1, options = {}) => {
    const volume = options.volume ?? getVolume();
    const set = SOUND_SETS[options.set ?? getSet()] ?? SOUND_SETS.clean;
    const parts = set[name];
    if (!parts || volume <= 0) return;
    const ac = ensure();
    if (!ac || !master) return;
    // 사람 귀는 로그 단위로 듣는다 → 슬라이더 값을 제곱해 작은 쪽을 더 세밀하게.
    master.gain.value = Math.pow(volume / 100, 2);
    const t0 = ac.currentTime + 0.005 + (options.delay ?? 0);
    for (const p of parts) voice(ac, master, p, t0, mix);
  };

  return {
    play,
    /** 묶음 하나를 짧게 들려준다(설정의 테마 미리보기): 이동·회전·하드 드롭·2줄 */
    preview(set, volume) {
      for (const [at, name] of /** @type {const} */ ([
        [0, "move"],
        [0.13, "move"],
        [0.3, "rotate"],
        [0.55, "hardDrop"],
        [0.55, "clear2"],
      ]))
        play(name, name === "clear2" ? 1 : 0.6, { set, volume, delay: at });
    },
    /** 엔진 이벤트 한 프레임 분량을 소리로 */
    events(events) {
      if (!events.length || getVolume() <= 0) return;
      const clearing = events.some(event => event.type === "lock" && event.lines > 0);
      for (const name of soundsFor(events)) {
        // 줄 삭제 멜로디가 같은 프레임의 조작·착지 소리에 묻히지 않게 한다.
        const movement = name === "move" || name === "rotate" || name === "kick" || name === "hardDrop";
        play(name, clearing && movement ? 0.42 : 1);
      }
    },
  };
};
