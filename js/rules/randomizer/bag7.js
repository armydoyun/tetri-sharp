// 7-Bag: 7종을 한 봉지에 넣고 섞어서 차례로 꺼낸다. 봉지가 비면 새 봉지.
import { PIECE_TYPES } from "../../core/pieces.js";

/**
 * @param {import("../../core/rng.js").Rng} rng
 */
export const createBag7 = rng => {
  /** @type {import("../../core/pieces.js").PieceType[]} */
  let bag = [];
  const refill = () => {
    bag = [...PIECE_TYPES];
    // Fisher–Yates
    for (let i = bag.length - 1; i > 0; i--) {
      const j = rng.int(i + 1);
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
  };
  return {
    next() {
      if (bag.length === 0) refill();
      return /** @type {import("../../core/pieces.js").PieceType} */ (bag.shift());
    },
  };
};
