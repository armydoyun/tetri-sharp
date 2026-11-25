// 퍼즐 만들기 편집기: [시작 틀 · 도구 · 높이] [판] [판 도구 줄] [피스 순서] → 시험 플레이 · 링크 복사.
// 판은 누르거나 끌어서 칠한다(마우스·터치·펜 모두 Pointer Events). 편집 동작 자체는 js/modes/puzzle-edit.js(DOM 없음).
// 계획: docs/PUZZLE_MAKER.md
import { WIDTH, VISIBLE_ROWS } from "../core/board.js";
import { PIECE_TYPES } from "../core/pieces.js";
import { t } from "../i18n/index.js";
import { decodePuzzle, encodePuzzle, MAX_PUZZLE_PIECES, PUZZLE_CELLS } from "../modes/custom-puzzle.js";
import {
  COPYABLE_STAGES,
  EDIT_HEIGHTS,
  applyTool,
  createHistory,
  fitHeight,
  insertPiece,
  mirrorCells,
  movePiece,
  removePiece,
  shiftCells,
  strokeValue,
  template,
  usedHeight,
} from "../modes/puzzle-edit.js";
import { el, fillDialog } from "./dom.js";
import { button, confirmButton, dropdown, iconButton, segmented, setSegmented, textInput } from "./components.js";

/** @typedef {"cell" | "row" | "garbage"} Tool */
/** @typedef {{ cells: Uint8Array, pieces: string }} Snapshot */

/** @param {{ dialog: HTMLDialogElement, onTry: (code: string) => void }} options */
export const createPuzzleEditor = ({ dialog, onTry }) => {
  let cells = new Uint8Array(PUZZLE_CELLS);
  let pieces = "";
  let cleared = /** @type {string | null} */ (null);
  /** @type {Tool} */
  let tool = "cell";
  let height = EDIT_HEIGHTS[0];
  /** 피스 순서에서 고른 자리(없으면 null: 새 피스는 맨 뒤에) */
  let selected = /** @type {number | null} */ (null);
  const history = createHistory();
  const snapshot = () => ({ cells: cells.slice(), pieces });
  /** 편집기가 열려 있을 때만 단축키(Ctrl+Z)를 받는다 */
  let undoKeys = /** @type {null | ((redo: boolean) => void)} */ (null);

  dialog.addEventListener("keydown", event => {
    if (!undoKeys || !dialog.querySelector(".puzzle-editor") || !(event.ctrlKey || event.metaKey) || event.altKey)
      return;
    const key = event.key.toLowerCase();
    if (key !== "z" && key !== "y") return;
    event.preventDefault();
    undoKeys(key === "y" || event.shiftKey);
  });
  // 목록에서 편집기로 바꿀 때는 같은 대화상자를 닫았다 바로 다시 연다. close 이벤트는 그 뒤에 오므로 열려 있으면 그대로 둔다
  dialog.addEventListener("close", () => {
    if (!dialog.open) undoKeys = null;
  });

  return {
    load(code) {
      const puzzle = decodePuzzle(code);
      if (!puzzle) return;
      cells = puzzle.cells;
      pieces = puzzle.pieces;
      cleared = null;
      selected = null;
      height = fitHeight(cells);
      history.clear();
    },
    markCleared(code) {
      if (code === encodePuzzle({ cells, pieces })) cleared = code;
    },
    open() {
      const notice = el("p", { class: "notice-slot", role: "status" });
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
      const paintTiles = () => {
        tiles.forEach((tile, i) => tile.setAttribute("aria-pressed", String(Boolean(cells[i]))));
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
        iconButton({ icon, label, "data-shift": `${dx},${dy}`, onClick: () => edit(() => shiftCells(cells, dx, dy)) })
      );
      const mirror = iconButton({
        icon: "mirror",
        label: t("좌우 뒤집기"),
        onClick: () => edit(() => mirrorCells(cells)),
      });
      const clear = confirmButton({
        label: t("판 지우기"),
        confirmLabel: t("정말 지우기"),
        size: "s",
        id: "puzzle-clear",
        onConfirm: () => edit(() => new Uint8Array(PUZZLE_CELLS)),
      });

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
      const templates = dropdown({
        id: "puzzle-template",
        label: t("시작 틀"),
        value: "",
        options: [
          { value: "", label: t("시작 틀 고르기") },
          { value: "empty", label: t("빈 판") },
          { value: "t-slot", label: t("T 자리") },
          { value: "well", label: t("4줄 우물") },
          ...COPYABLE_STAGES.map(p => ({
            value: `stage-${p.number}`,
            label: t("퍼즐 {n}단계 복사", { n: p.number }),
          })),
        ],
        onChange: id => {
          const start = id ? template(id) : null;
          if (!start) return;
          history.record(snapshot());
          cells = start.cells;
          pieces = start.pieces;
          selected = null;
          height = fitHeight(cells);
          layoutBoard();
          changed();
        },
      });

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
        const code = encodePuzzle({ cells, pieces });
        trial.disabled = !code;
        copy.disabled = !cleared || cleared !== code;
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
        paintTiles();
        notice.textContent = copy.disabled
          ? t("시험 플레이에서 판을 비우면 링크를 공유할 수 있어요.")
          : t("퍼즐을 풀었어요. 이제 링크를 공유할 수 있어요.");
      };
      const changed = () => {
        cleared = null;
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

      trial.addEventListener("click", () => {
        const code = encodePuzzle({ cells, pieces });
        if (!code) return;
        dialog.close();
        onTry(code);
      });
      copy.addEventListener("click", async () => {
        const code = cleared;
        if (!code) return;
        const url = new URL(location.href);
        url.hash = `puzzle=${code}`;
        try {
          await navigator.clipboard.writeText(url.href);
          if (cleared === code && dialog.contains(link)) notice.textContent = t("퍼즐 링크를 복사했어요.");
        } catch {
          if (cleared !== code || !dialog.open || !dialog.contains(link)) return;
          link.value = url.href;
          link.hidden = false;
          link.focus();
          link.select();
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
            text: t("지금은 Modern 규칙, 홀드 없이 판 비우기 퍼즐을 만들 수 있어요."),
          }),
          el(
            "div",
            { class: "puzzle-editor-row" },
            el("span", { class: "puzzle-editor-label", text: t("시작 틀") }),
            templates
          ),
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
          ),
          el(
            "div",
            { class: "puzzle-editor-seq-head" },
            el("span", { class: "puzzle-editor-label", text: t("피스 순서") }),
            count,
            el("span", { class: "puzzle-editor-seq-actions" }, moveBack, moveForward, remove)
          ),
          sequence,
          el(
            "p",
            { class: "field-help" },
            t("피스를 눌러 고르면 그 뒤에 넣고, 앞뒤로 옮기거나 뺄 수 있어요(Alt+화살표·Delete).")
          ),
          el(
            "div",
            {
              class: "puzzle-editor-pieces",
              role: "group",
              "aria-label": t("피스 추가 (최대 {n}개)", { n: MAX_PUZZLE_PIECES }),
            },
            ...add
          ),
          link
        ),
        notice,
        actions: [trial, copy],
        closeId: "puzzle-editor-close",
      });
      layoutBoard();
      refresh();
      dialog.showModal();
      tiles[focusIndex].focus();
    },
  };
};
