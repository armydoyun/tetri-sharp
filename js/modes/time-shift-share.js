// 짧은 URL 조각으로 단계와 첫 번째 플레이의 열·회전만 옮긴다.
import { fromBase64Url, toBase64Url } from "../core/base64url.js";
import { findTimeShiftStage, validTimeShiftMoves } from "./time-shift.js";

const PREFIX = "TS1-";
const MAX_CODE = 192;

/** @param {ReturnType<typeof findTimeShiftStage>} stage @param {unknown} moves */
export const encodeTimeShiftChallenge = (stage, moves) => {
  if (!stage || !validTimeShiftMoves(moves, stage)) return null;
  const payload = [stage.id, stage.version, moves.map(move => [move.x, move.rot])];
  return PREFIX + toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
};

/** @param {string | null} value */
export const decodeTimeShiftChallenge = value => {
  const input = (value ?? "").trim();
  const code = /[#&]time-shift=([^&\s]+)/.exec(input)?.[1] ?? input;
  if (!code.startsWith(PREFIX) || code.length > MAX_CODE || !/^[\w-]+$/.test(code)) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(code.slice(PREFIX.length))));
    if (!Array.isArray(payload) || payload.length !== 3) return null;
    const [id, version, positions] = payload;
    const stage = findTimeShiftStage(id);
    if (!stage || stage.version !== version || !Array.isArray(positions)) return null;
    const moves = positions.map((pair, i) =>
      Array.isArray(pair) && pair.length === 2 ? { type: stage.recording[i], x: pair[0], rot: pair[1] } : null
    );
    return validTimeShiftMoves(moves, stage) ? { stage, moves } : null;
  } catch {
    return null;
  }
};
