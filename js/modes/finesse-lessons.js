import { HEIGHT } from "../core/board.js";
import { MODERN } from "../rules/presets.js";
import { ROTATIONS } from "../rules/rotation/index.js";
import { t } from "../i18n/index.js";
import { finessePath, finessePlacement } from "./finesse.js";

const rules = Object.freeze({ ...MODERN, previewCount: 0, hold: Object.freeze({ enabled: false }) });
const rotation = ROTATIONS[MODERN.rotation];

// 각 문제는 빈 판에 피스 하나를 놓는다. x는 회전 상자의 왼쪽이다.
const placements = /** @type {const} */ ([
  ["T", 3, 0],
  ["T", 2, 0],
  ["T", 4, 0],
  ["J", 0, 0],
  ["L", 7, 0],
  ["T", 3, 1],
  ["L", 3, 3],
  ["J", 3, 2],
  ["T", -1, 1],
  ["I", 7, 1],
]);

export const FINESSE_LESSONS = Object.freeze(
  placements.map(([type, x, rot], index) => {
    const shape = rotation.cells(type, rot);
    const y = HEIGHT - 1 - Math.max(...shape.map(([, cy]) => cy));
    const target = shape.map(([cx, cy]) => [x + cx, y + cy]);
    const placement = finessePlacement(target);
    const path = finessePath(rotation, type, target);
    if (!path) throw new Error(`Unreachable finesse placement: ${type} at ${x}, ${rot}`);
    const number = index + 1;
    const label = t("피네스 {n} / {total}", { n: number, total: placements.length });
    return Object.freeze({
      id: `finesse-lesson-${number}`,
      name: label,
      description: t("점선 칸에 맞춘 뒤 하드 드롭하세요."),
      rules,
      practice: true,
      noReplay: true,
      lesson: { index, path },
      sequence: [type],
      hud: ["time"],
      setup: state => {
        state.finesseTarget = target;
      },
      gravityFor: () => 0,
      check: (_state, events) => {
        const lock = events.find(event => event.type === "lock");
        return lock ? { result: finessePlacement(lock.cells) === placement ? "clear" : "fail" } : null;
      },
      hudLines: state => ({ label: t("줄"), value: String(state.stats.lines) }),
      hudTime: state => ({ label: t("시간"), frames: state.frame }),
      isRecordable: () => false,
      formatRecord: () => "",
      summary: state => ({
        title: state.over === "clear" ? t("성공!") : t("실패"),
        detail: state.over === "clear" ? t("목표에 놓았어요") : t("목표와 다른 칸에 놓았어요"),
      }),
    });
  })
);
