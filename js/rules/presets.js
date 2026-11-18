// 규칙(RuleSet): 조작 물리 전부. 엔진은 이 객체만 읽고 동작을 정한다(모드·프리셋 이름으로 분기하지 않는다).
// 시간 값은 모두 프레임(1/60초) 단위.

/**
 * @typedef {Object} RuleSet
 * @property {string} id                  기록을 나누는 키. 프리셋은 이름, Custom은 내용의 해시
 * @property {string} name
 * @property {"srs" | "ars" | "classic"} rotation
 * @property {"bag7" | "bag14" | "random" | "nesReroll" | "history4"} randomizer
 * @property {number} previewCount        넥스트 미리보기 개수(0~6)
 * @property {{ enabled: boolean }} hold
 * @property {boolean} ghost
 * @property {boolean} hardDrop
 * @property {{ type: "moveReset" | "stepReset" | "infinite" | "none", delay: number, maxResets: number }} lock
 * @property {{ spawn: number, lineClear: number }} are   생성 지연 / 줄 삭제 후 지연
 * @property {number} gravity             프레임당 낙하 칸 수 (1/60 = 1초에 1칸, 20 이상 = 20G). 모드가 레벨별 중력을 주면 그쪽이 우선
 * @property {"threeCorner" | "none"} tspin  T-spin 판정 방식
 * @property {"guideline" | "classic"} scoring  점수표
 * @property {null | { das: number, arr: number, sdf: number }} fixedHandling  개인 설정 대신 강제할 조작감(프레임)
 */

/** @type {RuleSet} */
export const MODERN = Object.freeze({
  id: "modern",
  name: "Modern",
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
  fixedHandling: null,
});

/** 옛날 가정용 게임 느낌: 킥·홀드·하드 드롭·고스트 없음, 넥스트 1개, 닿으면 바로 고정, 조작감 고정. */
/** @type {RuleSet} */
export const RETRO = Object.freeze({
  id: "retro",
  name: "Retro",
  rotation: "classic",
  randomizer: "nesReroll",
  previewCount: 1,
  hold: Object.freeze({ enabled: false }),
  ghost: false,
  hardDrop: false,
  lock: Object.freeze({ type: "none", delay: 0, maxResets: 0 }),
  are: Object.freeze({ spawn: 10, lineClear: 20 }),
  gravity: 1 / 48,
  tspin: "none",
  scoring: "classic",
  // DAS 16프레임, ARR 6프레임, 소프트 드롭은 2프레임에 1칸 정도
  fixedHandling: Object.freeze({ das: 16, arr: 6, sdf: 30 }),
});

/** 아케이드 느낌: ARS 회전, 이력 기반 생성기, 내려갈 때만 리셋되는 고정, 생성·삭제 지연. */
/** @type {RuleSet} */
export const ARCADE = Object.freeze({
  id: "arcade",
  name: "Arcade",
  rotation: "ars",
  randomizer: "history4",
  previewCount: 1,
  hold: Object.freeze({ enabled: false }),
  ghost: true,
  hardDrop: true,
  lock: Object.freeze({ type: "stepReset", delay: 30, maxResets: 0 }),
  are: Object.freeze({ spawn: 25, lineClear: 40 }),
  gravity: 1 / 60,
  tspin: "none",
  scoring: "guideline",
  fixedHandling: null,
});

export const PRESETS = Object.freeze({ modern: MODERN, retro: RETRO, arcade: ARCADE });
export const PRESET_LIST = Object.freeze([MODERN, RETRO, ARCADE]);
