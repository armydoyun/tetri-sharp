import { createBag7 } from "./bag7.js";
import { createBag14, createHistory4, createNesReroll, createRandom } from "./others.js";

/** 미노 생성기 목록 */
export const RANDOMIZERS = Object.freeze({
  bag7: createBag7,
  bag14: createBag14,
  random: createRandom,
  nesReroll: createNesReroll,
  history4: createHistory4,
});
