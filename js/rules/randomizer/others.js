// 7-Bag 외의 생성기들. 모두 시드 PRNG만 써서 결정론적이다.
import { PIECE_TYPES } from "../../core/pieces.js";

/** @typedef {import("../../core/pieces.js").PieceType} PieceType */

/** 14-Bag: 7종을 두 벌 넣고 섞는다. 같은 피스가 몰려 나올 수 있다. */
export const createBag14 = rng => {
  /** @type {PieceType[]} */
  let bag = [];
  return {
    next() {
      if (!bag.length) {
        bag = [...PIECE_TYPES, ...PIECE_TYPES];
        for (let i = bag.length - 1; i > 0; i--) {
          const j = rng.int(i + 1);
          [bag[i], bag[j]] = [bag[j], bag[i]];
        }
      }
      return /** @type {PieceType} */ (bag.shift());
    },
  };
};

/** 완전 무작위: 매번 7종 중 하나. 가뭄(같은 피스가 오래 안 나옴)이 생긴다. */
export const createRandom = rng => ({ next: () => PIECE_TYPES[rng.int(7)] });

/**
 * 직전 재추첨(옛날 가정용 게임 방식): 8칸 주사위를 굴려 8이 나오거나 직전 피스와 같으면 7칸으로 한 번만 다시 굴린다.
 * 연속 중복이 줄어들지만 완전히 없어지지는 않는다.
 */
export const createNesReroll = rng => {
  /** @type {PieceType | null} */
  let prev = null;
  return {
    next() {
      const roll = rng.int(8);
      let piece = roll < 7 ? PIECE_TYPES[roll] : null;
      if (piece === null || piece === prev) piece = PIECE_TYPES[rng.int(7)];
      prev = piece;
      return piece;
    },
  };
};

/**
 * 이력 기반(아케이드 방식): 최근 4개와 겹치면 최대 6번까지 다시 굴린다.
 * 첫 피스는 S·Z·O가 나오지 않는다(시작부터 구멍이 생기지 않게).
 */
export const createHistory4 = rng => {
  /** @type {PieceType[]} */
  const history = ["Z", "S", "S", "Z"];
  let first = true;
  const FIRST = /** @type {PieceType[]} */ (["I", "J", "L", "T"]);
  return {
    next() {
      let piece;
      if (first) {
        piece = FIRST[rng.int(FIRST.length)];
        first = false;
      } else {
        for (let i = 0; i < 6; i++) {
          piece = PIECE_TYPES[rng.int(7)];
          if (!history.includes(piece)) break;
        }
      }
      history.shift();
      history.push(/** @type {PieceType} */ (piece));
      return /** @type {PieceType} */ (piece);
    },
  };
};
