// CPU 대전: 나와 CPU가 같은 블록 순서로 동시에 두고, 줄을 지우면 상대에게 쓰레기 줄을 보낸다.
// 보낸 줄은 먼저 내게 쌓인 쓰레기를 상쇄하고, 남는 만큼 상대의 "받을 쓰레기"가 된다.
// 받을 쓰레기는 줄을 지우지 못하고 고정할 때 아래에서 올라온다(Survival과 같은 방식). 먼저 막히는 쪽이 진다.
// 모드는 한 판의 규칙만 정하고, 두 엔진 사이에 줄을 옮기는 일은 게임 루프(main.js)가 한다.
import { MODERN } from "../rules/presets.js";
import { receiveGarbage } from "./garbage.js";
import { formatTime } from "./format.js";
import { t } from "../i18n/index.js";

/** 줄 삭제 종류별 공격 줄 수: [T-spin 종류][지운 줄 수] */
export const ATTACK = Object.freeze({
  none: Object.freeze([0, 0, 1, 2, 4]),
  mini: Object.freeze([0, 0, 1, 2]),
  full: Object.freeze([0, 2, 4, 6]),
});
/** 콤보(연속으로 줄을 지운 고정 수 − 1)에 따른 추가 공격 */
export const COMBO_ATTACK = Object.freeze([0, 0, 1, 1, 1, 2, 2, 3, 3, 4, 4, 4, 5]);
export const PERFECT_ATTACK = 10;

/** 고정 이벤트 하나가 보내는 줄 수 */
const attackParts = ev => {
  const table = ATTACK[ev.tspin] ?? ATTACK.none;
  const base = table[Math.min(ev.lines, table.length - 1)] ?? 0;
  const combo = ev.combo >= 0 ? COMBO_ATTACK[Math.min(ev.combo, COMBO_ATTACK.length - 1)] : 0;
  const backToBack = ev.b2b ? 1 : 0;
  const perfect = ev.perfect ? PERFECT_ATTACK : 0;
  return { base, combo, backToBack, perfect, total: base + combo + backToBack + perfect };
};

export const attackFor = ev => (ev.lines ? attackParts(ev).total : 0);

/** 초기 쓰레기 상태와 고정 시 공격 처리는 대전과 훈련에서 같다. */
export const setupBattleGarbage = (state, rng, pending = 0) => {
  state.garbage = { pending, received: 0, blocked: 0, sent: 0, outgoing: 0, hole: rng.int(10), rng };
};

export const applyBattleLock = (state, ev, events) => {
  const g = state.garbage;
  if (ev.lines > 0) {
    const { total, ...parts } = attackParts(ev);
    const blocked = Math.min(g.pending, total);
    const sent = total - blocked;
    g.pending -= blocked;
    g.blocked += blocked;
    g.sent += sent;
    g.outgoing += sent;
    events.push({ type: "attack", lines: sent, cleared: ev.lines, tspin: ev.tspin, blocked, ...parts });
  } else receiveGarbage(state, events);
  return false;
};

/**
 * 난이도: pps = CPU가 1초에 놓는 피스 수, mistake = 가장 좋은 자리 대신 차선을 고를 확률(%),
 * hold = 홀드를 쓰는지, holdMinGain = 홀드로 바꿀 때 필요한 최소 배치 점수 차이,
 * tucks = 바닥에서 옆으로 밀어 넣는지, spins = T를 바닥에서 돌려 넣는지(T-spin).
 */
export const LEVELS = Object.freeze([
  Object.freeze({ id: "easy", name: t("쉬움"), pps: 0.7, mistake: 20, hold: false }),
  Object.freeze({ id: "easy-plus", name: t("쉬움+"), pps: 0.95, mistake: 16, hold: true, holdMinGain: 3 }),
  Object.freeze({ id: "normal", name: t("보통"), pps: 1.2, mistake: 12, hold: true, tucks: true }),
  Object.freeze({ id: "normal-plus", name: t("보통+"), pps: 1.6, mistake: 8, hold: true, tucks: true }),
  Object.freeze({ id: "hard", name: t("어려움"), pps: 2, mistake: 3, hold: true, tucks: true, spins: true }),
  Object.freeze({ id: "hard-plus", name: t("어려움+"), pps: 2.6, mistake: 1, hold: true, tucks: true, spins: true }),
  Object.freeze({ id: "master", name: t("최강"), pps: 3.2, mistake: 0, hold: true, tucks: true, spins: true }),
]);

/** 대전에서 상대를 이겼을 때 엔진에 넣는 결과 */
export const WIN = "win";

const cache = new Map();

/** 난이도 → 모드 객체(같은 난이도는 같은 객체). 나와 CPU가 같은 모드 객체를 쓰고 상태만 따로 가진다. */
export const versusMode = level => {
  if (cache.has(level.id)) return cache.get(level.id);
  const mode = Object.freeze({
    id: `versus-${level.id}`,
    name: t("CPU 대전 · {level}", { level: level.name }),
    description: t("CPU와 쓰레기 줄을 주고받기 · 먼저 막히면 패배"),
    rules: MODERN,
    versus: level,
    hud: Object.freeze(["time", "attack", "lines", "pieces", "pps"]),
    setup: setupBattleGarbage,
    onLock: applyBattleLock,
    check: () => null,
    hudLines: state => ({ label: t("받을 쓰레기"), value: String(state.garbage.pending) }),
    hudTime: state => ({ label: t("시간"), frames: state.frame }),
    summary: state => ({
      title: state.over === WIN ? t("승리!") : t("패배"),
      main: formatTime(state.frame),
    }),
    record: Object.freeze({ metric: "frames", order: "asc" }),
    formatRecord: e => formatTime(e.frames),
    isRecordable: () => false,
  });
  cache.set(level.id, mode);
  return mode;
};

export const findVersus = id => {
  const level = LEVELS.find(l => `versus-${l.id}` === id);
  return level ? versusMode(level) : null;
};

/** 한 프레임 뒤: 서로 보낸 줄을 상대의 받을 쓰레기로 옮긴다. */
export const exchangeGarbage = (a, b) => {
  const ga = a.state.garbage;
  const gb = b.state.garbage;
  if (ga.outgoing) {
    gb.pending += ga.outgoing;
    ga.outgoing = 0;
  }
  if (gb.outgoing) {
    ga.pending += gb.outgoing;
    gb.outgoing = 0;
  }
};

/** 양쪽 피스를 처리한 뒤 쓰레기를 교환한다. 같은 프레임에 둘 다 막히면 플레이어가 진다. */
export const settleBattleFrame = (game, cpu, events) => {
  exchangeGarbage(game, cpu);
  if (cpu.state.over && !game.state.over) events.push(...game.finishAs(WIN));
};
