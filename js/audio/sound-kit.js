/**
 * 소리 한 조각. 소리 하나 = 조각 여러 개.
 * @typedef {{ at: number, f: number, dur: number, wave: OscillatorType | "noise", gain: number, to?: number,
 *   filter?: BiquadFilterType, ff?: number, fto?: number, q?: number, partials?: Array<[number, number]>,
 *   decay?: "fast" | "slow", attack?: number }} Part
 *   f·to: 시작·끝 주파수(Hz, noise면 0) · partials: [배수, 크기] 배음 · filter: ff→fto Hz · attack: 소리가 차오르는 시간(초)
 */

export const note = n => 440 * Math.pow(2, (n - 69) / 12);

/** @returns {Part} */
export const P = (at, f, dur, wave, gain, extra = {}) => ({ at, f, dur, wave, gain, ...extra });
export const noise = (at, dur, gain, filter, ff, extra = {}) => P(at, 0, dur, "noise", gain, { filter, ff, ...extra });

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
export const kit = inst => {
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
