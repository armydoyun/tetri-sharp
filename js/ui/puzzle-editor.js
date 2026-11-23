import { WIDTH } from "../core/board.js";
import { PIECE_TYPES } from "../core/pieces.js";
import { t } from "../i18n/index.js";
import { decodePuzzle, encodePuzzle, MAX_PUZZLE_PIECES, PUZZLE_CELLS } from "../modes/custom-puzzle.js";
import { el, fillDialog } from "./dom.js";
import { button, textInput } from "./components.js";

/** @param {{ dialog: HTMLDialogElement, onTry: (code: string) => void }} options */
export const createPuzzleEditor = ({ dialog, onTry }) => {
  const cells = new Uint8Array(PUZZLE_CELLS);
  let pieces = "";
  let cleared = null;

  return {
    load(code) {
      const puzzle = decodePuzzle(code);
      if (!puzzle) return;
      cells.set(puzzle.cells);
      pieces = puzzle.pieces;
      cleared = null;
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
      const sequence = el("output", { class: "num", "aria-live": "polite" });
      const remove = button({ label: t("마지막 피스 빼기"), size: "s" });
      const add = PIECE_TYPES.map(piece => button({ label: piece, size: "s", "data-piece": piece }));
      const refresh = () => {
        const code = encodePuzzle({ cells, pieces });
        trial.disabled = !code;
        copy.disabled = !cleared || cleared !== code;
        link.hidden = true;
        link.value = "";
        sequence.textContent = pieces.split("").join(" ") || t("피스를 추가하세요");
        for (const piece of add) piece.disabled = pieces.length >= MAX_PUZZLE_PIECES;
        remove.disabled = pieces.length === 0;
        notice.textContent = copy.disabled
          ? t("시험 플레이에서 판을 비우면 링크를 공유할 수 있어요.")
          : t("퍼즐을 풀었어요. 이제 링크를 공유할 수 있어요.");
      };
      const changed = () => {
        cleared = null;
        refresh();
      };
      const tiles = Array.from(cells, (_, index) => {
        const cell = el("button", {
          type: "button",
          class: "puzzle-editor-cell",
          tabIndex: index === cells.length - WIDTH ? 0 : -1,
          "aria-label": t("{row}행 {col}열", { row: Math.floor(index / WIDTH) + 1, col: (index % WIDTH) + 1 }),
          "aria-pressed": String(Boolean(cells[index])),
          "data-cell": String(index),
        });
        cell.addEventListener("focus", () => {
          for (const tile of tiles) tile.tabIndex = tile === cell ? 0 : -1;
        });
        cell.addEventListener("click", () => {
          cells[index] = 1 - cells[index];
          cell.setAttribute("aria-pressed", String(Boolean(cells[index])));
          changed();
        });
        cell.addEventListener("keydown", event => {
          const offset = { ArrowUp: -WIDTH, ArrowDown: WIDTH, ArrowLeft: -1, ArrowRight: 1 }[event.key];
          if (offset === undefined) return;
          event.preventDefault();
          const column = (index % WIDTH) + (Math.abs(offset) === 1 ? offset : 0);
          if (column >= 0 && column < WIDTH) tiles[index + offset]?.focus();
        });
        return cell;
      });
      for (const piece of add)
        piece.addEventListener("click", () => {
          pieces += piece.dataset.piece;
          changed();
          if (piece.disabled) remove.focus();
        });
      remove.addEventListener("click", () => {
        pieces = pieces.slice(0, -1);
        changed();
        if (remove.disabled) add[0].focus();
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
          {},
          el("p", {
            class: "field-help",
            text: t("칸을 눌러 블록을 채우거나 지우세요. Modern 규칙, 홀드 없이 판 비우기."),
          }),
          el("div", { class: "puzzle-editor-board", role: "group", "aria-label": t("시작 보드") }, ...tiles),
          el("p", { class: "puzzle-editor-sequence" }, t("피스 순서"), " ", sequence),
          el(
            "div",
            {
              class: "puzzle-editor-pieces",
              role: "group",
              "aria-label": t("피스 추가 (최대 {n}개)", { n: MAX_PUZZLE_PIECES }),
            },
            ...add,
            remove
          ),
          link
        ),
        notice,
        actions: [trial, copy],
        closeId: "puzzle-editor-close",
      });
      refresh();
      dialog.showModal();
      tiles[cells.length - WIDTH].focus();
    },
  };
};
