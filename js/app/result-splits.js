import { t } from "../i18n/index.js";
import { formatTime } from "../modes/format.js";
import { analyzeSplits, formatDelta } from "../modes/splits.js";
import { button } from "../ui/components.js";
import { formatSplitComparison } from "./results.js";

/**
 * @param {{
 *   root: HTMLElement,
 *   replayView: ReturnType<typeof import("./replay-player.js").createReplayPlayer>,
 *   sceneView: ReturnType<typeof import("./scene-practice.js").createScenePractice>,
 * }} options
 */
export const createResultSplits = ({ root, replayView, sceneView }) => {
  const details = /** @type {HTMLDetailsElement} */ (root.querySelector("#results-splits"));
  const table = details.querySelector("table");
  const summary = details.querySelector("summary");
  const noteElement = root.querySelector("#results-split-note");
  const practice = /** @type {HTMLButtonElement} */ (root.querySelector("#results-practice-scene"));
  const practiceLabel = practice.querySelector(".btn-label");
  const raceButton = /** @type {HTMLButtonElement} */ (root.querySelector("#results-race-best"));
  return ({ milestones, splits, bestSplits, replay, canRace, recommendPractice }) => {
    details.hidden = !milestones;
    details.open = false;
    practice.hidden = true;
    practice.onclick = null;
    if (!milestones) return;

    const { rows, slowest } = analyzeSplits(milestones, splits, bestSplits);
    const hasComparison = rows.some(row => row.delta !== null);
    const comparison = slowest && { from: slowest.from, to: slowest.to, delta: formatDelta(slowest.lost / 60) };
    raceButton.disabled = !canRace;
    table.tBodies[0].replaceChildren(
      ...rows.map(({ to, frames, delta }, index) => {
        const row = document.createElement("tr");
        const from = milestones[index - 1] ?? 0;
        const startFrame = splits[index - 1] ?? 0;
        const label = t("{from}–{to}줄", { from, to });
        row.classList.toggle("is-slowest", slowest?.to === to);
        const segment = row.insertCell();
        if (replay) {
          segment.append(
            button({
              label,
              size: "s",
              "aria-label": t("{segment} 구간 다시 보기", { segment: label }),
              onClick: () => {
                replayView.start(replay, "results", "", true);
                replayView.seek(startFrame, true);
              },
            })
          );
        } else segment.textContent = label;
        const priorDelta = index === 0 ? 0 : rows[index - 1].delta;
        row.insertCell().textContent = formatTime(frames - startFrame);
        row.insertCell().textContent = formatSplitComparison(
          delta === null || priorDelta === null ? null : (delta - priorDelta) / 60
        );
        return row;
      })
    );
    const note = slowest
      ? t("가장 많이 밀린 구간 {from}–{to}줄 ({delta}초)", comparison)
      : rows.length === 0
        ? t("10줄부터 구간 기록이 남아요.")
        : hasComparison
          ? t("완료한 비교 구간에서 잃은 시간이 없어요.")
          : "";
    noteElement.textContent = note;
    // 첫 구간(10줄)에 닿기 전에 끝났으면 머리줄뿐인 빈 표 대신 안내만 보인다
    table.hidden = rows.length === 0;
    // 너무 일찍 끝난 판(연타 등)에서 고른 "추천 연습"은 뜻이 없다
    if (replay && recommendPractice) {
      const target = !slowest && !hasComparison ? replayView.analyze(replay).finesseScene : null;
      if (slowest || target) {
        practice.hidden = false;
        practiceLabel.textContent = slowest
          ? t("추천 연습 · {from}–{to}줄", slowest)
          : t("추천 연습 · {piece} 피네스", { piece: target.piece });
        practice.onclick = () => {
          replayView.start(replay, "results", "", true);
          if (target) {
            replayView.seek(target.spawnFrame, true);
            sceneView.enter(null, target);
            return;
          }
          const index = milestones.indexOf(slowest.to);
          const endFrame = splits[index];
          replayView.seek(splits[index - 1] ?? 0, true);
          // 구간 경계에 등장 대기가 있으면 다음 피스를 먼저 보여 준다.
          if (replayView.player && !replayView.player.game.state.active) {
            while (!replayView.player.done && !replayView.player.game.state.active) replayView.player.step();
            replayView.updateBar();
          }
          sceneView.enter({ from: slowest.from, to: slowest.to, endFrame });
        };
      }
    }
    summary.textContent = slowest
      ? t("구간 기록 · {from}–{to}줄 {delta}초", comparison)
      : rows.length === 0
        ? // 첫 구간(10줄) 전에 끝났으면 펼쳐도 표가 없다 → 안에 있는 "같은 순서로 재시작"을 이름으로(U44)
          t("같은 순서로 다시 하기")
        : t("구간 기록");
  };
};
