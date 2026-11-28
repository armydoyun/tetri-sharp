import { WIDTH } from "../core/board.js";
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
    description: "주어진 피스로 판을 비우세요. 마지막에 남을 모양까지 생각해 보세요.",
  },
});

const PUZZLE_TITLES = {
  fill: ["작은 빈자리", "마지막 한 칸", "말끔한 마무리", "빈칸 사이로"],
  combo: ["끊기지 않는 박자", "물결을 타고", "겹쳐진 계단", "이어지는 발걸음"],
  hold: ["잠깐의 여유", "엇갈린 순서", "한 박자 쉬고", "보류된 차례"],
  tuck: ["낮은 천장", "처마 끝", "좁은 골목", "그늘진 틈"],
  quad: ["깊은 골짜기", "높은 벽 사이", "끝까지 열린 길", "긴 그림자"],
  spin: ["모서리의 틈", "비껴 선 지붕", "숨은 이음새", "낯선 모서리"],
  trap: ["갈림길", "멀리 보는 한 수", "엇갈린 빈칸", "막다른 길"],
};

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

/** 지붕과 우물을 포함한 시작판의 분포로 유형별 이름을 고른다. */
export const dailyPuzzleTitle = (family, key, cells) => {
  const choices = PUZZLE_TITLES[family];
  const terrain = cells.reduce((sum, value, i) => sum + value * (1 + (i % WIDTH) + Math.floor(i / WIDTH)), 0);
  return t(choices[(dailyPuzzleSeed(key) + terrain) % choices.length]);
};

/** 오늘의 판은 시작할 때 퍼즐 코드도 저장하므로 생성 규칙이 갱신돼도 그대로 이어서 할 수 있다. */
export const dailyPuzzleMode = (code, dailyPuzzle) => {
  if (!isDailyPuzzleDate(dailyPuzzle?.key) || !Object.hasOwn(DAILY_PUZZLE_FAMILIES, dailyPuzzle.family)) return null;
  const puzzle = decodePuzzle(code);
  if (!puzzle || puzzle.title !== dailyPuzzle.key) return null;
  const custom = customPuzzleMode(puzzle);
  const info = dailyPuzzleInfo(dailyPuzzle.family, puzzle.goal.kind);
  const name = t("{kind} · {date}", {
    kind: dailyPuzzleTitle(dailyPuzzle.family, dailyPuzzle.key, puzzle.cells),
    date: dailyPuzzle.key,
  });
  return {
    ...custom,
    name,
    fixedSeed: dailyPuzzleSeed(dailyPuzzle.key),
    description: info.description,
    puzzleCode: code,
    dailyPuzzle: { key: dailyPuzzle.key, family: dailyPuzzle.family },
  };
};
