// 규칙 프리셋. 엔진은 이 객체만 읽고 동작을 정한다(모드 이름으로 분기하지 않는다).
// 시간 값은 모두 프레임(1/60초) 단위.

/**
 * @typedef {Object} RuleSet
 * @property {string} id
 * @property {"srs"} rotation
 * @property {"bag7"} randomizer
 * @property {number} previewCount        넥스트 미리보기 개수(0~6)
 * @property {{ enabled: boolean }} hold
 * @property {boolean} ghost
 * @property {boolean} hardDrop
 * @property {{ type: "moveReset" | "stepReset" | "infinite" | "none", delay: number, maxResets: number }} lock
 * @property {{ spawn: number, lineClear: number }} are   생성 지연 / 줄 삭제 후 지연
 * @property {number} gravity             프레임당 낙하 칸 수 (1/60 = 1초에 1칸, 20 이상 = 20G). 모드가 레벨별 중력을 주면 그쪽이 우선
 * @property {"threeCorner" | "none"} tspin  T-spin 판정 방식
 * @property {"guideline"} scoring         점수표
 */

/** @type {RuleSet} */
export const MODERN = Object.freeze({
  id: "modern",
  rotation: "srs",
  randomizer: "bag7",
  previewCount: 5,
  hold: Object.freeze({ enabled: true }),
  ghost: true,
  hardDrop: true,
  lock: Object.freeze({ type: "moveReset", delay: 30, maxResets: 15 }),
  are: Object.freeze({ spawn: 0, lineClear: 0 }),
  gravity: 1 / 60,
  tspin: "threeCorner",
  scoring: "guideline",
});

export const PRESETS = Object.freeze({ modern: MODERN });
