// 클래식 점수표: 줄 수만 본다(T-spin·B2B·콤보·퍼펙트 클리어 없음). 레벨을 곱한다.
// 소프트 드롭은 1점/칸, 하드 드롭은 점수 없음.
const LINE_POINTS = [0, 40, 100, 300, 1200];

export const SOFT_DROP_POINTS = 1;
export const HARD_DROP_POINTS = 0;

export const scoreLock = ({ lines, b2b, level }) => ({
  points: (LINE_POINTS[lines] ?? 0) * level,
  difficult: false,
  b2bApplied: false,
  b2b,
  combo: -1,
});
