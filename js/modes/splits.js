// 구간 기록(Sprint): 정해진 줄 수에 닿은 프레임을 모으고 최고 기록과 비교한다. 순수 함수.

/**
 * 지금까지 지난 구간에 새로 닿은 것이 있으면 그 프레임을 덧붙인 배열을 돌려준다.
 * @param {readonly number[]} marks  예: [10, 20, 30, 40]
 * @param {number[]} done  이미 남긴 구간 프레임
 */
export const advanceSplits = (marks, done, lines, frame) => {
  const out = [...done];
  while (out.length < marks.length && lines >= marks[out.length]) out.push(frame);
  return out;
};

/**
 * 가장 최근 구간에서 최고 기록과의 차이(초). 앞서면 음수. 비교할 수 없으면 null.
 * @param {number[]} current
 * @param {number[] | undefined} best
 */
export const splitDelta = (current, best) => {
  const i = current.length - 1;
  if (i < 0 || !best || best[i] === undefined) return null;
  return (current[i] - best[i]) / 60;
};

/** "+1.23" / "-0.45" / "—" */
export const formatDelta = delta => (delta === null ? "—" : `${delta < 0 ? "-" : "+"}${Math.abs(delta).toFixed(2)}`);
