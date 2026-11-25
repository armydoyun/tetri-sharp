// 모드별 실력 랭크: 그 모드의 최고 기록 하나로 정한다(저장하지 않고 기록에서 바로 계산).
// 기록이 바뀌면 랭크도 따라가고, 백업·이전 버전과 따로 맞출 것이 없다.
// 끝까지 간 기록이면 적어도 D. 기준은 C → B → A → S → S+ 순서로 어렵다.
import { t } from "../i18n/index.js";

export const RANK_ORDER = Object.freeze(["D", "C", "B", "A", "S", "S+"]);

const sec = n => n * 60;

/**
 * 모드 id → { metric, better, steps: [C, B, A, S, S+] }
 * better "lower": 값이 작을수록 좋다(시간), "higher": 클수록 좋다(점수·줄·레벨·버틴 시간)
 * @type {Readonly<Record<string, { metric: "frames" | "score" | "lines" | "level", better: "lower" | "higher", steps: readonly number[] }>>}
 */
export const RANK_STEPS = Object.freeze({
  sprint40: { metric: "frames", better: "lower", steps: [sec(180), sec(120), sec(80), sec(50), sec(35)] },
  marathon: { metric: "score", better: "higher", steps: [30000, 80000, 150000, 250000, 350000] },
  ultra: { metric: "score", better: "higher", steps: [10000, 20000, 35000, 55000, 80000] },
  master: { metric: "level", better: "higher", steps: [200, 400, 600, 900, 999] },
  dig: { metric: "frames", better: "lower", steps: [sec(120), sec(60), sec(40), sec(25), sec(18)] },
  survival: { metric: "frames", better: "higher", steps: [sec(60), sec(120), sec(180), sec(300), sec(480)] },
  endless: { metric: "lines", better: "higher", steps: [50, 100, 150, 200, 250] },
});

/**
 * 기록 하나의 랭크. 랭크가 없는 모드(연습·퍼즐·대전·이전 규칙 등)나 기록이 없으면 null.
 * @param {{ id: string }} mode
 * @param {any} entry  기록표 항목(frames·score·lines·level)
 * @returns {string | null}
 */
/** 랭크·업적을 주는 규칙: 기본 규칙(Modern·Retro·Arcade)만. Custom은 지연을 0으로 두는 등 쉽게 만들 수 있다(2차 평가 F22) */
const RANKED_RULES = Object.freeze(new Set(["modern", "retro", "arcade"]));
export const isRankedRules = rules => RANKED_RULES.has(rules?.id);

/**
 * @param {any} mode
 * @param {any} entry
 * @param {any} [rules] 주면 기본 규칙일 때만 랭크를 준다
 */
export const rankOf = (mode, entry, rules) => {
  const table = RANK_STEPS[mode?.id];
  if (!table || !entry) return null;
  if (rules !== undefined && !isRankedRules(rules)) return null;
  const value = Number(entry[table.metric]);
  if (!Number.isFinite(value)) return null;
  const reached = table.steps.filter(step => (table.better === "lower" ? value <= step : value >= step)).length;
  return RANK_ORDER[reached];
};

/** 다음 랭크까지의 기준(이미 S+면 null) — 결과·기록 화면의 "다음 랭크" 안내용 */
export const nextRankStep = (mode, entry) => {
  const table = RANK_STEPS[mode?.id];
  const rank = rankOf(mode, entry);
  if (!table || !rank) return null;
  const i = RANK_ORDER.indexOf(rank);
  return i >= table.steps.length ? null : { rank: RANK_ORDER[i + 1], value: table.steps[i] };
};

/** "랭크 A" */
export const rankLabel = rank => t("랭크 {rank}", { rank });
