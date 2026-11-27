import { t } from "../i18n/index.js";
import { recentDailyKeys } from "../modes/daily.js";
import { dailyPuzzleLevel, dailyPuzzleTitle } from "../modes/daily-puzzle.js";
import { goalLabel } from "../modes/custom-puzzle.js";
import { button, dropdown, menuRow } from "./components.js";
import { el, fillDialog } from "./dom.js";

const PAGE_SIZE = 14;
const ARCHIVE_DAYS = 90;
const GOALS = [
  ["pc", "판 비우기"],
  ["quad", "4줄 만들기"],
  ["combo", "콤보 이어 가기"],
  ["spin", "T스핀"],
  ["other", "끼워 넣기"],
];

/** 생성기가 실제로 선택한 목표와 산정한 난이도로 검색한다. */
export const createDailyPuzzleArchive = ({ dialog, fetchDay, progress, onPick, onBack }) => {
  let page = 0;
  const filters = { goal: "", level: "", status: "" };
  let results = [];
  let loading = false;
  let missing = false;

  const open = () => {
    const dates = recentDailyKeys(new Date(), ARCHIVE_DAYS).slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    results = [];
    missing = false;
    loading = true;
    const status = el("p", { class: "notice-slot", role: "status" });
    const list = el("div", { class: "menu-list" });
    const render = () => {
      const rows = results.filter(day => {
        const kind = day.goal.kind;
        const category = ["mini", "tsd", "tst"].includes(kind) ? "spin" : kind === "tuck" ? "other" : kind;
        return (
          (!filters.goal || category === filters.goal) &&
          (!filters.level || String(day.level) === filters.level) &&
          (!filters.status || progress.solved(day.key) === (filters.status === "solved"))
        );
      });
      list.replaceChildren(
        ...rows.map(day =>
          menuRow({
            title: dailyPuzzleTitle(day.family, day.key, day.cells),
            desc: [
              goalLabel(day.goal),
              dailyPuzzleLevel(day.level),
              progress.solved(day.key) ? t("완료") : t("미완료"),
            ].join(" · "),
            meta: day.key,
            "data-archive-date": day.key,
            onClick: () => onPick(day.key),
          })
        )
      );
      status.textContent = loading
        ? t("지난 퍼즐을 불러오는 중…")
        : missing
          ? t("일부 날짜의 퍼즐을 불러오지 못했어요.")
          : rows.length
            ? t("{n}개 퍼즐", { n: rows.length })
            : t("이 기간에 조건에 맞는 퍼즐이 없어요.");
    };
    const filter = (key, label, options) =>
      dropdown({
        id: `daily-archive-${key}`,
        label,
        value: filters[key],
        options: [{ value: "", label }, ...options],
        onChange: value => {
          filters[key] = value;
          render();
        },
      });
    const navigation = (label, offset, disabled) =>
      button({
        label,
        size: "s",
        disabled,
        onClick: () => {
          page += offset;
          open();
        },
      });
    fillDialog(dialog, {
      title: t("지난 퍼즐"),
      body: el(
        "div",
        { class: "daily-puzzle-body", "data-daily-archive": "" },
        el(
          "div",
          { class: "daily-archive-dates" },
          navigation(t("더 최근 날짜"), -1, page === 0),
          el("p", { class: "field-help num", text: `${dates.at(-1)} – ${dates[0]}` }),
          navigation(t("더 오래된 날짜"), 1, (page + 1) * PAGE_SIZE >= ARCHIVE_DAYS)
        ),
        el(
          "div",
          { class: "daily-archive-filters" },
          filter(
            "goal",
            t("모든 목표"),
            GOALS.map(([value, label]) => ({ value, label: t(label) }))
          ),
          filter(
            "level",
            t("모든 난이도"),
            [1, 2, 3].map(level => ({ value: String(level), label: dailyPuzzleLevel(level) }))
          ),
          filter("status", t("모든 완료 상태"), [
            { value: "unsolved", label: t("미완료") },
            { value: "solved", label: t("완료") },
          ])
        ),
        list
      ),
      notice: status,
      actions: [button({ label: t("최근 7일"), onClick: onBack })],
      closeId: "daily-puzzle-close",
    });
    dialog.querySelector("#daily-puzzle-close")?.focus();
    render();

    const load = async () => {
      for (const date of dates) {
        const day = await fetchDay(date);
        if (!dialog.open || !list.isConnected) return;
        if (day) results.push(day);
        else missing = true;
      }
      loading = false;
      render();
    };
    void load();
  };

  return { open };
};
