// 피스 미끄러짐(모던 테마): 화면에 그리는 위치만 짧게 따라가게 한다. 게임 판정·입력은 그대로 즉시 반영된다.
// 새 피스(id가 바뀜)는 미끄러지지 않고 그 자리에 바로 나타난다.

const easeOut = t => 1 - (1 - t) * (1 - t);

/** @returns {{ at: (id: number, x: number, y: number, now: number, durationMs: number) => { x: number, y: number } }} */
export const createSlide = () => {
  let id = -1;
  let from = { x: 0, y: 0 };
  let to = { x: 0, y: 0 };
  let start = 0;
  let duration = 0;

  const shown = now => {
    if (duration <= 0) return to;
    const t = Math.min(1, Math.max(0, (now - start) / duration));
    const k = easeOut(t);
    return { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k };
  };

  return {
    /** 지금 그릴 위치(칸 단위, 소수 가능) */
    at(nextId, x, y, now, durationMs) {
      if (nextId !== id || durationMs <= 0) {
        id = nextId;
        from = to = { x, y };
        duration = 0;
        return to;
      }
      if (x !== to.x || y !== to.y) {
        from = shown(now);
        to = { x, y };
        start = now;
        duration = durationMs;
      }
      return shown(now);
    },
  };
};
