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

/** 완료한 구간의 누적 시간과 직전 구간 이후의 차이를 정리한다. */
export const analyzeSplits = (marks, current, best) => {
  const rows = [];
  let slowest = null;
  for (let i = 0; i < Math.min(current.length, marks.length); i++) {
    const from = i === 0 ? 0 : marks[i - 1];
    const to = marks[i];
    const frames = current[i];
    const hasBest = best?.[i] !== undefined;
    const delta = hasBest ? frames - best[i] : null;
    rows.push({ to, frames, delta });
    const priorDelta = i === 0 ? 0 : rows[i - 1].delta;
    if (delta === null || priorDelta === null) continue;
    const lost = delta - priorDelta;
    if (lost > (slowest?.lost ?? 0)) slowest = { from, to, lost };
  }
  return { rows, slowest };
};
