// ARS (아케이드 방식 회전). 모양이 SRS와 다르다: 피스가 상자 아래쪽에 붙어 있고, T·J·L은 평평한 면이 위로 오게 생성된다.
// 킥: 제자리 → 오른쪽 1칸 → 왼쪽 1칸. I와 O는 킥하지 않는다.
// 중앙열 규칙(단순화): J·L·T가 회전할 때, 돌린 모양이 처음 부딪히는 칸(위→아래, 왼→오 순)이 상자 가운데 열이면 킥하지 않는다.
//   → 좁은 틈에서 엉뚱하게 옆으로 미끄러지는 것을 막는 규칙. 원본의 세부 예외는 생략했다.

/** @param {string[]} rows @returns {[number, number][]} */
const parse = rows =>
  rows.flatMap((row, y) => [...row].flatMap((ch, x) => (ch === "#" ? [/** @type {[number, number]} */ ([x, y])] : [])));

const STATES = {
  I: [
    ["....", "####", "....", "...."],
    ["..#.", "..#.", "..#.", "..#."],
    ["....", "####", "....", "...."],
    ["..#.", "..#.", "..#.", "..#."],
  ],
  T: [
    ["...", "###", ".#."],
    [".#.", "##.", ".#."],
    ["...", ".#.", "###"],
    [".#.", ".##", ".#."],
  ],
  J: [
    ["...", "###", "..#"],
    [".#.", ".#.", "##."],
    ["...", "#..", "###"],
    [".##", ".#.", ".#."],
  ],
  L: [
    ["...", "###", "#.."],
    ["##.", ".#.", ".#."],
    ["...", "..#", "###"],
    [".#.", ".#.", ".##"],
  ],
  S: [
    ["...", ".##", "##."],
    ["#..", "##.", ".#."],
    ["...", ".##", "##."],
    ["#..", "##.", ".#."],
  ],
  Z: [
    ["...", "##.", ".##"],
    ["..#", ".##", ".#."],
    ["...", "##.", ".##"],
    ["..#", ".##", ".#."],
  ],
  O: [
    ["##", "##"],
    ["##", "##"],
    ["##", "##"],
    ["##", "##"],
  ],
};

const SHAPES = Object.freeze(
  Object.fromEntries(Object.entries(STATES).map(([type, states]) => [type, Object.freeze(states.map(parse))]))
);

const NONE = /** @type {ReadonlyArray<readonly [number, number]>} */ (Object.freeze([Object.freeze([0, 0])]));
const SIDE = /** @type {ReadonlyArray<readonly [number, number]>} */ (
  Object.freeze([Object.freeze([0, 0]), Object.freeze([1, 0]), Object.freeze([-1, 0])])
);
const CENTER_RULE = new Set(["J", "L", "T"]);

/** @param {import("../../core/pieces.js").PieceType} type */
const cells = (type, rot) => SHAPES[type][((rot % 4) + 4) % 4];

export default Object.freeze({
  id: "ars",
  cells,
  spawnRotation: () => 0,
  /**
   * @param {(cx: number, cy: number) => boolean} [blocked]  피스 원점 기준으로 그 칸이 막혀 있는가
   */
  kicks(type, from, to, blocked) {
    if (type === "I" || type === "O") return NONE;
    if (CENTER_RULE.has(type) && blocked) {
      const target = [...cells(type, to)].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
      const first = target.find(([cx, cy]) => blocked(cx, cy));
      if (first && first[0] === 1) return NONE;
    }
    return SIDE;
  },
});
