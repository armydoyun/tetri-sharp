// 퍼즐 대화상자: [기본 퍼즐 | 내 퍼즐 | 받은 퍼즐] 탭.
//  - 기본 퍼즐: 장마다 번호 칸 격자. 깬 단계는 체크, 다음에 할 단계는 강조.
//  - 내 퍼즐: 만든 퍼즐 목록(누르면 편집) + 플레이 · 링크 복사 · 지우기
//  - 받은 퍼즐: 링크로 연 퍼즐(누르면 플레이) + 복사해서 편집 · 지우기, 풀었는지와 가장 빠른 시간
import { CHAPTERS, KIND_NAMES, PUZZLES } from "../modes/puzzles.js";
import {
  CHECKED_AUTO,
  CHECKED_TRIED,
  canSearch,
  decodePuzzle,
  goalLabel,
  ruleSummary,
} from "../modes/custom-puzzle.js";
import { formatTime } from "../modes/format.js";
import { MAX_MADE, MAX_RECEIVED } from "../storage/custom-puzzles.js";
import { el, fillDialog } from "./dom.js";
import { button, confirmButton, iconButton, menuRow, tabBar, textInput } from "./components.js";
import { icon } from "./icons.js";
import { t } from "../i18n/index.js";

/** @typedef {"stages" | "mine" | "received"} PuzzleTab */

/** 만든 퍼즐 이름: 제목, 없으면 목표 · 피스 수 @param {import("../modes/custom-puzzle.js").FullPuzzle} p */
const customPuzzleName = p =>
  p.title || t("{goal} · {n}피스", { goal: goalLabel(p.goal), n: p.pieces.length + (p.holdStart ? 1 : 0) });

/** 확인 표시 글 @param {number} checked */
const checkedLabel = checked =>
  checked & CHECKED_TRIED ? t("직접 풀어 봄") : checked & CHECKED_AUTO ? t("자동 확인") : t("확인 안 됨");

/** 날짜 짧게(이 기기 시간대) @param {string} iso */
const shortDate = iso => {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
};

/**
 * @param {{
 *   dialog: HTMLDialogElement,
 *   progress: ReturnType<typeof import("../modes/puzzles.js").createPuzzleProgress>,
 *   customs: ReturnType<typeof import("../storage/custom-puzzles.js").createCustomPuzzles>,
 *   onPick: (puzzle: any) => void,
 *   onCreate: () => void,
 *   onEdit: (id: string) => void,
 *   onPlayMade: (id: string) => void,
 *   onPlayReceived: (code: string) => void,
 *   onCopyReceived: (code: string) => void,
 * }} options
 */
/** 장마다 한 줄 목표 */
const CHAPTER_GOALS = Object.freeze({
  pc: t("아래 두 줄을 모두 지워 판 비우기"),
  quad: t("우물을 남겨 채운 뒤 마지막 I로 4줄"),
  combo: t("피스마다 한 줄 이상 지워 콤보 잇기"),
  tuck: t("내린 뒤 처마 아래로 밀어 넣어 2줄"),
  spin: t("틈 앞에서 돌려 끼워 넣어 2줄"),
  mini: t("T를 마지막에 돌려 넣어 Mini로 한 줄"),
  tsd: t("T 하나로 T-spin Double"),
  tst: t("T 하나로 T-spin Triple"),
});

export const createPuzzleUI = ({
  dialog,
  progress,
  customs,
  onPick,
  onCreate,
  onEdit,
  onPlayMade,
  onPlayReceived,
  onCopyReceived,
}) => {
  const notice = el("p", { class: "notice-slot", role: "status" });
  /** @type {PuzzleTab} */
  let tab = "stages";
  /** 링크 복사가 막혔을 때 직접 고르게 보여 주는 칸 */
  const link = textInput({
    id: "custom-puzzle-list-link",
    type: "url",
    readOnly: true,
    hidden: true,
    "aria-label": t("공유 링크"),
  });

  /** 만든 퍼즐 줄: [이름·설명·날짜 >] [플레이] [링크] [지우기] */
  const madeRow = item => {
    const p = decodePuzzle(item.code);
    if (!p) return null;
    const shareable = Boolean(p.checked & CHECKED_TRIED) || (Boolean(p.checked & CHECKED_AUTO) && canSearch(p));
    const row = el(
      "div",
      { class: "custom-puzzle-row", "data-made": item.id },
      menuRow({
        title: customPuzzleName(p),
        desc: [goalLabel(p.goal), ruleSummary(p), checkedLabel(p.checked)].filter(Boolean).join(" · "),
        meta: shortDate(item.updated),
        onClick: () => {
          dialog.close();
          onEdit(item.id);
        },
        "data-made-edit": item.id,
      }),
      el(
        "div",
        { class: "custom-puzzle-actions" },
        iconButton({
          icon: "play",
          label: t("플레이"),
          "data-made-play": item.id,
          onClick: () => {
            dialog.close();
            onPlayMade(item.id);
          },
        }),
        iconButton({
          icon: "link",
          label: shareable ? t("링크 복사") : t("풀 수 있는지 확인하거나 직접 풀어야 공유할 수 있어요"),
          disabled: !shareable,
          "data-made-link": item.id,
          onClick: () => copyLink(item.code),
        }),
        confirmButton({
          label: t("지우기"),
          confirmLabel: t("정말"),
          size: "s",
          "data-made-delete": item.id,
          onConfirm: () => {
            customs.remove(item.id);
            render();
            notice.textContent = t("퍼즐을 지웠어요.");
          },
        })
      )
    );
    return row;
  };

  /** 받은 퍼즐 줄: [이름·설명·푼 기록 >] [복사해서 편집] [지우기] */
  const receivedRow = item => {
    const p = decodePuzzle(item.code);
    if (!p) return null;
    return el(
      "div",
      { class: "custom-puzzle-row", "data-received": item.code },
      menuRow({
        title: customPuzzleName(p),
        desc: [goalLabel(p.goal), ruleSummary(p), p.desc].filter(Boolean).join(" · "),
        meta: item.solved
          ? item.hinted
            ? t("풀었어요(첫 수 봄)")
            : t("풀었어요 {time}", { time: formatTime(item.best ?? 0) })
          : t("아직"),
        onClick: () => {
          dialog.close();
          onPlayReceived(item.code);
        },
        "data-received-play": "",
      }),
      el(
        "div",
        { class: "custom-puzzle-actions" },
        iconButton({
          icon: "edit",
          label: t("복사해서 편집"),
          "data-received-copy": "",
          onClick: () => {
            dialog.close();
            onCopyReceived(item.code);
          },
        }),
        confirmButton({
          label: t("지우기"),
          confirmLabel: t("정말"),
          size: "s",
          "data-received-delete": "",
          onConfirm: () => {
            customs.removeReceived(item.code);
            render();
            notice.textContent = t("받은 퍼즐을 지웠어요.");
          },
        })
      )
    );
  };

  const copyLink = async code => {
    const url = new URL(location.href);
    url.hash = `puzzle=${code}`;
    try {
      await navigator.clipboard.writeText(url.href);
      notice.textContent = t("퍼즐 링크를 복사했어요.");
    } catch {
      if (!dialog.open) return;
      link.value = url.href;
      link.hidden = false;
      link.focus();
      link.select();
      notice.textContent = t("자동 복사가 막혔어요. 선택된 링크를 직접 복사해 주세요.");
    }
  };

  let render = () => {};
  return {
    /**
     * @param {number} [focusNumber] 포커스를 둘 단계(게임에서 "퍼즐 목록으로" 돌아왔을 때 방금 한 단계)
     * @param {PuzzleTab} [openTab] 열 탭(만든 퍼즐·받은 퍼즐에서 돌아왔을 때)
     */
    open(focusNumber, openTab) {
      if (openTab) tab = openTab;
      else if (focusNumber) tab = "stages";
      const cleared = progress.cleared();
      const next = progress.next().number;
      const tile = p => {
        const done = cleared.has(p.id);
        const b = el(
          "button",
          {
            type: "button",
            class: `puzzle-tile${done ? " is-done" : ""}${p.number === next && !done ? " is-next" : ""}`,
            "data-puzzle": String(p.number),
            "aria-label": t("{n}단계 · {kind} · 피스 {count}개{done}", {
              n: p.number,
              kind: KIND_NAMES[p.kind],
              count: p.pieces.length,
              done: done ? ` · ${t("깸")}` : "",
            }),
          },
          el("strong", { class: "num", text: String(p.number) }),
          el("small", { text: t("{n}피스", { n: p.pieces.length }) }),
          ...(done ? [icon("check")] : [])
        );
        b.addEventListener("click", () => {
          dialog.close();
          onPick(p);
        });
        return b;
      };
      // 장마다: 제목(깬 수 / 단계 수) + 번호 칸 격자. 장 안에서는 피스가 적은 것부터.
      const grid = el(
        "div",
        { class: "puzzle-chapters" },
        ...CHAPTERS.map(kind => {
          const stages = PUZZLES.filter(p => p.kind === kind);
          const done = stages.filter(p => cleared.has(p.id)).length;
          return el(
            "section",
            { class: "puzzle-chapter", "data-chapter": kind },
            el(
              "h3",
              { class: "puzzle-chapter-title" },
              el("span", { text: KIND_NAMES[kind] }),
              el("small", { class: "num", text: `${done} / ${stages.length}` })
            ),
            // 장마다 한 줄 목표(예전: 맨 위 긴 문단 하나 — 장이 늘며 휴대폰에서 일곱 줄이 됐다, 4차 평가 U51)
            el("p", { class: "puzzle-chapter-goal", text: CHAPTER_GOALS[kind] }),
            el("div", { class: "puzzle-grid" }, ...stages.map(tile))
          );
        })
      );
      const create = button({ id: "puzzle-create", label: t("퍼즐 만들기") });
      create.addEventListener("click", () => {
        dialog.close();
        onCreate();
      });
      const stagesBody = () => {
        notice.textContent = t("{done} / {total}단계 깸 · 중력 없음, 정해진 피스만 써요", {
          done: cleared.size,
          total: PUZZLES.length,
        });
        return el("div", {}, el("p", { class: "field-help", text: t("장마다 쉬운 것부터 차례로 풀어요.") }), grid);
      };
      const mineBody = () => {
        const rows = customs.made().map(madeRow).filter(Boolean);
        notice.textContent = t("만든 퍼즐 {n} / {max} · 편집기에서 고치면 저절로 저장돼요", {
          n: rows.length,
          max: MAX_MADE,
        });
        return el(
          "div",
          {},
          el("p", {
            class: "field-help",
            text: t("누르면 편집해요. 확인했거나 직접 풀어 본 퍼즐은 링크로 보낼 수 있어요."),
          }),
          rows.length
            ? el("div", { class: "menu-list custom-puzzle-list" }, ...rows)
            : el("p", {
                class: "custom-puzzle-empty",
                text: t("아직 만든 퍼즐이 없어요. 아래 '퍼즐 만들기'로 시작해요."),
              }),
          link
        );
      };
      const receivedBody = () => {
        const list = customs.received();
        const rows = list.map(receivedRow).filter(Boolean);
        notice.textContent = t("받은 퍼즐 {n} / {max} · 가득 차면 가장 오래된 것부터 지워져요", {
          n: rows.length,
          max: MAX_RECEIVED,
        });
        return el(
          "div",
          {},
          el("p", { class: "field-help", text: t("링크로 연 퍼즐이 여기에 남아요. 누르면 풀어요.") }),
          rows.length
            ? el("div", { class: "menu-list custom-puzzle-list" }, ...rows)
            : el("p", { class: "custom-puzzle-empty", text: t("아직 받은 퍼즐이 없어요.") })
        );
      };
      render = () => {
        link.hidden = true;
        link.value = "";
        const tabs = tabBar({
          tabs: [
            ["stages", t("기본 퍼즐")],
            ["mine", t("내 퍼즐")],
            ["received", t("받은 퍼즐")],
          ],
          active: tab,
          onSelect: next => {
            tab = /** @type {PuzzleTab} */ (next);
            render();
            /** @type {HTMLElement | null} */ (dialog.querySelector(`.dialog-tabs [data-value="${next}"]`))?.focus();
          },
        });
        fillDialog(dialog, {
          title: t("퍼즐"),
          tabs,
          body: tab === "mine" ? mineBody() : tab === "received" ? receivedBody() : stagesBody(),
          notice,
          actions: [create],
          closeId: "puzzle-close",
        });
      };
      render();
      dialog.showModal();
      if (tab === "stages")
        /** @type {HTMLElement | null} */ (dialog.querySelector(`[data-puzzle="${focusNumber ?? next}"]`))?.focus();
      /** @type {HTMLElement | null} */ else dialog.querySelector(`.dialog-tabs [data-value="${tab}"]`)?.focus();
    },
    get isOpen() {
      return dialog.open;
    },
  };
};
