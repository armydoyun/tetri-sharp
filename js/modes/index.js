// 모드: 목표·종료 조건·HUD·기록 방식. 조작 물리는 RuleSet(rules/presets.js)이 정한다.
// check()는 순수 함수라 엔진과 함께 Node 테스트에서 그대로 돈다.
import { MODERN } from "../rules/presets.js";

/**
 * @typedef {Object} Mode
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {import("../rules/presets.js").RuleSet} rules
 * @property {(state: any, events: any[]) => null | { result: string }} check
 * @property {(state: any) => { label: string, value: string }} hudLines
 * @property {{ metric: "frames" | "lines", order: "asc" | "desc" }} record  어떤 값으로 순위를 매기는지
 * @property {(state: any) => boolean} isRecordable  이번 판을 기록에 남길지
 */

const SPRINT_GOAL = 40;

/** @type {Mode} */
export const SPRINT_40 = Object.freeze({
  id: "sprint40",
  name: "Sprint 40L",
  description: "40줄을 가장 빨리 지우기",
  rules: MODERN,
  goal: SPRINT_GOAL,
  check: state => (state.stats.lines >= SPRINT_GOAL ? { result: "clear" } : null),
  hudLines: state => ({ label: "남은 줄", value: String(Math.max(0, SPRINT_GOAL - state.stats.lines)) }),
  record: Object.freeze({ metric: "frames", order: "asc" }),
  isRecordable: state => state.over === "clear",
});

/** @type {Mode} */
export const ZEN = Object.freeze({
  id: "zen",
  name: "Endless",
  description: "끝없이 쌓고 지우기 — 막힐 때까지",
  rules: MODERN,
  check: () => null,
  hudLines: state => ({ label: "줄", value: String(state.stats.lines) }),
  record: Object.freeze({ metric: "lines", order: "desc" }),
  isRecordable: state => state.stats.lines > 0,
});

export const MODES = Object.freeze([SPRINT_40, ZEN]);
export const findMode = id => MODES.find(m => m.id === id) ?? SPRINT_40;
