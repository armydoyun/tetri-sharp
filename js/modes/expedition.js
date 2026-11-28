import { HEIGHT, WIDTH, set } from "../core/board.js";
import { GARBAGE } from "../core/pieces.js";
import { MODERN } from "../rules/presets.js";
import { t } from "../i18n/index.js";
import { raiseGarbage } from "./garbage.js";

const NO_HOLD = Object.freeze({ ...MODERN, name: t("홀드 금지"), hold: Object.freeze({ enabled: false }) });
const SRS = Object.freeze({ ...NO_HOLD, name: "SRS" });
const ARS = Object.freeze({ ...NO_HOLD, name: "ARS", rotation: /** @type {const} */ ("ars") });

export const EXPEDITION_CHAPTERS = Object.freeze([t("홀드 없이 쌓기"), t("회전이 다른 판"), t("빨라지는 바닥")]);

/** @param {number} index @param {{ name: string, description: string, bonus: string, earnsBonus: (state: any) => boolean, [key: string]: any }} stage */
const expeditionMode = (index, stage) =>
  Object.freeze({
    rules: MODERN,
    fixedSeed: 32471 + index,
    hud: ["time", "lines", "pieces"],
    gravityFor: () => 1 / 60,
    isRecordable: () => false,
    noReplay: true,
    formatRecord: () => "",
    ...stage,
    id: `expedition-${index + 1}`,
    expedition: index,
    hudTime: state => ({ label: t("시간"), frames: state.frame }),
    summary: state => {
      const progress = stage.hudLines(state);
      return {
        title: state.over !== "clear" ? t("실패") : stage.earnsBonus(state) ? t("추가 목표까지 달성!") : t("성공!"),
        main: `${progress.label} · ${progress.value}`,
      };
    },
  });

const stackingStages = [
  { lines: 4, name: t("홀드가 있는 판"), seed: 32472 },
  { lines: 4, name: t("같은 순서, 홀드 없이"), seed: 32472 },
  { lines: 8, name: t("우물을 남겨라"), seed: 32473 },
  { lines: 12, name: t("우물을 다시 열어라"), seed: 32476 },
];
const lineStages = stackingStages.map(({ lines, name, seed }, index) =>
  expeditionMode(index, {
    name,
    rules: index === 0 ? MODERN : NO_HOLD,
    fixedSeed: seed,
    description: t("{n}줄을 지우세요.", { n: lines }),
    bonus: index === 0 ? t("홀드를 한 번도 쓰지 않기") : t("4줄 지우기 {n}회", { n: index === 3 ? 2 : 1 }),
    earnsBonus: state =>
      index === 0 ? state.tally.holds === 0 : (state.tally.clears["none-4"] ?? 0) >= (index === 3 ? 2 : 1),
    hudLines: state => ({ label: t("지운 줄"), value: `${Math.min(state.stats.lines, lines)} / ${lines}` }),
    check: state => (state.stats.lines >= lines ? { result: "clear" } : null),
  })
);

/** @param {number[][]} holes 한 줄씩, 위에서 아래로 */
const fillBottom = (board, holes) => {
  for (const [row, gap] of holes.entries()) {
    for (let x = 0; x < WIDTH; x++) {
      if (!gap.includes(x)) set(board, x, HEIGHT - holes.length + row, GARBAGE);
    }
  }
};

const rotationStages = [SRS, ARS, SRS, ARS].map((rules, index) => {
  const well = index < 2;
  const holes = well ? [[9], [9], [9], [9]] : [[3, 4, 5], [4]];
  const lines = holes.length;
  return expeditionMode(index + 4, {
    name: well ? t("{rule} · 벽 옆 우물", { rule: rules.name }) : t("{rule} · T자 홈", { rule: rules.name }),
    rules,
    sequence: well ? ["I", "I", "I"] : ["T", "T", "T"],
    gravityFor: () => 0,
    description: well
      ? index === 0
        ? t("I를 세로로 돌려 오른쪽 끝에 넣으세요.")
        : t("ARS의 I는 벽 킥이 없어요. 먼저 I를 세로로 돌리고 오른쪽 끝으로 옮기세요.")
      : index === 2
        ? t("T의 뾰족한 쪽이 아래로 향하게 돌려 2줄을 지우세요.")
        : t("ARS에서 T는 뾰족한 쪽이 아래를 향한 채 나와요. 그대로 홈에 넣으세요."),
    bonus: t("첫 피스로 끝내기"),
    earnsBonus: state => state.stats.pieces === 1,
    setup: state => fillBottom(state.board, holes),
    hudLines: state => ({ label: t("지운 줄"), value: `${Math.min(state.stats.lines, lines)} / ${lines}` }),
    check: state => {
      if (state.stats.lines >= lines) return { result: "clear" };
      return state.stats.pieces >= 3 ? { result: "fail" } : null;
    },
  });
});

const wavesByStage = [
  {
    name: t("첫 파도"),
    waves: [
      [4, 8],
      [2, 3],
    ],
    seconds: 25,
  },
  {
    name: t("구멍을 따라"),
    waves: [
      [2, 1],
      [4, 7],
      [2, 2],
    ],
    seconds: 22,
  },
  {
    name: t("좁아지는 여유"),
    waves: [
      [4, 8],
      [4, 2],
      [2, 7],
    ],
    seconds: 25,
  },
  {
    name: t("마지막 파도"),
    waves: [
      [4, 0],
      [2, 7],
      [2, 2],
      [4, 9],
    ],
    seconds: 23,
  },
];

const countGarbage = board => {
  let rows = 0;
  for (let i = 0; i < board.cells.length; i += WIDTH) {
    if (board.cells.subarray(i, i + WIDTH).includes(GARBAGE)) rows++;
  }
  return rows;
};

const garbageStages = wavesByStage.map(({ name, waves, seconds }, index) => {
  const remainingWaves = waves.map((_, index) => waves.slice(index + 1).reduce((n, [height]) => n + height, 0));
  const total = waves[0][0] + remainingWaves[0];
  const addWave = (state, wave) => {
    const [height, hole] = waves[wave];
    raiseGarbage(state.board, height, () => hole);
    if (height === 2) {
      for (let y = HEIGHT - 2; y < HEIGHT; y++) set(state.board, hole + 1, y, 0);
    }
    state.expedition = { wave, remaining: height };
    return height;
  };
  return expeditionMode(index + 8, {
    name,
    rules: index === wavesByStage.length - 1 ? ARS : NO_HOLD,
    sequence: waves.map(([height]) => (height === 2 ? "O" : "I")),
    description: [
      t("쓰레기 {n}줄을 파내세요. 한 파도를 지우면 다음 줄이 올라오고 낙하가 빨라져요.", { n: total }),
      index === wavesByStage.length - 1 ? t("ARS 회전으로 진행해요.") : "",
    ]
      .filter(Boolean)
      .join(" "),
    bonus: t("{n}초 안에 끝내기", { n: seconds }),
    earnsBonus: state => state.frame <= seconds * 60,
    setup: state => {
      addWave(state, 0);
    },
    gravityFor: state => ((index + 1) * 2 ** state.expedition.wave) / 60,
    onLock: (state, _lock, events) => {
      const progress = state.expedition;
      progress.remaining = countGarbage(state.board);
      if (!progress.remaining && progress.wave + 1 < waves.length) {
        const rows = addWave(state, progress.wave + 1);
        events.push({ type: "garbage", rows });
      }
    },
    hudLines: state => ({
      label: t("남은 쓰레기 줄"),
      value: String(state.expedition.remaining + remainingWaves[state.expedition.wave]),
    }),
    check: state => (state.expedition.remaining === 0 ? { result: "clear" } : null),
  });
});

export const EXPEDITION_STAGES = Object.freeze([...lineStages, ...rotationStages, ...garbageStages]);
