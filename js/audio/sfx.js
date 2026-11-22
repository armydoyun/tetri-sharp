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
 * 소리 하나 = 음 여러 개. [시작(초), 미디 번호 또는 Hz, 길이(초), 파형, 크기, 끝 음(선택)]
 * @type {Record<string, Array<[number, number, number, OscillatorType | "noise", number, number?]>>}
 */
const SOUNDS = {
  move: [[0, 1600, 0.018, "square", 0.032]],
  rotate: [[0, 1100, 0.035, "triangle", 0.078, 1500]],
  kick: [[0, 900, 0.05, "triangle", 0.095, 1600]],
  hold: [[0, 520, 0.07, "sine", 0.16, 780]],
  lock: [[0, 190, 0.05, "triangle", 0.22, 120]],
  hardDrop: [
    [0, 0, 0.06, "noise", 0.12],
    [0, 150, 0.09, "sine", 0.35, 55],
  ],
  clear1: [[0, note(72), 0.12, "triangle", 0.2]],
  clear2: [
    [0, note(72), 0.09, "triangle", 0.2],
    [0.07, note(76), 0.13, "triangle", 0.2],
  ],
  clear3: [
    [0, note(72), 0.08, "triangle", 0.2],
    [0.06, note(76), 0.08, "triangle", 0.2],
    [0.12, note(79), 0.15, "triangle", 0.2],
  ],
  quad: [
    [0, note(72), 0.08, "square", 0.1],
    [0.06, note(76), 0.08, "square", 0.1],
    [0.12, note(79), 0.08, "square", 0.1],
    [0.18, note(84), 0.25, "square", 0.12],
  ],
  tspin: [
    [0, note(67), 0.09, "sawtooth", 0.08, note(79)],
    [0.08, note(79), 0.09, "square", 0.1],
    [0.15, note(86), 0.22, "square", 0.1],
  ],
  tspinZero: [[0, note(67), 0.1, "sawtooth", 0.07, note(74)]],
  b2b: [[0.2, note(91), 0.18, "sine", 0.1]],
  perfect: [
    [0, note(72), 0.1, "square", 0.1],
    [0.09, note(76), 0.1, "square", 0.1],
    [0.18, note(79), 0.1, "square", 0.1],
    [0.27, note(84), 0.1, "square", 0.1],
    [0.36, note(88), 0.35, "triangle", 0.18],
  ],
  levelUp: [
    [0, note(79), 0.08, "triangle", 0.16],
    [0.08, note(84), 0.16, "triangle", 0.16],
  ],
  garbage: [[0, 110, 0.12, "sawtooth", 0.08, 70]],
  success: [
    [0, note(76), 0.07, "triangle", 0.18],
    [0.07, note(83), 0.14, "triangle", 0.18],
  ],
  miss: [[0, note(60), 0.16, "triangle", 0.16, note(55)]],
  gameOver: [
    [0, note(67), 0.16, "triangle", 0.18],
    [0.14, note(62), 0.16, "triangle", 0.18],
    [0.28, note(55), 0.4, "triangle", 0.18],
  ],
  clearGoal: [
    [0, note(72), 0.1, "triangle", 0.18],
    [0.1, note(79), 0.1, "triangle", 0.18],
    [0.2, note(84), 0.45, "triangle", 0.2],
  ],
  timeUp: [
    [0, note(84), 0.12, "triangle", 0.16],
    [0.14, note(84), 0.3, "triangle", 0.16],
  ],
  ready: [[0, note(69), 0.09, "sine", 0.18]],
  go: [[0, note(81), 0.18, "sine", 0.2]],
};
// 콤보: 이어질수록 한 음씩 높아진다.
for (let c = 1; c <= 12; c++) SOUNDS[`combo${c}`] = [[0.1, note(71 + c), 0.08, "square", 0.07]];

export const SOUND_NAMES = Object.freeze(Object.keys(SOUNDS));

/**
 * @param {{ getVolume: () => number }} options  0~100, 0이면 소리 없음
 */
export const createSfx = ({ getVolume }) => {
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

  /** @param {string} name */
  const play = (name, mix = 1) => {
    const volume = getVolume();
    const parts = SOUNDS[name];
    if (!parts || volume <= 0) return;
    const ac = ensure();
    if (!ac || !master) return;
    // 사람 귀는 로그 단위로 듣는다 → 슬라이더 값을 제곱해 작은 쪽을 더 세밀하게.
    master.gain.value = Math.pow(volume / 100, 2);
    const t0 = ac.currentTime + 0.005;
    for (const [at, freq, dur, type, gain, to] of parts) {
      const start = t0 + at;
      const env = ac.createGain();
      env.gain.setValueAtTime(0.0001, start);
      env.gain.exponentialRampToValueAtTime(gain * mix, start + 0.005);
      env.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      env.connect(master);
      /** @type {AudioScheduledSourceNode} */
      let src;
      if (type === "noise") {
        const b = ac.createBufferSource();
        b.buffer = noise;
        src = b;
      } else {
        const o = ac.createOscillator();
        o.type = type;
        o.frequency.setValueAtTime(freq, start);
        if (to) o.frequency.exponentialRampToValueAtTime(to, start + dur);
        src = o;
      }
      src.connect(env);
      src.start(start);
      src.stop(start + dur + 0.02);
    }
  };

  return {
    play,
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
