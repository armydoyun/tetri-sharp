import { t } from "../i18n/index.js";
import { dailySeed } from "./daily.js";
import { customPuzzleMode, decodePuzzle } from "./custom-puzzle.js";

export const DAILY_PUZZLE_FAMILIES = Object.freeze({
  fill: { title: "짧은 판 비우기", description: "주어진 피스로 판을 비워 보세요." },
  combo: { title: "콤보 설계", description: "피스마다 한 줄 이상을 지워 콤보를 끝까지 이어 보세요." },
  hold: { title: "홀드 순서", description: "홀드를 사용해 주어진 피스로 판을 비워 보세요." },
  tuck: { title: "처마 아래 끼워 넣기", description: "처마 아래 빈칸까지 피스를 보내 두 줄을 지우세요." },
  quad: { title: "4줄 우물 만들기", description: "앞 피스로 빈칸을 채운 뒤, 한 번에 네 줄을 지우세요." },
  spin: { title: "T스핀 자리 만들기", description: "첫 피스로 자리를 만든 뒤 T-spin Double을 하세요." },
  trap: {
    title: "첫 배치 함정",

    description: "네 피스로 판을 비우세요. 마지막에 남을 모양까지 생각해 보세요.",
  },
});

export const dailyPuzzleLevel = index => [t("입문"), t("보통"), t("어려움")][index - 1];

export const dailyPuzzleInfo = (family, goal) => {
  const info = DAILY_PUZZLE_FAMILIES[family];
  return {
    title: t(info.title),
    description: goal === "tst" ? t("첫 피스로 자리를 만든 뒤 T-spin Triple을 하세요.") : t(info.description),
  };
};

export const isDailyPuzzleDate = key =>
  typeof key === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(key) &&
  Number.isFinite(Date.parse(key)) &&
  new Date(key).toISOString().slice(0, 10) === key;

export const dailyPuzzleSeed = key => dailySeed(`puzzle-v1:${key}`);

/** 오늘의 판은 시작할 때 퍼즐 코드도 저장하므로 생성 규칙이 갱신돼도 그대로 이어서 할 수 있다. */
export const dailyPuzzleMode = (code, dailyPuzzle) => {
  if (!isDailyPuzzleDate(dailyPuzzle?.key) || !Object.hasOwn(DAILY_PUZZLE_FAMILIES, dailyPuzzle.family)) return null;
  const puzzle = decodePuzzle(code);
  if (!puzzle || puzzle.title !== dailyPuzzle.key) return null;
  const custom = customPuzzleMode(puzzle);
  const info = dailyPuzzleInfo(dailyPuzzle.family, puzzle.goal.kind);
  const name = t("{kind} · {date}", { kind: info.title, date: dailyPuzzle.key });
  return {
    ...custom,
    name,
    fixedSeed: dailyPuzzleSeed(dailyPuzzle.key),
    description: info.description,
    summary: state => ({ ...custom.summary(state), main: t("오늘의 퍼즐") }),
    puzzleCode: code,
    dailyPuzzle: { key: dailyPuzzle.key, family: dailyPuzzle.family },
  };
};
