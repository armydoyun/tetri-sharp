// 판 통계 대화상자: 결과 화면의 "통계"에서 연다. 엔진이 센 값(state.tally)을 보여 주기만 한다.
import { formatScore, formatTime } from "../modes/format.js";
import { el, fillDialog } from "./dom.js";

const CLEAR_ROWS = [
  ["none-1", "1줄"],
  ["none-2", "2줄"],
  ["none-3", "3줄"],
  ["none-4", "QUAD (4줄)"],
  ["mini-0", "MINI T-SPIN"],
  ["mini-1", "MINI T-SPIN SINGLE"],
  ["mini-2", "MINI T-SPIN DOUBLE"],
  ["full-0", "T-SPIN"],
  ["full-1", "T-SPIN SINGLE"],
  ["full-2", "T-SPIN DOUBLE"],
  ["full-3", "T-SPIN TRIPLE"],
];

/** 통계 표의 줄들 — 판마다 같은 항목이 같은 순서로 나온다(원칙 2) */
export const statRows = state => {
  const t = state.tally;
  const seconds = state.frame / 60;
  const per = (n, d) => (d ? (n / d).toFixed(2) : "0.00");
  return {
    play: [
      ["시간", formatTime(state.frame)],
      ["점수", formatScore(state.score)],
      ["피스", String(state.stats.pieces)],
      ["줄", String(state.stats.lines)],
      ["PPS (초당 피스)", per(state.stats.pieces, seconds)],
      ["키 입력", String(t.inputs)],
      ["KPP (피스당 입력)", per(t.inputs, state.stats.pieces)],
      ["좌우 이동", String(t.moves)],
      ["회전", String(t.rotations)],
      ["회전 보정(킥)", String(t.kicks)],
      ["홀드", String(t.holds)],
      ["피네스 실수 (판정한 피스)", state.finesse ? `${state.finesse.faults} (${state.finesse.judged})` : "—"],
    ],
    clears: [
      ...CLEAR_ROWS.map(([key, label]) => [label, String(t.clears[key] ?? 0)]),
      ["퍼펙트 클리어", String(t.perfect)],
      ["최대 콤보", String(Math.max(0, t.maxCombo))],
      ["최대 B2B", String(t.maxB2b)],
    ],
  };
};

const table = (title, rows) =>
  el(
    "section",
    { class: "field-section" },
    el("h3", { text: title }),
    el(
      "dl",
      { class: "stat-list" },
      ...rows.flatMap(([k, v]) => [
        el("dt", { text: k }),
        el("dd", { class: v === "0" ? "num is-zero" : "num", text: v }),
      ])
    )
  );

/** @param {{ dialog: HTMLDialogElement }} options */
export const createStatsUI = ({ dialog }) => {
  const notice = el("p", { class: "notice-slot", role: "status" });
  return {
    /** @param {any} state 끝난 판의 엔진 상태 */
    open(state, subtitle = "") {
      const rows = statRows(state);
      notice.textContent = subtitle;
      fillDialog(dialog, {
        title: "이번 판 통계",
        body: el("div", { class: "stat-columns" }, table("플레이", rows.play), table("줄 삭제", rows.clears)),
        notice,
        actions: [],
        closeId: "stats-close",
      });
      dialog.showModal();
      /** @type {HTMLElement | null} */ (dialog.querySelector("#stats-close"))?.focus();
    },
    get isOpen() {
      return dialog.open;
    },
  };
};
