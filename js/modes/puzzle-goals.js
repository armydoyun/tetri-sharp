// 퍼즐 목표: 종류(kind)와 피스 수(·줄 수)로 정해진다. 기본 퍼즐·만든 퍼즐·풀이 탐색(Worker)이 함께 쓴다.
// 함수는 Worker로 보낼 수 없으므로 Worker에는 종류와 수만 보내고 여기서 다시 만든다.

/** 만든 퍼즐에서 고를 수 있는 목표 */
export const GOAL_KINDS = Object.freeze(["pc", "tsd", "tst", "mini", "quad", "combo", "lines"]);

/**
 * @param {string} kind  pc quad tuck spin combo mini tsd tst lines
 * @param {number} count  피스 수(콤보 목표에 쓴다)
 * @param {number} [lines]  lines 목표의 줄 수(지운 줄 합계 ev.total이 이만큼 되면 성공)
 * @returns {{ goal: (ev: any) => boolean, broken?: (ev: any) => boolean }}
 */
export const goalOf = (kind, count, lines = 0) => {
  if (kind === "tsd" || kind === "tst")
    return { goal: ev => ev.tspin === "full" && ev.lines === (kind === "tsd" ? 2 : 3) };
  if (kind === "tuck" || kind === "spin") return { goal: ev => ev.lines === 2 };
  if (kind === "mini") return { goal: ev => ev.tspin === "mini" && ev.lines >= 1 };
  // 피스마다 줄을 지워 콤보가 피스 수 - 1까지 이어지면 성공, 한 번이라도 못 지우면 바로 실패
  if (kind === "combo") return { goal: ev => ev.lines > 0 && ev.combo === count - 1, broken: ev => ev.lines === 0 };
  if (kind === "quad") return { goal: ev => ev.lines === 4 };
  if (kind === "lines") return { goal: ev => (ev.total ?? ev.lines) >= Math.max(1, lines) };
  return { goal: ev => ev.perfect };
};
