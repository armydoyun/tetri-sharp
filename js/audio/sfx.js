// 효과음: 파일 없이 Web Audio로 그때그때 합성한다(한 파일 배포본 용량을 늘리지 않는다).
// 소리 정의(테마마다 한 묶음)는 js/audio/sound-sets.js.
// 엔진 이벤트를 받아 소리를 고른다. 같은 프레임에 같은 소리가 여러 번 나지 않게 한 번만 낸다.
// 소리를 고르는 부분(soundsFor)은 DOM·오디오 없이 돌아서 Node 테스트로 확인한다.
import { SOUND_SETS } from "./sound-sets.js";

export { SOUND_NAMES, SOUND_SETS } from "./sound-sets.js";
/** @typedef {import("./sound-kit.js").Part} Part */

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

/**
 * @param {{ getVolume: () => number, getSet?: () => string, sets?: Record<string, Record<string, Part[]>> }} options
 * getVolume: 0~100, 0이면 소리 없음. getSet: 지금 쓸 묶음 id
 */
export const createSfx = ({ getVolume, getSet = () => "modern", sets = SOUND_SETS }) => {
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
      noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.2), ctx.sampleRate);
      const data = noise.getChannelData(0);
      // 소리 고르기와 상관없는 잡음이라 Math.random을 써도 결정론에 영향이 없다.
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (!master) {
      master = ctx.createGain();
      master.connect(ctx.destination);
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
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, p.gain * mix), start + (p.attack ?? 0.005));
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
    const set = sets[options.set ?? getSet()] ?? SOUND_SETS.modern;
    const parts = set[name];
    if (!parts || volume <= 0) return false;
    const ac = ensure();
    if (!ac || !master) return false;
    // 사람 귀는 로그 단위로 듣는다 → 슬라이더 값을 제곱해 작은 쪽을 더 세밀하게.
    master.gain.value = Math.pow(volume / 100, 2);
    const t0 = ac.currentTime + 0.005 + (options.delay ?? 0);
    for (const p of parts) voice(ac, master, p, t0, mix);
    return true;
  };

  return {
    play,
    setVolume() {
      if (master) master.gain.value = Math.pow(getVolume() / 100, 2);
    },
    stop() {
      master?.disconnect();
      master = null;
    },
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
