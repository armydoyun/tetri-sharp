import { t } from "../i18n/index.js";
import { searchOptions } from "../modes/custom-puzzle.js";
import { describeSteps } from "../modes/puzzle-hint.js";

export const hasLessonHints = m => Boolean(m.downstack || m.buildLesson);
/** 힌트 단추를 보이는 판: 파내기·빌드 연습, 퍼즐(첫 수 보기) */
export const hasHintControls = m => hasLessonHints(m) || Boolean(m.puzzle);
export const lessonHintState = state => state.downstack ?? state.buildLesson;

/**
 * @param {{
 *   hintButton: HTMLButtonElement,
 *   retryButton: HTMLElement,
 *   status: HTMLElement,
 *   solver: ReturnType<typeof import("./solver.js").createSolver>,
 *   getGame: () => any,
 *   getMode: () => any,
 *   getRules: () => import("../rules/presets.js").RuleSet,
 *   isPlaying: () => boolean,
 *   onHint: () => void,
 *   onRetry: () => void,
 * }} options
 */
export const createGameHints = ({
  hintButton,
  retryButton,
  status,
  solver,
  getGame,
  getMode,
  getRules,
  isPlaying,
  onHint,
  onRetry,
}) => {
  /** @type {ReturnType<typeof solver.run> | null} */
  let puzzleHintSearch = null;
  // 이름만 바꾼다(단추 안의 단축키 표시는 그대로)
  const hintLabel = /** @type {HTMLElement} */ (hintButton.querySelector(".btn-label"));
  const reset = () => {
    const mode = getMode();
    const game = getGame();
    puzzleHintSearch?.cancel();
    puzzleHintSearch = null;
    // "규칙대로" 떨어지는 만든 퍼즐은 손 빠르기에 따라 달라 첫 수를 찾을 수 없다(자리는 남기고 끈다)
    hintButton.disabled = mode.puzzle?.gravity === "rules";
    hintLabel.textContent = mode.puzzle ? t("첫 수 보기") : t("힌트");
    status.textContent = "";
    if (game?.state.puzzle) game.state.puzzle.hintCells = [];
  };

  /**
   * 퍼즐 첫 수 보기: 지금 피스를 놓을 자리(점선 칸)와 누를 순서. 한 번 더 누르면 숨긴다.
   * 지금 판에서 더 풀 수 없으면(이미 다른 자리에 놓았으면) 다시 하라고 알려 준다.
   */
  const togglePuzzleHint = (game, mode) => {
    const { puzzle: p, active, hold, holdUsed, board, combo } = game.state;
    if (p.hintCells?.length || puzzleHintSearch) return reset();
    // 아직 나오지 않은 목록 피스: 지금까지 목록에서 나온 피스 = 놓은 것 + 움직이는 것 + 홀드 칸 - 처음 홀드 피스
    const drawn = p.placed + 1 + (hold ? 1 : 0) - (mode.puzzle.holdStart ? 1 : 0);
    const rest = mode.puzzle.pieces.slice(drawn);
    const placed = p.placed;
    const activeAtRequest = { type: active.type, x: active.x, y: active.y, rot: active.rot };
    const search = solver.run({
      type: "first",
      kind: mode.puzzle.kind,
      count: p.need,
      lines: mode.puzzle.lines ?? 0,
      rotation: getRules().rotation,
      board: board.cells.slice(),
      active: activeAtRequest,
      combo: combo ?? -1,
      total: p.lines ?? 0,
      hold,
      holdUsed,
      rest,
      opts: mode.puzzle.custom ? searchOptions(mode.puzzle.custom) : {},
    });
    puzzleHintSearch = search;
    status.textContent = t("첫 수를 찾는 중…");
    hintLabel.textContent = t("찾기 멈추기");
    search.promise.then(move => {
      if (puzzleHintSearch !== search) return;
      puzzleHintSearch = null;
      const now = game.state.active;
      // 찾는 사이에 피스를 움직였거나 놓았으면 그 판의 답이 아니다
      const same =
        game === getGame() &&
        game.state.puzzle?.placed === placed &&
        now?.x === activeAtRequest.x &&
        now?.y === activeAtRequest.y &&
        now?.rot === activeAtRequest.rot &&
        now?.type === activeAtRequest.type &&
        game.state.hold === hold;
      if (move === undefined || !same) return reset();
      hintLabel.textContent = t("첫 수 보기");
      if (!move) {
        status.textContent = t("이 판에서는 더 풀 수 없어요. 다시 시작해 보세요");
        return;
      }
      if ("exhausted" in move) {
        status.textContent = t("피스가 많아 첫 수를 다 찾아보지 못했어요");
        return;
      }
      if (!("cells" in move)) return;
      game.state.puzzle.hintCells = move.cells;
      game.state.puzzle.hinted = true;
      const spinLast = ["mini", "tsd", "tst"].includes(mode.puzzle.kind);
      const steps = describeSteps(move.steps, spinLast);
      status.textContent = move.hold ? t("첫 수 · 홀드한 뒤 {steps}", { steps }) : t("첫 수 · {steps}", { steps });
      hintLabel.textContent = t("힌트 숨기기");
    });
  };
  for (const control of [hintButton, retryButton]) {
    // 버튼에 키보드 포커스가 있으면 Space는 버튼을 실행한다.
    control.addEventListener("keydown", event => {
      if (event.code === "Space") event.stopPropagation();
    });
  }
  const applyLesson = () => {
    const state = getGame().state;
    status.textContent = getMode().hint(state);
    hintLabel.textContent = t(["힌트", "자리 힌트", "힌트 숨기기"][lessonHintState(state).hintLevel]);
  };
  hintButton.addEventListener("click", event => {
    const mode = getMode();
    const game = getGame();
    if (!hasHintControls(mode) || !isPlaying() || !game?.state.active) return;
    if (mode.puzzle) togglePuzzleHint(game, mode);
    else applyLesson();
    onHint();
    if (event.detail > 0) hintButton.blur();
  });
  retryButton.addEventListener("click", () => {
    if (hasHintControls(getMode()) && isPlaying()) onRetry();
  });

  return {
    reset,
    applyLesson,
    press() {
      if (isPlaying() && hasHintControls(getMode())) hintButton.click();
    },
  };
};
