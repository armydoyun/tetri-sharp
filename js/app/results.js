import { t } from "../i18n/index.js";
import { ACTIONS, keyLabel } from "../input/keymap.js";
import { formatScore, formatTime } from "../modes/format.js";
import { SURVIVAL_MILESTONES } from "../modes/index.js";
import { PUZZLES } from "../modes/puzzles.js";
import { RANK_STEPS, rankOf } from "../modes/ranks.js";
import { formatDelta, splitDelta } from "../modes/splits.js";

export const formatSurvivalGoal = frames => formatTime(frames).split(".")[0];

/** @param {number | null} delta */
export const formatSplitComparison = delta =>
  delta === null ? formatDelta(delta) : t("{delta}초", { delta: formatDelta(delta) });

/** 달리기 결과 한 줄: 시간 기록 모드는 시간 차, 점수 모드는 점수 차 */
const raceResultText = (mode, state, best, friend = "") => {
  if (friend) {
    if (state.over !== mode.race.finish)
      return t("끝까지 가지 못했어요 · {name} 기록 {record}", { name: friend, record: mode.formatRecord(best) });
    const d = state.frame - best.frames;
    return d === 0
      ? t("{name}와(과) 같은 시간이에요.", { name: friend })
      : t(d < 0 ? "{name}보다 {n}초 빨라요." : "{name}보다 {n}초 느려요.", {
          name: friend,
          n: (Math.abs(d) / 60).toFixed(2),
        });
  }
  if (state.over !== mode.race.finish)
    return t("끝까지 가지 못했어요 · 상대 기록 {record}", { record: mode.formatRecord(best) });
  if (mode.record.metric === "score") {
    const diff = state.score - (best.score ?? 0);
    return diff === 0
      ? t("내 최고 기록과 같은 점수예요.")
      : t(diff > 0 ? "이전 최고 기록보다 {n}점 높아요." : "이전 최고 기록보다 {n}점 낮아요.", {
          n: formatScore(Math.abs(diff)),
        });
  }
  const delta = state.frame - best.frames;
  return delta === 0
    ? t("내 최고 기록과 같은 시간이에요.")
    : t(delta < 0 ? "이전 최고 기록보다 {n}초 빨라요." : "이전 최고 기록보다 {n}초 느려요.", {
        n: (Math.abs(delta) / 60).toFixed(2),
      });
};

const survivalResultText = (frame, previousBest) => {
  const reached = SURVIVAL_MILESTONES.findLast(goal => goal <= frame);
  const goal = reached
    ? t("{time} 구간 달성", { time: formatSurvivalGoal(reached) })
    : t("첫 목표 {time} 미달성", { time: formatSurvivalGoal(SURVIVAL_MILESTONES[0]) });
  if (!previousBest) return goal;

  const delta = frame - previousBest.frames;
  const comparison =
    delta === 0
      ? t("이전 최고와 같은 시간")
      : t(delta > 0 ? "이전 최고보다 {n}초 더 버팀" : "이전 최고보다 {n}초 덜 버팀", {
          n: (Math.abs(delta) / 60).toFixed(2),
        });
  return `${goal} · ${comparison}`;
};

export const resultNoteFor = (mode, state, previousBest, target) =>
  mode.battleLesson
    ? t("공격 {attack}줄 · 상쇄 {blocked}줄 · 상대에게 {sent}줄", {
        attack: state.garbage.blocked + state.garbage.sent,
        blocked: state.garbage.blocked,
        sent: state.garbage.sent,
      })
    : mode.id === "survival"
      ? survivalResultText(state.frame, previousBest)
      : target
        ? raceResultText(mode, state, target.best, target.friend)
        : "";

export const resultRows = ({
  mode,
  rules,
  state,
  best,
  outcome,
  tooShort,
  opponent,
  splits,
  resultPbSplits,
  puzzleClears,
  keymap,
  finesseInputs,
}) => {
  const seconds = state.frame / 60;
  const pps = tooShort ? "—" : seconds ? (state.stats.pieces / seconds).toFixed(2) : "0.00";
  if (opponent) {
    const g = state.garbage;
    const cg = opponent.state.garbage;
    const vrows = [
      [t("시간"), formatTime(state.frame)],
      [t("줄"), String(state.stats.lines)],
      [t("피스"), String(state.stats.pieces)],
      [t("초당 피스"), pps],
      [t("보낸 줄"), String(g.sent)],
      [t("막은 쓰레기"), String(g.blocked)],
      [t("받은 쓰레기"), String(g.received)],
      [t("CPU가 보낸 줄"), String(cg.sent)],
    ];
    const record = opponent.record;
    vrows.push([t("전적"), record ? t("{win}승 {loss}패", { win: record.win, loss: record.loss }) : "—"]);
    return vrows;
  }
  const rows = [
    [t("시간"), formatTime(state.frame)],
    [t("점수"), formatScore(state.score)],
    [t("레벨"), String(state.level)],
    [t("줄"), String(state.stats.lines)],
    [t("피스"), String(state.stats.pieces)],
    [t("초당 피스"), pps],
    [t("최고 기록"), best ? mode.formatRecord(best) : "—"],
  ];
  // 순위 줄은 늘 둔다(없으면 —) → 결과 화면 높이가 판마다 같다.
  rows.push([t("순위"), outcome && outcome.rank < 10 ? t("{n}위", { n: outcome.rank + 1 }) : "—"]);
  // 랭크가 있는 모드: 기록으로 남는 판이면 이 판의 랭크(다음 랭크 기준은 기록 화면에서)
  if (RANK_STEPS[mode.id]) {
    const run = { frames: state.frame, score: state.score, lines: state.stats.lines, level: state.level };
    rows.push([t("랭크"), (mode.isRecordable(state) && rankOf(mode, run, rules)) || "—"]);
  }
  if (mode.splits) {
    const delta = splitDelta(splits, resultPbSplits);
    if (delta !== null) rows.push([t("최고 기록 대비"), formatSplitComparison(delta)]);
    if (state.over === "clear") rows.splice(0, 1);
  }
  if (mode.battleLesson) {
    rows.splice(0, rows.length, [t("받은 쓰레기"), String(state.garbage.received)]);
  }
  // 퍼즐: 점수·레벨·최고 기록·순위는 뜻이 없다 → 쓴 피스, 지운 줄, 깬 단계(4차 평가 F37)
  if (mode.puzzle) {
    rows.splice(
      0,
      rows.length,
      [t("시간"), formatTime(state.frame)],
      [t("쓴 피스"), `${state.stats.pieces} / ${mode.puzzle.pieces.length}`],
      [t("줄"), String(state.stats.lines)],
      [t("깬 단계"), mode.puzzle.number ? `${puzzleClears} / ${PUZZLES.length}` : "—"]
    );
  }
  if (mode.lesson) {
    const path = mode.lesson.path;
    const steps = [...path, { action: "HARD" }].map(({ action, hold }) => {
      const code = keymap[action]?.[0];
      const label = code ? keyLabel(code) : (ACTIONS.find(item => item.id === action)?.label ?? action);
      return hold ? t("{key} 길게", { key: label }) : label;
    });
    const comparison = t("내 입력 {actual}회 · 최소 {minimum}회", {
      actual: finesseInputs,
      minimum: path.length,
    });
    rows.splice(
      0,
      rows.length,
      [t("이동·회전"), state.over === "clear" ? comparison : t("내 입력 {n}회", { n: finesseInputs })],
      [t("추천 입력"), steps.join(", ")]
    );
  }
  return rows;
};
