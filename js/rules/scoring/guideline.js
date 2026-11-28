// 가이드라인 점수표. 모든 점수에 현재 레벨을 곱한다.
//   - "어려운 클리어"(4줄, 줄을 지운 T-spin/Mini)가 연속되면 B2B ×1.5
//   - 줄을 지우는 고정이 연속되면 콤보 +50 × 콤보 수
//   - 보드가 완전히 비면 퍼펙트 클리어 보너스
//   - 소프트 드롭 1점/칸, 하드 드롭 2점/칸 (레벨과 무관)

const LINE_POINTS = Object.freeze({
  none: [0, 100, 300, 500, 800],
  mini: [100, 200, 400],
  full: [400, 800, 1200, 1600],
});
const PERFECT_POINTS = [0, 800, 1200, 1800, 2000];
const PERFECT_B2B_QUAD = 3200;

export const SOFT_DROP_POINTS = 1;
export const HARD_DROP_POINTS = 2;

/**
 * @param {{ lines: number, tspin: "none" | "mini" | "full", b2b: number, combo: number, perfect: boolean, level: number }} input
 *   b2b: 직전까지 이어진 어려운 클리어 수(0 = 없음), combo: 직전 콤보(-1 = 없음)
 */
export const scoreLock = ({ lines, tspin, b2b, combo, perfect, level }) => {
  const difficult = lines > 0 && (lines >= 4 || tspin !== "none");
  const b2bApplied = difficult && b2b > 0;
  let points = (LINE_POINTS[tspin][lines] ?? 0) * level * (b2bApplied ? 1.5 : 1);

  const nextCombo = lines > 0 ? combo + 1 : -1;
  if (nextCombo > 0) points += 50 * nextCombo * level;

  if (perfect) points += (lines === 4 && b2bApplied ? PERFECT_B2B_QUAD : PERFECT_POINTS[lines]) * level;

  return {
    points: Math.floor(points),
    difficult,
    b2bApplied,
    // 어려운 클리어면 이어 가고, 쉬운 클리어(1~3줄)면 끊고, 줄을 안 지웠으면 그대로.
    b2b: difficult ? b2b + 1 : lines > 0 ? 0 : b2b,
    combo: nextCombo,
  };
};

const LINE_NAMES = ["", "SINGLE", "DOUBLE", "TRIPLE", "QUAD"];

/**
 * 화면에 띄울 이름. 예: "T-SPIN DOUBLE", "MINI T-SPIN", "QUAD"
 * @param {{ lines: number, tspin: string, spinPiece?: string }} r
 */
export const clearName = ({ lines, tspin, spinPiece }) => {
  const spin = spinPiece ? `${spinPiece}-SPIN` : tspin === "full" ? "T-SPIN" : tspin === "mini" ? "MINI T-SPIN" : "";
  return [spin, LINE_NAMES[lines] ?? ""].filter(Boolean).join(" ");
};
