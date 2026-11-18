// 시드 기반 PRNG (mulberry32). 같은 시드 → 같은 수열이라 리플레이와 기록 비교가 가능하다.
// 코어와 규칙 모듈은 Math.random 대신 반드시 이것을 쓴다(eslint가 막는다).

/** @typedef {{ next(): number, int(n: number): number, state(): number }} Rng */

/**
 * @param {number} seed 32비트 정수
 * @returns {Rng}
 */
export const createRng = seed => {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    /** [0, 1) */
    next,
    /** [0, n) 정수 */
    int: n => Math.floor(next() * n),
    /** 현재 내부 상태(저장/복원용) */
    state: () => s,
  };
};
