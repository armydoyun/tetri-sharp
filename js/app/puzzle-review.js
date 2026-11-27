import { WIDTH } from "../core/board.js";
import { createGame } from "../core/engine.js";
import { t } from "../i18n/index.js";
import { createUndo } from "../modes/undo.js";
import { toEngineHandling } from "../storage/settings.js";
import { replayRunJournal } from "../storage/suspended-run.js";

export const createPuzzleReview = () => {
  let checkpoint = null;
  let lastMove = null;
  return {
    reset() {
      checkpoint = lastMove = null;
    },
    track(state, steps) {
      if (checkpoint?.placed === state.puzzle.placed || !state.active) return;
      checkpoint = { placed: state.puzzle.placed, steps, cells: state.board.cells.slice() };
    },
    finish(state, events) {
      const event = events.find(item => item.type === "lock");
      if (event && checkpoint) lastMove = { ...checkpoint, event, after: state.board.cells.slice() };
    },
    failed(state, entry) {
      if (!lastMove || !entry || !state.over || state.over === "clear") return null;
      return { ...lastMove, entry, reason: state.over, lines: state.puzzle.lines };
    },
  };
};

export const reviewReason = (puzzle, review) => {
  const { event, after } = review;
  if (review.reason === "blockOut" || review.reason === "lockOut") return t("피스를 놓을 공간이 부족했어요.");
  if (puzzle.kind === "pc") {
    let rows = 0;
    for (let i = 0; i < after.length; i += WIDTH) {
      if (after.subarray(i, i + WIDTH).some(Boolean)) rows++;
    }
    return t("블록이 남은 줄 {n}개", { n: rows });
  }
  if (puzzle.kind === "combo" && !event.lines) return t("이 수에서 줄을 지우지 못해 콤보가 끊겼어요.");
  if (puzzle.kind === "lines")
    return t("{n}줄 목표 중 {total}줄을 지웠어요.", { n: puzzle.lines, total: review.lines });
  const cleared = t("{n}줄 삭제", { n: event.lines });
  if (!["mini", "tsd", "tst"].includes(puzzle.kind)) return cleared;
  const spin = event.tspin === "full" ? t("T스핀 판정") : event.tspin === "mini" ? "T-spin Mini" : t("T스핀 판정 없음");
  return [cleared, spin].join(" · ");
};

/** 기록한 입력을 같은 시드로 다시 진행해 대기열·홀드·고정 타이머도 함께 되살린다. */
export const reconstructPuzzleReview = async (review, mode, rules) => {
  const { steps } = review;
  const entry = {
    ...review.entry,
    steps,
    inputs: review.entry.inputs.filter(([step]) => step < steps),
    actions: review.entry.actions.filter(([step]) => step <= steps),
  };
  const game = createGame({ mode, rules, seed: entry.seed, handling: toEngineHandling(entry.handling) });
  const undo = createUndo();
  await replayRunJournal(entry, {
    applyInput(held, pressed) {
      if (mode.trialCode) undo.track(game.state);
      game.step({ held, pressed });
      if (game.state.over) throw new Error("puzzle review");
    },
    applyAction(kind, value) {
      if (kind === "handling") game.setHandling(toEngineHandling(value));
      if (kind === "undo" && !undo.undo(game.state)) throw new Error("puzzle review undo");
    },
  });
  return { game, entry };
};
