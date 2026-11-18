import { createBag7 } from "./bag7.js";

/** 미노 생성기 목록. 14-Bag·완전 무작위·이력 기반은 규칙 샌드박스 단계에서 추가한다. */
export const RANDOMIZERS = Object.freeze({ bag7: createBag7 });
