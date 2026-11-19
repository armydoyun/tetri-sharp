import srs from "./srs.js";
import ars from "./ars.js";
import classic from "./classic.js";

/**
 * 회전 시스템 하나: 모양, 스폰 방향, 킥 후보.
 * @typedef {Object} Rotation
 * @property {string} id
 * @property {(type: import("../../core/pieces.js").PieceType, rot: number) => ReadonlyArray<readonly [number, number]>} cells
 * @property {(type: import("../../core/pieces.js").PieceType) => number} spawnRotation
 * @property {(type: import("../../core/pieces.js").PieceType, from: number, to: number, blocked?: (cx: number, cy: number) => boolean) => ReadonlyArray<readonly [number, number]>} kicks
 */

/** 회전 시스템 목록 @type {Readonly<Record<string, Rotation>>} */
export const ROTATIONS = Object.freeze({ srs, ars, classic });
