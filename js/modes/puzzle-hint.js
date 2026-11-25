// 퍼즐 "첫 수 보기": 찾은 첫 수(js/modes/puzzle-solver.js)를 누를 순서의 글로 바꾼다.
import { t } from "../i18n/index.js";

export { findFirstMove } from "./puzzle-solver.js";

/**
 * 누를 순서를 짧은 글로: "오른쪽 4칸, 아래로 18칸, 반시계 회전, 그대로 두기"
 * @param {string[]} steps  L R D CW CCW 180
 * @param {boolean} spinLast  마지막이 회전이어야 하는 수(T-spin 등) → 하드 드롭 대신 그대로 두기
 */
export const describeSteps = (steps, spinLast) => {
  // 끝에 곧장 내려가는 칸은 하드 드롭 하나로 갈음한다
  let end = steps.length;
  while (end > 0 && steps[end - 1] === "D") end--;
  const dropsAtEnd = end < steps.length;
  steps = steps.slice(0, end);
  const parts = [];
  for (let i = 0; i < steps.length; ) {
    let j = i;
    while (j < steps.length && steps[j] === steps[i]) j++;
    const n = j - i;
    const s = steps[i];
    if (s === "L") parts.push(t("왼쪽 {n}칸", { n }));
    else if (s === "R") parts.push(t("오른쪽 {n}칸", { n }));
    else if (s === "D") parts.push(t("아래로 {n}칸", { n }));
    else if (s === "CW") parts.push(n > 1 ? t("시계 회전 {n}번", { n }) : t("시계 회전"));
    else if (s === "CCW") parts.push(n > 1 ? t("반시계 회전 {n}번", { n }) : t("반시계 회전"));
    else parts.push(t("180° 회전"));
    i = j;
  }
  const last = steps.at(-1);
  const rotatedLast = !dropsAtEnd && (last === "CW" || last === "CCW" || last === "180");
  // T-spin처럼 회전이 마지막이어야 하는 수는 하드 드롭 대신 그대로 두어 고정한다
  const finish = rotatedLast && spinLast ? t("그대로 두기") : t("하드 드롭");
  return [...parts, finish].join(", ");
};
