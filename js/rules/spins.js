import { CELL_ID, PIECE_TYPES } from "../core/pieces.js";

/** @param {import("../core/pieces.js").PieceType} piece */
export const spinBit = piece => 1 << (CELL_ID[piece] - 1);
export const T_SPIN = spinBit("T");
export const ALL_SPINS = (1 << PIECE_TYPES.length) - 1;

/** 기존 프리셋·저장값은 tspin만으로 같은 판정을 유지한다. */
export const spinMask = rules =>
  Number.isInteger(rules.spinPieces) && rules.spinPieces >= 0 && rules.spinPieces <= ALL_SPINS
    ? rules.spinPieces
    : rules.tspin === "none"
      ? 0
      : T_SPIN;

/** 없음과 T 전용은 기존 저장 형식·규칙 식별자를 그대로 쓴다. */
export const spinSettings = mask => ({
  tspin: mask & T_SPIN ? /** @type {const} */ ("threeCorner") : /** @type {const} */ ("none"),
  spinPieces: mask === 0 || mask === T_SPIN ? undefined : mask,
});
