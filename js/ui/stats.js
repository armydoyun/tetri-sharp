// 판 통계 대화상자: 결과 화면의 "통계"에서 연다. 엔진이 센 값(state.tally)을 보여 주기만 한다.
import { formatScore, formatTime } from "../modes/format.js";
import { el, fillDialog } from "./dom.js";
import { button } from "./components.js";
import { t } from "../i18n/index.js";
import { clearName } from "../rules/scoring/guideline.js";

const CLEAR_ROWS = [
  ["none-1", t("1줄")],
  ["none-2", t("2줄")],
  ["none-3", t("3줄")],
  ["none-4", t("QUAD (4줄)")],
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
  const tally = state.tally;
  const seconds = state.frame / 60;
  const per = (n, d) => (d ? (n / d).toFixed(2) : "0.00");
  return {
    play: [
      [t("시간"), formatTime(state.frame)],
      [t("점수"), formatScore(state.score)],
      [t("피스"), String(state.stats.pieces)],
      [t("줄"), String(state.stats.lines)],
      [t("PPS (초당 피스)"), per(state.stats.pieces, seconds)],
      [t("키 입력"), String(tally.inputs)],
      [t("KPP (피스당 입력)"), per(tally.inputs, state.stats.pieces)],
      [t("좌우 이동"), String(tally.moves)],
      [t("회전"), String(tally.rotations)],
      [t("회전 보정(킥)"), String(tally.kicks)],
      [t("홀드"), String(tally.holds)],
      [t("피네스 실수 (판정한 피스)"), state.finesse ? `${state.finesse.faults} (${state.finesse.judged})` : "—"],
    ],
    clears: [
      ...CLEAR_ROWS.map(([key, label]) => [label, String(tally.clears[key] ?? 0)]),
      ...Object.entries(tally.clears).flatMap(([key, count]) => {
        const match = /^([IJLOSZ])-([0-4])$/.exec(key);
        return match
          ? [[clearName({ lines: Number(match[2]), tspin: "none", spinPiece: match[1] }), String(count)]]
          : [];
      }),
      [t("퍼펙트 클리어"), String(tally.perfect)],
      [t("최대 콤보"), String(Math.max(0, tally.maxCombo))],
      [t("최대 B2B"), String(tally.maxB2b)],
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
    open(state, subtitle = "", canReviewSplits = false) {
      const rows = statRows(state);
      const clears = rows.clears.filter(([, value]) => value !== "0");
      const zero = rows.clears.filter(([, value]) => value === "0");
      // 한 번도 없었던 종류는 접어 둔다. 줄을 아예 안 지웠으면 빈 표 대신 그렇다고 말한다.
      const clearance = zero.length
        ? el(
            "div",
            {},
            clears.length
              ? table(t("줄 삭제"), clears)
              : el(
                  "section",
                  { class: "field-section" },
                  el("h3", { text: t("줄 삭제") }),
                  el("p", { class: "field-help", text: t("이번 판에서 지운 줄이 없어요.") })
                ),
            el(
              "details",
              { class: "stat-details" },
              el("summary", { text: t("나오지 않은 종류 {n}개 보기", { n: zero.length }) }),
              table(t("나오지 않은 종류"), zero)
            )
          )
        : table(t("줄 삭제"), clears);
      const review = button({ label: t("구간 기록 보기"), icon: "chart", id: "stats-splits" });
      review.addEventListener("click", () => dialog.close("splits"));
      dialog.returnValue = "";
      notice.textContent = subtitle;
      fillDialog(dialog, {
        title: t("이번 판 통계"),
        body: el("div", { class: "stat-columns" }, table(t("플레이"), rows.play), clearance),
        notice,
        actions: canReviewSplits ? [review] : [],
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
