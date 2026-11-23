// 업적 대화상자: 묶음(플레이 · 모드 · CPU 대전 · 퍼즐)마다 이룬 것은 날짜와 체크, 아직은 흐리게.
import { ACHIEVEMENTS, ACHIEVEMENT_GROUPS } from "../storage/achievements.js";
import { el, fillDialog } from "./dom.js";
import { icon } from "./icons.js";
import { t } from "../i18n/index.js";

const formatDate = iso => iso.slice(0, 10).replace(/-/g, ".");

/**
 * @param {{ dialog: HTMLDialogElement, achievements: ReturnType<typeof import("../storage/achievements.js").createAchievements> }} options
 */
export const createAchievementsUI = ({ dialog, achievements }) => {
  const notice = el("p", { class: "notice-slot", role: "status" });
  return {
    open() {
      const done = achievements.unlocked();
      const count = ACHIEVEMENTS.filter(a => done[a.id]).length;
      const body = el(
        "div",
        { class: "achievement-groups" },
        ...ACHIEVEMENT_GROUPS.map(([group, title]) => {
          const items = ACHIEVEMENTS.filter(a => a.group === group);
          return el(
            "section",
            { class: "achievement-group" },
            el(
              "h3",
              { class: "achievement-group-title" },
              el("span", { text: title }),
              el("small", { class: "num", text: `${items.filter(a => done[a.id]).length} / ${items.length}` })
            ),
            el(
              "ul",
              { class: "achievement-list" },
              ...items.map(a =>
                el(
                  "li",
                  { class: `achievement${done[a.id] ? " is-done" : ""}`, "data-achievement": a.id },
                  el(
                    "span",
                    { class: "achievement-mark", "aria-hidden": "true" },
                    ...(done[a.id] ? [icon("check")] : [])
                  ),
                  el(
                    "span",
                    { class: "achievement-text" },
                    el("strong", { text: a.name }),
                    el("small", { text: a.description })
                  ),
                  el("span", {
                    class: "achievement-date num",
                    text: done[a.id] ? formatDate(done[a.id]) : "",
                    "aria-label": done[a.id] ? t("{date}에 달성", { date: formatDate(done[a.id]) }) : t("아직"),
                  })
                )
              )
            )
          );
        })
      );
      notice.textContent = t("{done} / {total} 달성 · 이 기기에 저장되고 백업에 들어가요", {
        done: count,
        total: ACHIEVEMENTS.length,
      });
      fillDialog(dialog, { title: t("업적"), body, notice, actions: [], closeId: "achievements-close" });
      dialog.showModal();
      /** @type {HTMLElement | null} */ (dialog.querySelector("#achievements-close"))?.focus();
    },
    get isOpen() {
      return dialog.open;
    },
  };
};
