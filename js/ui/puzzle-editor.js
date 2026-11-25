// 퍼즐 만들기 편집기: [시작 틀 · 도구 · 높이] [판] [판 도구 줄] [피스 순서] → 시험 플레이 · 링크 복사.
// 판은 누르거나 끌어서 칠한다(마우스·터치·펜 모두 Pointer Events). 편집 동작 자체는 js/modes/puzzle-edit.js(DOM 없음).
// 계획: docs/PUZZLE_MAKER.md
import { WIDTH, VISIBLE_ROWS } from "../core/board.js";
import { PIECE_TYPES } from "../core/pieces.js";
import { t } from "../i18n/index.js";
import {
  CHECKED_AUTO,
  CHECKED_TRIED,
  DEFAULT_RULES,
  MAX_DESC,
  MAX_GOAL_LINES,
  MAX_PUZZLE_PIECES,
  MAX_TITLE,
  PUZZLE_CELLS,
  baseRules,
  canSearch,
  decodePuzzle,
  encodePuzzle,
  goalLabel,
  normalizePuzzle,
  puzzleLink,
  ruleSummary,
  solutionTask,
} from "../modes/custom-puzzle.js";
import { GOAL_KINDS } from "../modes/puzzle-goals.js";
import { LOCK_TYPES } from "../rules/sanitize.js";
import { MAX_MADE } from "../storage/custom-puzzles.js";
import {
  COPYABLE_STAGES,
  EDIT_HEIGHTS,
  applyTool,
  createHistory,
  fitHeight,
  insertPiece,
  insertPieces,
  mirrorCells,
  mirrorPieces,
  movePiece,
  puzzleWarnings,
  removePiece,
  shiftCells,
  strokeValue,
  template,
  usedHeight,
} from "../modes/puzzle-edit.js";
import { el, fieldRow, fillDialog, focusKey, restoreFocus } from "./dom.js";
import { copyText, revealForCopy } from "./clipboard.js";
import {
  button,
  confirmButton,
  dropdown,
  iconButton,
  segmented,
  setSegmented,
  textInput,
  toggle,
} from "./components.js";

/** 저절로 확인하는 퍼즐의 피스 수 한도(이보다 많으면 확인 버튼으로만) */
const AUTO_CHECK_PIECES = 12;

/** @typedef {"cell" | "row" | "garbage"} Tool */
/**
 * 판·피스 말고 퍼즐에 담기는 것: 목표·중력·바탕 규칙·규칙 내용·처음 홀드 피스·제목·설명
 * @typedef {{ goal: { kind: string, lines: number }, gravity: "none" | "20g" | "rules", base: "modern" | "retro" | "arcade", rules: import("../modes/custom-puzzle.js").RuleBody, holdStart: string, title: string, desc: string }} Settings
 * @typedef {{ cells: Uint8Array, pieces: string, settings: Settings }} Snapshot
 */

/** @returns {Settings} */
const defaultSettings = () => ({
  goal: { kind: "pc", lines: 0 },
  gravity: "none",
  base: "modern",
  rules: structuredClone(DEFAULT_RULES),
  holdStart: "",
  title: "",
  desc: "",
});

/** 퍼즐 → 설정 부분 @param {import("../modes/custom-puzzle.js").FullPuzzle} p @returns {Settings} */
const settingsOf = p => ({
  goal: { ...p.goal },
  gravity: p.gravity,
  base: /** @type {Settings["base"]} */ (p.base),
  rules: structuredClone(p.rules),
  holdStart: p.holdStart,
  title: p.title,
  desc: p.desc,
});

/** @typedef {{ type: string, hold: boolean, board: Uint8Array, cells: Array<[number, number]> }} SolutionMove */
/**
 * 자동 확인 결과(그 퍼즐 코드에 대해). checking: 찾는 중
 * @typedef {{ code: string, state: "checking" | "solvable" | "unsolvable" | "exhausted", moves?: SolutionMove[] }} Verified
 */

/**
 * @param {{
 *   dialog: HTMLDialogElement,
 *   solver: ReturnType<typeof import("../app/solver.js").createSolver>,
 *   customs: ReturnType<typeof import("../storage/custom-puzzles.js").createCustomPuzzles>,
 *   onTry: (code: string) => void,
 * }} options
 */
export const createPuzzleEditor = ({ dialog, solver, customs, onTry }) => {
  let cells = new Uint8Array(PUZZLE_CELLS);
  let pieces = "";
  let settings = defaultSettings();
  /** 지금 편집 중인 퍼즐 */
  const current = () => ({ cells, pieces, ...settings });
  /**
   * 확인 표시(자동 확인·직접 풀어 봄)를 붙이는 열쇠: 이름·설명을 뺀 퍼즐 코드. 이름만 고쳐도 확인이 사라지던 것(퍼즐 다시 보기 P12)
   * @param {any} p
   */
  const contentKey = p => encodePuzzle({ ...p, title: "", desc: "" });
  const keyNow = () => contentKey(current());
  let cleared = /** @type {string | null} */ (null);
  /** 내 퍼즐에서 편집 중인 퍼즐의 id(아직 저장 전이면 null) */
  let entryId = /** @type {string | null} */ (null);
  /** 내 퍼즐에 저장돼 있던 확인 표시: 그 퍼즐 그대로일 때만 쓴다 */
  let loaded = /** @type {{ code: string, checked: number } | null} */ (null);
  /** 저장 결과: saved 저장함, full 가득 참, none 아직 저장할 수 없는 퍼즐 */
  let saveState = /** @type {"saved" | "full" | "none"} */ ("none");
  /** @type {Tool} */
  let tool = "cell";
  let height = EDIT_HEIGHTS[0];
  /** 피스 순서에서 고른 자리(없으면 null: 새 피스는 맨 뒤에) */
  let selected = /** @type {number | null} */ (null);
  const history = createHistory();
  /** @returns {Snapshot} */
  const snapshot = () => ({ cells: cells.slice(), pieces, settings: structuredClone(settings) });
  /** @type {Verified | null} */
  let verified = null;
  /** 찾는 중인 자동 확인(대화상자를 닫거나 퍼즐이 바뀌면 멈춘다) */
  let checking = /** @type {null | { cancel: () => void }} */ (null);
  const stopChecking = () => {
    checking?.cancel();
    checking = null;
    if (verified?.state === "checking") verified = null;
  };
  /** 편집기가 열려 있을 때만 단축키(Ctrl+Z)를 받는다 */
  let undoKeys = /** @type {null | ((redo: boolean) => void)} */ (null);

  dialog.addEventListener("keydown", event => {
    if (!undoKeys || !dialog.querySelector(".puzzle-editor") || !(event.ctrlKey || event.metaKey) || event.altKey)
      return;
    // 이름·설명 칸 안에서는 글자 되돌리기(브라우저 기본)
    const target = /** @type {HTMLElement} */ (event.target);
    if (target instanceof HTMLInputElement && target.type !== "checkbox") return;
    const key = event.key.toLowerCase();
    if (key !== "z" && key !== "y") return;
    event.preventDefault();
    undoKeys(key === "y" || event.shiftKey);
  });
  // 목록에서 편집기로 바꿀 때는 같은 대화상자를 닫았다 바로 다시 연다. close 이벤트는 그 뒤에 오므로 열려 있으면 그대로 둔다
  dialog.addEventListener("close", () => {
    if (dialog.open) return;
    undoKeys = null;
    stopChecking();
  });

  /** 그 퍼즐(열쇠 contentKey)에 붙일 확인 표시: 자동 확인으로 풀었는지, 직접 풀어 봤는지(이번에, 또는 저장돼 있던 것) */
  const checkedFor = key =>
    (verified?.code === key && verified.state === "solvable" ? CHECKED_AUTO : 0) |
    (cleared === key ? CHECKED_TRIED : 0) |
    (loaded?.code === key ? loaded.checked : 0);
  /** 내 퍼즐에 저장한다(고칠 때마다 저절로). 링크로 보낼 수 있는 퍼즐만 */
  const save = () => {
    const code = encodePuzzle(current());
    if (!code) {
      saveState = "none";
      return;
    }
    const id = customs.save(
      entryId,
      encodePuzzle({ ...current(), checked: checkedFor(keyNow()) }, { checked: true }) ?? ""
    );
    if (id) entryId = id;
    saveState = id ? "saved" : "full";
  };
  /** 편집기 상태를 이 퍼즐로(없으면 빈 판) */
  const reset = (/** @type {import("../modes/custom-puzzle.js").FullPuzzle | null} */ puzzle, id = null) => {
    cells = puzzle ? puzzle.cells : new Uint8Array(PUZZLE_CELLS);
    pieces = puzzle ? puzzle.pieces : "";
    settings = puzzle ? settingsOf(puzzle) : defaultSettings();
    const key = puzzle && contentKey(puzzle);
    loaded = key && puzzle ? { code: key, checked: puzzle.checked } : null;
    entryId = id;
    cleared = null;
    selected = null;
    height = puzzle ? fitHeight(cells) : EDIT_HEIGHTS[0];
    history.clear();
    stopChecking();
    verified = null;
    saveState = puzzle ? "saved" : "none";
  };
  const editor = {
    /** 이어서 하기로 돌아온 시험 플레이의 퍼즐: 내 퍼즐에 있으면 그 퍼즐로 */
    load(code) {
      const puzzle = decodePuzzle(code);
      if (!puzzle) return;
      reset(puzzle, customs.findByCode(code)?.id ?? null);
    },
    markCleared(code) {
      const puzzle = decodePuzzle(code);
      if (!puzzle || contentKey(puzzle) !== keyNow()) return;
      cleared = keyNow();
      save();
    },
    /** 새 퍼즐 */
    openNew() {
      reset(null);
      editor.open();
    },
    /** 내 퍼즐 하나를 편집 @param {string} id */
    openEntry(id) {
      const item = customs.find(id);
      const puzzle = item && decodePuzzle(item.code);
      if (!puzzle) return editor.openNew();
      reset(puzzle, id);
      editor.open();
    },
    /** 내 퍼즐 하나를 시험 플레이 @param {string} id */
    playEntry(id) {
      const item = customs.find(id);
      const puzzle = item && decodePuzzle(item.code);
      if (!puzzle) return;
      reset(puzzle, id);
      onTry(/** @type {string} */ (encodePuzzle(puzzle)));
    },
    /**
     * 내 퍼즐을 복제해 새 내 퍼즐로 연다(퍼즐 다시 보기 P6): 같은 판으로 피스만 다른 쉬운·어려운 변형을 만들 때.
     * 확인 표시는 빼고, 이름 뒤에 "사본"
     * @param {string} id
     */
    openDuplicate(id) {
      const item = customs.find(id);
      const puzzle = item && decodePuzzle(item.code);
      if (!puzzle) return editor.openNew();
      const suffix = ` ${t("사본")}`;
      const title = `${(puzzle.title || t("만든 퍼즐")).slice(0, MAX_TITLE - suffix.length)}${suffix}`;
      reset({ ...puzzle, checked: 0, title });
      save();
      editor.open();
    },
    /**
     * 게임 장면으로 새 퍼즐(퍼즐 다시 보기 P4): 판·피스·홀드를 넣고 연다. 홀드에 피스가 있었으면 홀드를 켠다.
     * 목표는 판 비우기로 시작하고, 고르기는 만드는 사람이 한다
     * @param {{ cells: Uint8Array, pieces: string, holdStart: string }} scene
     */
    openScene(scene) {
      reset(null);
      cells = scene.cells;
      pieces = scene.pieces;
      if (scene.holdStart) {
        const rules = { ...settings.rules, hold: { enabled: true } };
        settings = settingsOf(normalizePuzzle({ cells, pieces, ...settings, rules, holdStart: scene.holdStart }));
      }
      height = fitHeight(cells);
      save();
      editor.open();
    },
    /** 받은 퍼즐을 복사해 새 내 퍼즐로(확인 표시는 빼고) @param {string} code */
    openCopy(code) {
      const puzzle = decodePuzzle(code);
      if (!puzzle) return editor.openNew();
      reset({ ...puzzle, checked: 0 });
      loaded = null;
      save();
      editor.open();
    },
    open() {
      const notice = el("p", { class: "notice-slot", role: "status" });
      let autoTimer = 0;
      /** 사용자가 멈춘 퍼즐(열쇠): 다시 고치기 전까지 저절로 확인하지 않는다 */
      let autoSkip = /** @type {string | null} */ (null);
      const trial = button({ id: "puzzle-trial", label: t("시험 플레이") });
      const copy = button({ id: "puzzle-copy", label: t("링크 복사"), icon: "link" });
      const link = textInput({
        id: "custom-puzzle-link",
        type: "url",
        readOnly: true,
        hidden: true,
        "aria-label": t("공유 링크"),
      });

      // ---- 판 ----
      const board = el("div", {
        class: "puzzle-editor-board",
        role: "group",
        "aria-label": t("시작 보드"),
      });
      const tiles = Array.from(cells, (_, index) =>
        el("button", {
          type: "button",
          class: "puzzle-editor-cell",
          tabIndex: -1,
          "aria-label": t("{row}행 {col}열", { row: Math.floor(index / WIDTH) + 1, col: (index % WIDTH) + 1 }),
          "aria-pressed": "false",
          "data-cell": String(index),
        })
      );
      /** 보이는 칸 중 키보드로 들어올 칸(처음은 왼쪽 아래) */
      let focusIndex = PUZZLE_CELLS - WIDTH;
      const firstVisible = () => (VISIBLE_ROWS - height) * WIDTH;
      /** 풀이 보기: 몇 번째 수를 보여 주는지(null이면 편집 중) */
      let viewStep = /** @type {number | null} */ (null);
      const solution = () => (verified?.state === "solvable" && verified.moves) || null;
      const paintTiles = () => {
        const move = viewStep !== null ? solution()?.[viewStep] : null;
        // 풀이를 볼 때는 그 수를 놓기 전 판(40줄 중 보이는 20줄)과 놓을 칸
        const shown = move ? move.board.subarray(move.board.length - PUZZLE_CELLS) : cells;
        const ghost = new Set(
          (move?.cells ?? []).map(([x, y]) => (y - (move ? move.board.length / WIDTH - VISIBLE_ROWS : 0)) * WIDTH + x)
        );
        tiles.forEach((tile, i) => {
          tile.setAttribute("aria-pressed", String(Boolean(shown[i])));
          if (ghost.has(i)) tile.dataset.ghost = "1";
          else delete tile.dataset.ghost;
        });
        board.classList.toggle("is-viewing", Boolean(move));
      };
      const layoutBoard = () => {
        board.dataset.rows = String(height);
        board.replaceChildren(...tiles.slice(firstVisible()));
        if (focusIndex < firstVisible()) focusIndex = PUZZLE_CELLS - WIDTH;
        tiles.forEach((tile, i) => (tile.tabIndex = i === focusIndex ? 0 : -1));
      };

      // ---- 피스 순서 ----
      const sequence = el("div", { class: "puzzle-editor-sequence", role: "group", "aria-label": t("피스 순서") });
      const count = el("output", { class: "puzzle-editor-count num", "aria-live": "polite" });
      const add = PIECE_TYPES.map(piece =>
        button({
          label: piece,
          icon: /** @type {any} */ (`piece-${piece}`),
          size: "s",
          "data-piece": piece,
          title: t("{piece} 넣기", { piece }),
        })
      );
      const moveBack = iconButton({ icon: "arrow-left", label: t("고른 피스를 앞으로") });
      const moveForward = iconButton({ icon: "arrow-right", label: t("고른 피스를 뒤로") });
      const remove = button({ label: t("빼기"), size: "s", id: "puzzle-piece-remove" });

      // ---- 판 도구 ----
      const undo = iconButton({ icon: "undo", label: t("되돌리기"), id: "puzzle-undo" });
      const redo = iconButton({ icon: "redo", label: t("다시 실행"), id: "puzzle-redo" });
      const shifts = /** @type {const} */ ([
        ["arrow-up", t("판을 위로 밀기"), 0, -1],
        ["arrow-down", t("판을 아래로 밀기"), 0, 1],
        ["arrow-left", t("판을 왼쪽으로 밀기"), -1, 0],
        ["arrow-right", t("판을 오른쪽으로 밀기"), 1, 0],
      ]).map(([icon, label, dx, dy]) =>
        iconButton({
          icon,
          label,
          "data-shift": `${dx},${dy}`,
          onClick: () => {
            const filled = board => board.reduce((n, v) => n + (v ? 1 : 0), 0);
            const before = filled(cells);
            edit(() => shiftCells(cells, dx, dy));
            // 밖으로 나간 칸은 지워진다 — 조용히 사라지지 않게 알린다(퍼즐 다시 보기 P7). 일부러 바닥 줄을 지울 때도 쓴다
            const lost = before - filled(cells);
            if (lost > 0)
              notice.textContent = t("칸 {n}개가 판 밖으로 나가 지워졌어요. 되돌리기로 돌아갈 수 있어요.", { n: lost });
          },
        })
      );
      // 판과 함께 피스 순서·처음 홀드 피스도 뒤집는다(S와 Z, J와 L을 서로 바꿈) — 되돌리기 한 번으로 함께 돌아간다
      const mirror = iconButton({
        icon: "mirror",
        label: t("좌우 뒤집기 (피스도 S와 Z, J와 L을 바꿔요)"),
        onClick: () => {
          const next = mirrorCells(cells);
          const nextPieces = mirrorPieces(pieces);
          const nextHold = mirrorPieces(settings.holdStart);
          if (next.every((v, i) => v === cells[i]) && nextPieces === pieces && nextHold === settings.holdStart) return;
          history.record(snapshot());
          cells = next;
          pieces = nextPieces;
          settings = { ...settings, holdStart: nextHold };
          changed();
        },
      });
      const clear = confirmButton({
        label: t("판 지우기"),
        confirmLabel: t("정말 지우기"),
        size: "s",
        id: "puzzle-clear",
        onConfirm: () => edit(() => new Uint8Array(PUZZLE_CELLS)),
      });

      // ---- 자동 확인 · 풀이 보기 ----
      const check = button({ id: "puzzle-check", label: t("풀 수 있는지 확인"), icon: "check", size: "s" });
      const stop = button({ id: "puzzle-check-stop", label: t("멈추기"), size: "s" });
      const status = el("p", { class: "puzzle-editor-status", id: "puzzle-status", role: "status" });
      const view = toggle({ id: "puzzle-solution-view" });
      const prevStep = iconButton({ icon: "arrow-left", label: t("이전 수"), id: "puzzle-solution-prev" });
      const nextStep = iconButton({ icon: "arrow-right", label: t("다음 수"), id: "puzzle-solution-next" });
      const stepOut = el("output", { class: "puzzle-editor-step num", id: "puzzle-solution-step" });

      const tools = segmented({
        id: "puzzle-tool",
        label: t("칠하기 도구"),
        options: [
          ["cell", t("칸")],
          ["row", t("한 줄")],
          ["garbage", t("구멍 줄")],
        ],
        value: tool,
        onChange: v => {
          tool = /** @type {Tool} */ (v);
          setSegmented(tools, v);
          refresh();
        },
      });
      const heights = segmented({
        id: "puzzle-height",
        label: t("보이는 높이"),
        options: EDIT_HEIGHTS.map(h => [String(h), t("{n}줄", { n: h })]),
        value: String(height),
        onChange: v => {
          if (Number(v) < usedHeight(cells)) return;
          height = Number(v);
          layoutBoard();
          refresh();
        },
      });
      // 시작 틀은 고르면 바로 적용하는 메뉴: 적용한 뒤에는 "시작 틀 고르기"로 돌아가 같은 틀도 다시 고를 수 있다
      const makeTemplates = () =>
        dropdown({
          id: "puzzle-template",
          label: t("시작 틀"),
          value: "",
          options: [
            { value: "", label: t("시작 틀 고르기") },
            { value: "empty", label: t("빈 판") },
            { value: "t-slot", label: t("T 자리") },
            { value: "well", label: t("4줄 우물") },
            { value: "tsd", label: t("T-spin Double 자리") },
            { value: "tst", label: t("T-spin Triple 자리") },
            ...COPYABLE_STAGES.map(p => ({
              value: `stage-${p.number}`,
              label: t("퍼즐 {n}단계 복사 · {kind}", {
                n: p.number,
                kind: goalLabel(template(`stage-${p.number}`)?.goal ?? { kind: "pc" }),
              }),
            })),
          ],
          onChange: id => {
            const start = id ? template(id) : null;
            if (!start) return;
            history.record(snapshot());
            cells = start.cells;
            pieces = start.pieces;
            settings = { ...settings, goal: start.goal };
            selected = null;
            height = fitHeight(cells);
            layoutBoard();
            changed();
            const fresh = makeTemplates();
            templates.replaceWith(fresh);
            templates = fresh;
            fresh.focus();
          },
        });
      let templates = makeTemplates();

      // ---- 이름·설명: 링크에 담겨 받는 쪽 목록·게임 화면에 보인다. 입력 중에는 그대로 두고, 칸을 떠날 때 되돌리기에 남긴다 ----
      const saved = el("p", { class: "field-help puzzle-editor-saved", id: "puzzle-saved", role: "status" });
      const textField = (/** @type {"title" | "desc"} */ key, id, max, placeholder) => {
        const input = textInput({ id, maxLength: max, value: settings[key], placeholder, autocomplete: "off" });
        /** @type {Snapshot | null} */
        let before = null;
        input.addEventListener("focus", () => (before = snapshot()));
        input.addEventListener("input", () => {
          settings = { ...settings, [key]: input.value };
          refresh();
        });
        input.addEventListener("change", () => {
          if (before && before.settings[key] !== input.value) history.record(before);
          before = snapshot();
          refresh();
        });
        return input;
      };
      const titleInput = textField("title", "puzzle-title", MAX_TITLE, t("예: 첫 T-spin"));
      const descInput = textField("desc", "puzzle-desc", MAX_DESC, t("받는 사람에게 한 줄 힌트"));

      // ---- 목표 · 고급 설정(규칙·중력) ----
      /** 설정 바꾸기 — 되돌리기에 남기고, 허용된 값으로 정리한다 */
      const editSettings = (/** @type {(next: Settings) => void} */ mutate) => {
        const next = structuredClone(settings);
        mutate(next);
        const fixed = settingsOf(normalizePuzzle({ cells, pieces, ...next }));
        if (JSON.stringify(fixed) === JSON.stringify(settings)) return;
        history.record(snapshot());
        settings = fixed;
        changed();
      };
      const goalRow = el("div", { class: "puzzle-editor-goal" });
      const advancedSummary = el("span", { class: "puzzle-editor-advanced-summary" });
      const advancedBody = el("div", { class: "puzzle-editor-advanced-body" });
      const advanced = el(
        "details",
        { class: "puzzle-editor-advanced", id: "puzzle-advanced" },
        el("summary", {}, el("strong", { text: t("고급 설정") }), advancedSummary),
        advancedBody
      );
      const yesNo = (id, value, onChange, disabled = false) =>
        toggle({ id, checked: value, disabled, onChange: on => editSettings(next => onChange(next, on)) });
      const pick = (id, label, options, value, onChange, disabled = false) =>
        dropdown({ id, label, options, value, disabled, onChange: v => editSettings(next => onChange(next, v)) });
      let renderedSettings = "";
      /** 설정이 바뀌었을 때만 목표 줄과 고급 설정을 다시 그린다(포커스는 같은 조작으로 돌려준다) */
      const renderSettings = () => {
        const key = JSON.stringify({ ...settings, title: "", desc: "" });
        advancedSummary.textContent = ruleSummary(current()) || t("Modern · 홀드 없음 · 중력 없음");
        if (key === renderedSettings) return;
        renderedSettings = key;
        const focus = focusKey(document.activeElement);
        const r = settings.rules;
        goalRow.replaceChildren(
          el("span", { class: "puzzle-editor-label", text: t("목표") }),
          pick(
            "puzzle-goal",
            t("목표"),
            GOAL_KINDS.map(kind => ({ value: kind, label: goalLabel({ kind, lines: settings.goal.lines || 1 }) })),
            settings.goal.kind,
            (next, kind) => (next.goal = { kind, lines: kind === "lines" ? next.goal.lines || 1 : 0 })
          ),
          pick(
            "puzzle-goal-lines",
            t("지울 줄 수"),
            Array.from({ length: MAX_GOAL_LINES }, (_, i) => ({ value: i + 1, label: t("{n}줄", { n: i + 1 }) })),
            settings.goal.lines || 1,
            (next, n) => (next.goal = { kind: "lines", lines: n }),
            settings.goal.kind !== "lines"
          )
        );
        const gravity = segmented({
          id: "puzzle-gravity",
          label: t("중력"),
          options: [
            ["none", t("없음")],
            ["20g", "20G"],
            ["rules", t("규칙대로")],
          ],
          value: settings.gravity,
          onChange: v => editSettings(next => (next.gravity = /** @type {Settings["gravity"]} */ (v))),
        });
        const base = segmented({
          id: "puzzle-base",
          label: t("바탕 규칙"),
          options: [
            ["modern", "Modern"],
            ["retro", "Retro"],
            ["arcade", "Arcade"],
          ],
          value: settings.base,
          onChange: v =>
            editSettings(next => {
              next.base = /** @type {Settings["base"]} */ (v);
              next.rules = baseRules(next.base);
            }),
        });
        const gravityHint = {
          none: t("피스가 떨어지지 않아요. 생각하는 퍼즐"),
          "20g": t("피스가 나오자마자 바닥까지. 바닥을 따라 움직여야 해요"),
          rules: t("규칙의 중력대로 떨어져요. 자동 확인과 첫 수 보기를 쓸 수 없어요"),
        }[settings.gravity];
        const holdOff = !r.hold.enabled;
        advancedBody.replaceChildren(
          fieldRow({
            id: "puzzle-base",
            label: t("바탕 규칙"),
            hint: t("고르면 그 규칙으로 아래 항목을 다시 채워요"),
            control: base,
          }),
          fieldRow({ id: "puzzle-gravity", label: t("중력"), hint: gravityHint, control: gravity }),
          fieldRow({
            id: "puzzle-rotation",
            label: t("회전 시스템"),
            hint: "",
            control: pick(
              "puzzle-rotation",
              t("회전 시스템"),
              [
                { value: "srs", label: t("SRS — 벽차기 5단계 (현대 표준)") },
                { value: "ars", label: t("ARS — 좌우 1칸만, 중앙열 규칙 (아케이드)") },
                { value: "classic", label: t("킥 없음 — 막히면 안 돈다 (옛날 방식)") },
              ],
              r.rotation,
              (next, v) => (next.rules.rotation = v)
            ),
          }),
          fieldRow({
            id: "puzzle-hold",
            label: t("홀드"),
            hint: t("피스 하나를 맡겨 두었다가 바꿔 쓰기"),
            control: yesNo("puzzle-hold", r.hold.enabled, (next, on) => (next.rules.hold = { enabled: on })),
          }),
          fieldRow({
            id: "puzzle-hold-start",
            label: t("처음 홀드 피스"),
            hint: holdOff ? t("홀드가 꺼져 있어 쓰지 않아요") : t("처음부터 홀드 칸에 들어 있는 피스"),
            disabled: holdOff,
            control: pick(
              "puzzle-hold-start",
              t("처음 홀드 피스"),
              [{ value: "", label: t("없음") }, ...PIECE_TYPES.map(piece => ({ value: piece, label: piece }))],
              settings.holdStart,
              (next, v) => (next.holdStart = v),
              holdOff
            ),
          }),
          fieldRow({
            id: "puzzle-preview",
            label: t("넥스트 미리보기"),
            hint: t("다음에 나올 피스를 몇 개까지 미리 보여 줄지"),
            control: pick(
              "puzzle-preview",
              t("넥스트 미리보기"),
              Array.from({ length: 7 }, (_, n) => ({ value: n, label: t("{n}개", { n }) })),
              r.previewCount,
              (next, v) => (next.rules.previewCount = v)
            ),
          }),
          fieldRow({
            id: "puzzle-tspin",
            label: t("T-spin 판정"),
            hint: "",
            control: pick(
              "puzzle-tspin",
              t("T-spin 판정"),
              [
                { value: "threeCorner", label: t("3-corner (Mini 포함)") },
                { value: "none", label: t("없음") },
              ],
              r.tspin,
              (next, v) => (next.rules.tspin = v)
            ),
          }),
          fieldRow({
            id: "puzzle-lock",
            label: t("고정 방식"),
            hint: "",
            control: pick(
              "puzzle-lock",
              t("고정 방식"),
              LOCK_TYPES.map(type => ({
                value: type,
                label: {
                  moveReset: t("움직이면 리셋 (횟수 제한)"),
                  stepReset: t("더 내려갔을 때만 리셋"),
                  infinite: t("무제한 리셋 (인피니티)"),
                  none: t("닿으면 다음 낙하 때 즉시 고정"),
                }[type],
              })),
              r.lock.type,
              (next, v) => (next.rules.lock = { ...next.rules.lock, type: v })
            ),
          }),
          fieldRow({
            id: "puzzle-hard-drop",
            label: t("하드 드롭"),
            hint: t("한 번에 바닥까지 떨어뜨리고 바로 고정"),
            control: yesNo("puzzle-hard-drop", r.hardDrop, (next, on) => (next.rules.hardDrop = on)),
          }),
          fieldRow({
            id: "puzzle-ghost",
            label: t("고스트"),
            hint: t("피스가 떨어질 자리를 흐리게 보여 줘요"),
            control: yesNo("puzzle-ghost", r.ghost, (next, on) => (next.rules.ghost = on)),
          }),
          fieldRow({
            id: "puzzle-irs",
            label: t("미리 회전 (IRS)"),
            hint: t("생성 순간 회전 키를 누르고 있으면 돌린 채로 나온다"),
            control: yesNo("puzzle-irs", r.irs, (next, on) => (next.rules.irs = on)),
          }),
          fieldRow({
            id: "puzzle-ihs",
            label: t("미리 홀드 (IHS)"),
            hint: holdOff ? t("홀드가 꺼져 있어 쓰지 않아요") : t("생성 순간 홀드 키를 누르고 있으면 바로 홀드"),
            disabled: holdOff,
            control: yesNo("puzzle-ihs", r.ihs, (next, on) => (next.rules.ihs = on), holdOff),
          }),
          el("p", {
            class: "field-help",
            text: t(
              "생성기·점수표·지연 시간 같은 나머지 규칙은 바탕 규칙을 그대로 따라요(퍼즐에서는 거의 쓰이지 않아요)."
            ),
          })
        );
        restoreFocus(dialog, focus);
      };

      const toolHint = {
        cell: t("누르거나 끌어서 칸을 채우고 지워요."),
        row: t("누르거나 끌어서 줄 전체를 채우고 지워요."),
        garbage: t("누른 열만 빈 쓰레기 줄을 만들어요. 아래위로 끌면 같은 열에 구멍이 이어져요."),
      };
      const hint = el("p", { class: "field-help puzzle-editor-hint" });

      const renderSequence = () => {
        const focused = sequence.contains(document.activeElement)
          ? Number(/** @type {HTMLElement} */ (document.activeElement).dataset.at)
          : null;
        const chips = [...pieces].map((piece, i) => {
          const chip = button({
            label: piece,
            icon: /** @type {any} */ (`piece-${piece}`),
            size: "s",
            class: "puzzle-seq-chip",
            "data-at": String(i),
            "aria-pressed": String(selected === i),
            "aria-label": t("{n}번째 {piece}", { n: i + 1, piece }),
          });
          chip.addEventListener("click", () => {
            selected = selected === i ? null : i;
            refresh();
          });
          return chip;
        });
        sequence.replaceChildren(
          ...(chips.length ? chips : [el("span", { class: "puzzle-editor-empty", text: t("피스를 추가하세요") })])
        );
        // 칩에 포커스가 있었으면 고른 칩(옮긴 피스를 따라간다), 없으면 같은 자리 칩으로
        if (focused !== null) {
          const target = chips[Math.min(selected ?? focused, chips.length - 1)];
          if (target) target.focus();
          else add[0].focus();
        }
      };

      const refresh = () => {
        const code = encodePuzzle(current());
        renderSettings();
        trial.disabled = !code;
        // 퍼즐이 바뀌었으면 찾던 확인은 멈추고, 지난 결과는 쓰지 않는다
        if (verified && verified.code !== keyNow()) {
          stopChecking();
          verified = null;
        }
        const checkedNow = code ? checkedFor(keyNow()) : 0;
        const tried = Boolean(checkedNow & CHECKED_TRIED);
        const solvable = Boolean(checkedNow & CHECKED_AUTO) && canSearch(current());
        copy.disabled = !code || !(tried || solvable);
        save();
        saved.textContent =
          saveState === "saved"
            ? t("내 퍼즐에 저장했어요. 고치면 저절로 저장돼요.")
            : saveState === "full"
              ? t("내 퍼즐이 가득 찼어요({n}개). 퍼즐 목록에서 하나를 지우면 저장돼요.", { n: MAX_MADE })
              : t("판과 피스를 넣으면 내 퍼즐에 저절로 저장돼요.");
        link.hidden = true;
        link.value = "";
        renderSequence();
        count.textContent = `${pieces.length} / ${MAX_PUZZLE_PIECES}`;
        for (const piece of add) piece.disabled = pieces.length >= MAX_PUZZLE_PIECES;
        remove.disabled = pieces.length === 0;
        moveBack.disabled = selected === null || selected === 0;
        moveForward.disabled = selected === null || selected === pieces.length - 1;
        undo.disabled = !history.canUndo();
        redo.disabled = !history.canRedo();
        clear.disabled = !cells.some(Boolean);
        const used = usedHeight(cells);
        for (const b of heights.querySelectorAll("button")) {
          /** @type {HTMLButtonElement} */ (b).disabled = Number(/** @type {HTMLElement} */ (b).dataset.value) < used;
        }
        setSegmented(heights, String(height));
        hint.textContent = toolHint[tool];
        // 자동 확인
        const moves = solution();
        if (!moves) viewStep = null;
        check.disabled = !code || !canSearch(current()) || Boolean(checking) || Boolean(verified);
        stop.disabled = !checking;
        view.disabled = !moves;
        view.checked = viewStep !== null;
        prevStep.disabled = viewStep === null || viewStep === 0;
        nextStep.disabled = viewStep === null || !moves || viewStep >= moves.length - 1;
        const step = moves && viewStep !== null ? moves[viewStep] : null;
        stepOut.textContent = moves
          ? step?.hold
            ? t("{n} / {total} · 홀드 먼저", { n: (viewStep ?? 0) + 1, total: moves.length })
            : `${(viewStep ?? 0) + 1} / ${moves.length}`
          : "- / -";
        status.textContent = statusText(code);
        scheduleAutoCheck();
        status.dataset.tone = verified?.state === "solvable" ? "ok" : verified || warnings().length ? "warn" : "";
        paintTiles();
        notice.textContent = tried
          ? t("직접 풀어 봤어요. 링크를 공유할 수 있어요.")
          : solvable
            ? t("풀 수 있는 퍼즐이에요. 링크를 공유할 수 있어요.")
            : t("풀 수 있는지 확인하거나 시험 플레이에서 풀면 링크를 공유할 수 있어요.");
      };
      const warnings = () => puzzleWarnings(current());
      /**
       * 저절로 확인(퍼즐 다시 보기 P3): 고치기를 멈추고 0.6초 뒤 Worker로 찾는다. 다시 고치면 찾던 것은 멈춘다(refresh).
       * 피스가 많으면(12개 넘게) 오래 걸릴 수 있어 버튼으로만. 미리 알려 줄 것이 있거나 멈춘 퍼즐도 하지 않는다
       */
      const autoCheckable = () =>
        pieces.length <= AUTO_CHECK_PIECES &&
        canSearch(current()) &&
        !warnings().length &&
        !checking &&
        keyNow() !== autoSkip &&
        !(verified && verified.code === keyNow());
      const scheduleAutoCheck = () => {
        clearTimeout(autoTimer);
        if (!keyNow() || !autoCheckable()) return;
        autoTimer = setTimeout(() => {
          if (dialog.open && dialog.contains(status) && autoCheckable()) runCheck(true);
        }, 600);
      };
      /** 확인 결과가 있으면 그것, 없으면 미리 알려 줄 것 */
      const statusText = code => {
        if (verified?.state === "checking") return t("풀 수 있는지 찾는 중이에요…");
        if (verified?.state === "solvable")
          return t("풀 수 있어요 · {n}수. 풀이 보기로 한 수씩 볼 수 있어요.", { n: verified.moves?.length ?? 0 });
        if (verified?.state === "unsolvable")
          return settings.goal.kind === "pc"
            ? t("이 피스로는 판을 비울 수 없어요.")
            : t("이 피스로는 목표({goal})를 이룰 수 없어요.", { goal: goalLabel(settings.goal) });
        if (!canSearch(current()))
          return t(
            "규칙대로 떨어지는 퍼즐은 손 빠르기에 따라 달라 자동으로 확인할 수 없어요. 시험 플레이로 직접 풀어 주세요."
          );
        if (verified?.state === "exhausted")
          return t("너무 길어서 자동으로 확인하지 못했어요. 시험 플레이로 직접 풀어 주세요.");
        const found = warnings();
        if (found.length)
          return found
            .map(w =>
              w.key === "count"
                ? t("칸 {n}개와 이 피스로는 블록 수가 10의 배수가 되지 않아 판을 다 비울 수 없어요.", { n: w.cells })
                : w.key === "full"
                  ? t("다 찬 줄이 있어요. 판 비우기에서는 처음부터 지워질 줄이에요.")
                  : t("첫 피스가 나오는 자리 바로 아래가 막혀 있어 판으로 내려오지 못해요.")
            )
            .join(" ");
        if (!code) return "";
        if (keyNow() === autoSkip) return t("확인을 누르면 풀 수 있는지 찾아봐요.");
        return pieces.length <= AUTO_CHECK_PIECES
          ? t("고치기를 멈추면 저절로 풀 수 있는지 찾아봐요.")
          : t("피스가 많아 확인을 눌러야 찾아봐요.");
      };
      const changed = () => {
        // 이름·설명만 고쳤으면 직접 풀어 본 표시는 그대로
        if (cleared !== keyNow()) cleared = null;
        viewStep = null;
        // 민 판이 보이는 높이 위로 올라가면 다 보이게 넓힌다
        if (usedHeight(cells) > height) {
          height = fitHeight(cells);
          layoutBoard();
        }
        refresh();
      };
      /** 판 전체를 바꾸는 편집(밀기·뒤집기·지우기) — 되돌리기에 남긴다 */
      const edit = make => {
        const next = make();
        if (next.every((v, i) => v === cells[i])) return;
        history.record(snapshot());
        cells = next;
        changed();
      };
      /** 피스 순서 편집 */
      const editPieces = result => {
        if (result.pieces === pieces && result.at === selected) return;
        if (result.pieces !== pieces) history.record(snapshot());
        pieces = result.pieces;
        selected = result.at;
        changed();
      };
      const restore = (/** @type {Snapshot | null} */ state) => {
        if (!state) return;
        cells = state.cells;
        pieces = state.pieces;
        settings = state.settings;
        titleInput.value = settings.title;
        descInput.value = settings.desc;
        if (selected !== null && selected >= pieces.length) selected = null;
        changed();
      };
      undo.addEventListener("click", () => restore(history.undo(snapshot())));
      redo.addEventListener("click", () => restore(history.redo(snapshot())));
      undoKeys = again => restore(again ? history.redo(snapshot()) : history.undo(snapshot()));

      // ---- 칠하기: 누른 칸에서 시작해 끌고 가는 칸마다. 한 번 끌기 = 되돌리기 한 번 ----
      /** @type {null | { value: 0 | 1, before: Snapshot, changed: boolean, col: number, last: number }} */
      let stroke = null;
      const paintAt = index => {
        if (!stroke || index === stroke.last) return;
        stroke.last = index;
        // 구멍 줄은 처음 누른 열을 구멍으로 둔다(아래위로 끌면 같은 열에 구멍이 이어진다)
        const at = tool === "garbage" ? index - (index % WIDTH) + stroke.col : index;
        if (applyTool(cells, tool, at, stroke.value)) {
          stroke.changed = true;
          paintTiles();
        }
      };
      const endStroke = () => {
        if (!stroke) return;
        if (stroke.changed) {
          history.record(stroke.before);
          changed();
        }
        stroke = null;
      };
      const cellAt = target => /** @type {HTMLElement | null} */ (target?.closest?.("[data-cell]"));
      board.addEventListener("pointerdown", event => {
        const cell = cellAt(event.target);
        if (!cell || event.button > 0) return;
        event.preventDefault();
        // 풀이를 보는 중에 판을 누르면 편집으로 돌아온다
        if (viewStep !== null) {
          viewStep = null;
          refresh();
          return;
        }
        const index = Number(cell.dataset.cell);
        cell.focus({ preventScroll: true });
        stroke = {
          value: strokeValue(cells, tool, index),
          before: snapshot(),
          changed: false,
          col: index % WIDTH,
          last: -1,
        };
        board.setPointerCapture(event.pointerId);
        paintAt(index);
      });
      board.addEventListener("pointermove", event => {
        if (!stroke) return;
        const cell = cellAt(document.elementFromPoint(event.clientX, event.clientY));
        if (cell && board.contains(cell)) paintAt(Number(cell.dataset.cell));
      });
      for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) board.addEventListener(type, endStroke);
      // 키보드(Enter·Space)로 누른 칸: 칸 하나에 도구를 한 번
      board.addEventListener("click", event => {
        const cell = cellAt(event.target);
        if (!cell || event.detail > 0) return;
        const index = Number(cell.dataset.cell);
        stroke = {
          value: strokeValue(cells, tool, index),
          before: snapshot(),
          changed: false,
          col: index % WIDTH,
          last: -1,
        };
        paintAt(index);
        endStroke();
      });
      board.addEventListener("focusin", event => {
        const cell = cellAt(event.target);
        if (!cell) return;
        focusIndex = Number(cell.dataset.cell);
        for (const tile of tiles) tile.tabIndex = tile === cell ? 0 : -1;
      });
      board.addEventListener("keydown", event => {
        const cell = cellAt(event.target);
        const offset = { ArrowUp: -WIDTH, ArrowDown: WIDTH, ArrowLeft: -1, ArrowRight: 1 }[event.key];
        if (!cell || offset === undefined) return;
        event.preventDefault();
        const index = Number(cell.dataset.cell);
        const column = (index % WIDTH) + (Math.abs(offset) === 1 ? offset : 0);
        const next = index + offset;
        if (column >= 0 && column < WIDTH && next >= firstVisible() && next < PUZZLE_CELLS) tiles[next].focus();
      });

      // ---- 피스 순서 조작 ----
      for (const piece of add)
        piece.addEventListener("click", () => {
          editPieces(insertPiece(pieces, selected, /** @type {string} */ (piece.dataset.piece)));
          if (piece.disabled) remove.focus();
        });
      remove.addEventListener("click", () => {
        editPieces(removePiece(pieces, selected));
        if (remove.disabled) add[0].focus();
      });
      // 글자 키로 넣기·순서 글자 붙여 넣기(퍼즐 다시 보기 P5): 피스 칸(순서·버튼)에 포커스가 있을 때 I J L O S T Z,
      // 붙여 넣기는 글자 입력 칸 밖이면 어디서나. 여러 글자도 되돌리기 한 번
      const pieceKeys = event => {
        if (event.ctrlKey || event.metaKey || event.altKey || !/^[ijlostz]$/i.test(event.key)) return;
        event.preventDefault();
        editPieces(insertPiece(pieces, selected, event.key.toUpperCase()));
      };
      sequence.addEventListener("keydown", pieceKeys);
      for (const piece of add) piece.addEventListener("keydown", pieceKeys);
      const pastePieces = (/** @type {ClipboardEvent} */ event) => {
        const target = /** @type {HTMLElement} */ (event.target);
        if (target instanceof HTMLInputElement && target.type !== "checkbox") return;
        const text = event.clipboardData?.getData("text") ?? "";
        if (!text.trim()) return;
        event.preventDefault();
        const result = insertPieces(pieces, selected, text.trim());
        if (!result.added) {
          notice.textContent = t("피스 글자(I J L O S T Z)만 붙여 넣을 수 있어요.");
          return;
        }
        editPieces(result);
        notice.textContent = t("피스 {n}개를 넣었어요.", { n: result.added });
      };
      moveBack.addEventListener("click", () => selected !== null && editPieces(movePiece(pieces, selected, -1)));
      moveForward.addEventListener("click", () => selected !== null && editPieces(movePiece(pieces, selected, 1)));
      sequence.addEventListener("keydown", event => {
        const at = Number(/** @type {HTMLElement} */ (event.target).dataset.at);
        if (Number.isNaN(at)) return;
        if (event.key === "Delete" || event.key === "Backspace") {
          event.preventDefault();
          editPieces(removePiece(pieces, at));
        } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          const offset = event.key === "ArrowLeft" ? -1 : 1;
          // Alt+화살표는 피스를 옮기고, 화살표만은 옆 칩으로 간다
          if (event.altKey) editPieces(movePiece(pieces, at, offset));
          else {
            const next = /** @type {HTMLElement | undefined} */ (sequence.children[at + offset]);
            next?.focus();
          }
        }
      });

      /** 풀 수 있는지 찾는다. auto: 고치기를 멈추면 저절로(포커스는 옮기지 않는다) */
      const runCheck = (auto = false) => {
        const code = keyNow();
        if (!code || checking || !canSearch(current())) return;
        verified = { code, state: "checking" };
        const search = solver.run(solutionTask(current()));
        checking = search;
        refresh();
        if (!auto) stop.focus();
        search.promise.then(result => {
          if (checking !== search) return;
          checking = null;
          if (result === undefined) return;
          verified =
            result && "moves" in result
              ? { code, state: "solvable", moves: result.moves }
              : { code, state: result ? "exhausted" : "unsolvable" };
          if (dialog.contains(status)) {
            // 저절로 확인한 것이면 포커스는 사용자가 두던 곳에 그대로
            const keepFocus = auto && document.activeElement !== stop;
            refresh();
            if (!keepFocus) (view.disabled ? check : view).focus();
          }
        });
      };
      check.addEventListener("click", () => runCheck());
      stop.addEventListener("click", () => {
        // 멈춘 퍼즐은 다시 고치기 전까지 저절로 확인하지 않는다
        autoSkip = keyNow();
        stopChecking();
        refresh();
        check.focus();
      });
      view.addEventListener("change", () => {
        viewStep = view.checked && solution() ? 0 : null;
        refresh();
      });
      prevStep.addEventListener("click", () => {
        if (viewStep !== null && viewStep > 0) viewStep -= 1;
        refresh();
        if (prevStep.disabled) nextStep.focus();
      });
      nextStep.addEventListener("click", () => {
        const moves = solution();
        if (viewStep !== null && moves && viewStep < moves.length - 1) viewStep += 1;
        refresh();
        if (nextStep.disabled) prevStep.focus();
      });

      trial.addEventListener("click", () => {
        const code = encodePuzzle(current());
        if (!code) return;
        dialog.close();
        onTry(code);
      });
      copy.addEventListener("click", async () => {
        const code = encodePuzzle(current());
        if (!code || copy.disabled) return;
        // 받는 쪽에 보일 확인 표시: 자동 확인으로 풀 수 있었는지, 만든 사람이 직접 풀어 봤는지
        const checked = checkedFor(keyNow());
        const url = puzzleLink(encodePuzzle({ ...current(), checked }, { checked: true }) ?? code, location.href);
        const copied = await copyText(url);
        // 복사하는 사이 퍼즐을 고쳤거나 대화상자를 닫았으면 알리지 않는다
        if (encodePuzzle(current()) !== code || !dialog.open || !dialog.contains(link)) return;
        if (copied) notice.textContent = t("퍼즐 링크를 복사했어요.");
        else {
          revealForCopy(link, url);
          notice.textContent = t("자동 복사가 막혔어요. 선택된 링크를 직접 복사해 주세요.");
        }
      });

      fillDialog(dialog, {
        title: t("퍼즐 만들기"),
        body: el(
          "div",
          { class: "puzzle-editor" },
          el("p", {
            class: "field-help",
            text: t("판을 칠하고 피스와 목표를 고르세요. 규칙과 중력은 아래 고급 설정에서 바꿀 수 있어요."),
          }),
          el(
            "div",
            { class: "puzzle-editor-row" },
            el("label", { class: "puzzle-editor-label", htmlFor: "puzzle-title", text: t("이름") }),
            titleInput
          ),
          el(
            "div",
            { class: "puzzle-editor-row" },
            el("label", { class: "puzzle-editor-label", htmlFor: "puzzle-desc", text: t("설명") }),
            descInput
          ),
          saved,
          el(
            "div",
            { class: "puzzle-editor-row" },
            el("span", { class: "puzzle-editor-label", text: t("시작 틀") }),
            templates
          ),
          goalRow,
          // 판과 피스를 한 화면에(퍼즐 다시 보기 P2): 넓은 창은 [판 | 피스·확인] 두 칸, 좁은 창은 판 바로 아래에 피스
          el(
            "div",
            { class: "puzzle-editor-work" },
            el(
              "section",
              { class: "puzzle-editor-canvas", "aria-label": t("판") },
              el(
                "div",
                { class: "puzzle-editor-row" },
                el("span", { class: "puzzle-editor-label", text: t("칠하기") }),
                tools
              ),
              el(
                "div",
                { class: "puzzle-editor-row" },
                el("span", { class: "puzzle-editor-label", text: t("보이는 높이") }),
                heights
              ),
              hint,
              board,
              el(
                "div",
                { class: "puzzle-editor-tools", role: "toolbar", "aria-label": t("판 도구") },
                undo,
                redo,
                ...shifts,
                mirror,
                clear
              )
            ),
            el(
              "section",
              { class: "puzzle-editor-side", "aria-label": t("피스와 확인") },
              el(
                "div",
                { class: "puzzle-editor-seq-head" },
                el("span", { class: "puzzle-editor-label", text: t("피스 순서") }),
                count,
                el("span", { class: "puzzle-editor-seq-actions" }, moveBack, moveForward, remove)
              ),
              sequence,
              el(
                "div",
                {
                  class: "puzzle-editor-pieces",
                  role: "group",
                  "aria-label": t("피스 추가 (최대 {n}개)", { n: MAX_PUZZLE_PIECES }),
                },
                ...add
              ),
              el(
                "p",
                { class: "field-help" },
                t(
                  '피스를 눌러 고르면 그 뒤에 넣고, 앞뒤로 옮기거나 뺄 수 있어요(Alt+화살표·Delete). 글자 키(I J L O S T Z)로 넣거나 "TSZ" 같은 순서를 붙여 넣어도 돼요.'
                )
              ),
              el(
                "div",
                { class: "puzzle-editor-check" },
                el("div", { class: "puzzle-editor-check-actions" }, check, stop),
                status,
                el(
                  "div",
                  { class: "puzzle-editor-solution" },
                  el("label", { class: "puzzle-editor-switch" }, view, el("span", { text: t("풀이 보기") })),
                  el("span", { class: "puzzle-editor-step-nav" }, prevStep, stepOut, nextStep)
                )
              )
            )
          ),
          advanced,
          link
        ),
        notice,
        actions: [trial, copy],
        closeId: "puzzle-editor-close",
      });
      dialog.querySelector(".puzzle-editor")?.addEventListener("paste", pastePieces);
      layoutBoard();
      refresh();
      dialog.showModal();
      // 포커스는 판의 칸에 두되 스크롤은 하지 않는다 — 열자마자 이름·시작 틀·목표가 위로 밀려 안 보였다(5차 검수 F39)
      tiles[focusIndex].focus({ preventScroll: true });
    },
  };
  return editor;
};
