import { fromBase64Url, toBase64Url } from "../core/base64url.js";
import { customPuzzleMode, decodePuzzle, encodePuzzle, puzzleId } from "./custom-puzzle.js";

export const MIN_PACK_STAGES = 2;
export const MAX_PACK_STAGES = 5;
export const MAX_PACK_TITLE = 32;
const MAX_CODE_LENGTH = 4600;

/** @typedef {{ title: string, puzzles: string[] }} PuzzlePack */

/** @param {unknown} raw @returns {PuzzlePack | null} */
const normalizePack = raw => {
  if (!raw || typeof raw !== "object" || !("title" in raw) || !("puzzles" in raw)) return null;
  if (typeof raw.title !== "string" || !Array.isArray(raw.puzzles)) return null;
  const title = raw.title
    .replace(/[\r\n\t]+/g, " ")
    .trim()
    .slice(0, MAX_PACK_TITLE)
    .trimEnd();
  if (!title || raw.puzzles.length < MIN_PACK_STAGES || raw.puzzles.length > MAX_PACK_STAGES) return null;
  const puzzles = [];
  const seen = new Set();
  for (const code of raw.puzzles) {
    const puzzle = decodePuzzle(code);
    if (!puzzle) return null;
    const id = puzzleId(puzzle);
    if (seen.has(id)) return null;
    seen.add(id);
    puzzles.push(encodePuzzle(puzzle, { checked: true }));
  }
  return { title, puzzles };
};

/** @param {PuzzlePack} pack */
export const encodePack = pack => {
  const normalized = normalizePack(pack);
  if (!normalized) return null;
  const code = "1." + toBase64Url(new TextEncoder().encode(JSON.stringify(normalized)));
  return code.length <= MAX_CODE_LENGTH ? code : null;
};

/** @param {unknown} code */
export const decodePack = code => {
  if (typeof code !== "string" || code.length > MAX_CODE_LENGTH || !/^1\.[\w-]+$/.test(code)) return null;
  try {
    return normalizePack(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(fromBase64Url(code.slice(2)))));
  } catch {
    return null;
  }
};

export const packLink = (code, href) => `${String(href).split("#")[0]}#pack=${code}`;

/** @param {string} code @param {number} index */
export const packStageMode = (code, index) => {
  const pack = decodePack(code);
  if (!pack || !Number.isInteger(index) || index < 0 || index >= pack.puzzles.length) return null;
  const puzzleCode = pack.puzzles[index];
  const puzzle = decodePuzzle(puzzleCode);
  if (!puzzle) return null;
  return { ...customPuzzleMode(puzzle), puzzleCode, packStage: { code, index } };
};
