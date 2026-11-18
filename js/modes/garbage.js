// 쓰레기 줄: 보드를 밀어 올리고 아래에 구멍 하나짜리 줄을 넣는다. Survival과 CPU 대전이 함께 쓴다.
import { set } from "../core/board.js";
import { GARBAGE } from "../core/pieces.js";

/** 같은 구멍이 이어질 확률(%) — 구멍이 한 열에 모여 있어야 파낼 수 있다 */
const SAME_HOLE = 70;

/** 보드를 n줄 밀어 올리고 아래에 구멍 하나짜리 쓰레기 줄을 넣는다. */
export const raiseGarbage = (board, n, nextHole) => {
  const w = board.width;
  board.cells.copyWithin(0, n * w);
  for (let i = 0; i < n; i++) {
    const y = board.height - n + i;
    const hole = nextHole();
    for (let x = 0; x < w; x++) set(board, x, y, x === hole ? 0 : GARBAGE);
  }
};

/**
 * 대기 중인 쓰레기 줄을 아래에서 올린다(한 번에 최대 12줄). 구멍은 대개 같은 열에 모인다.
 * state.garbage: { pending, received, hole, rng }
 */
export const receiveGarbage = (state, events) => {
  const g = state.garbage;
  if (!g.pending) return 0;
  const n = Math.min(g.pending, 12);
  raiseGarbage(state.board, n, () => {
    if (g.rng.int(100) >= SAME_HOLE) {
      const h = g.rng.int(state.board.width - 1);
      g.hole = h >= g.hole ? h + 1 : h;
    }
    return g.hole;
  });
  g.received += n;
  g.pending -= n;
  events.push({ type: "garbage", rows: n });
  return n;
};
