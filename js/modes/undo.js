// 연습 모드 되돌리기: 피스가 나올 때마다 판 상태를 찍어 두고, 되돌리면 바로 앞 피스가 나온 순간으로 돌아간다.
// 엔진 상태는 대부분 평범한 값이라 그대로 복사하고, 함수가 든 객체(연습의 난수 등)는 같은 것을 계속 쓴다.
const MAX = 60;

const copy = value => {
  if (value instanceof Uint8Array) return value.slice();
  if (Array.isArray(value)) return value.map(copy);
  if (value && typeof value === "object") {
    // 함수를 가진 객체(난수 생성기 등)는 복사하지 않고 그대로 둔다
    if (Object.values(value).some(v => typeof v === "function")) return value;
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, copy(v)]));
  }
  return value;
};

/** 엔진 상태 → 되돌릴 수 있는 사본 */
export const snapshotState = state => copy(state);

/** 사본을 엔진 상태에 덮어쓴다(같은 객체를 유지해야 엔진·화면이 계속 그 객체를 본다) */
export const restoreState = (state, snap) => {
  for (const key of Object.keys(state)) if (!(key in snap)) delete state[key];
  for (const [key, value] of Object.entries(snap)) {
    if (key === "board") state.board.cells.set(value.cells);
    else state[key] = copy(value);
  }
};

/** 피스마다 하나씩 쌓는 되돌리기 기록 */
export const createUndo = () => {
  /** @type {{ pieceId: number, snap: any }[]} */
  let stack = [];
  return {
    reset() {
      stack = [];
    },
    /** 매 프레임 step() 전에: 새 피스가 나왔으면 찍어 둔다 */
    track(state) {
      if (!state.active || state.over) return;
      if (stack.at(-1)?.pieceId === state.pieceId) return;
      stack.push({ pieceId: state.pieceId, snap: snapshotState(state) });
      if (stack.length > MAX) stack.shift();
    },
    /** 바로 앞 피스가 나온 순간으로. 되돌렸으면 true */
    undo(state) {
      if (stack.at(-1)?.pieceId === state.pieceId) stack.pop();
      const prev = stack.at(-1);
      if (!prev) return false;
      restoreState(state, prev.snap);
      return true;
    },
    get size() {
      return stack.length;
    },
  };
};
