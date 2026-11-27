import { t } from "../i18n/index.js";
import { el } from "./dom.js";

const mark = () => el("span", { class: "goal-mark" });

/**
 * 목표 견본과 게임에서 쓰는 진행 표시. 실제 달성 여부는 퍼즐 판정이 정한다.
 * @param {{ kind: string, segments: number, spin?: boolean, title?: string }} options
 */
export const createGoalDisplay = ({ kind, segments, spin = false, title }) => {
  const status = el("p", { class: "goal-status" });
  const value = el("p", { class: "goal-value" });
  const bars = Array.from({ length: segments }, mark);
  const tCells = spin ? Array.from({ length: 4 }, mark) : [];
  const marks = el("div", { class: "goal-marks", "data-kind": kind, "aria-hidden": "true" });
  marks.style.setProperty("--goal-segments", String(segments));
  if (spin) marks.append(el("div", { class: "goal-t" }, ...tCells));
  marks.append(el("div", { class: "goal-bars" }, ...bars));

  const hud = el("div", { class: "goal-hud" });
  const announcement = title ? el("p", { class: "sr-only", role: "status", "aria-atomic": "true" }) : null;
  if (title) hud.append(el("h2", { class: "goal-title", text: title }));
  hud.append(status, marks, value);
  if (announcement) hud.append(announcement);

  return {
    hud,
    /** @param {{ status: string, value: string, filled: number, complete: boolean, celebrate?: boolean }} progress */
    update(progress) {
      status.textContent = progress.status;
      value.textContent = progress.value;
      hud.dataset.complete = String(progress.complete);
      bars.forEach((bar, index) => (bar.dataset.filled = String(index < progress.filled)));
      tCells.forEach(cell => (cell.dataset.filled = String(progress.complete)));
      if (announcement) {
        const text = t("{goal} · {status} · {value}", { goal: title, status: progress.status, value: progress.value });
        if (announcement.textContent !== text) announcement.textContent = text;
      }
      for (const animation of hud.getAnimations()) animation.cancel();
      if (progress.celebrate && progress.complete && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
        hud.animate(
          [
            { outline: "var(--border-w) solid var(--accent)", outlineOffset: "calc(-1 * var(--border-w))" },
            { outline: "var(--border-w) solid transparent", outlineOffset: "calc(-1 * var(--border-w))" },
          ],
          { duration: 360, easing: "ease-out" }
        );
      }
    },
  };
};
