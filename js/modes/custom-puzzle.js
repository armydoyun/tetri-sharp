// 만든 퍼즐: 판·피스 순서·목표·규칙·중력·처음 홀드 피스·제목. 링크 코드로 오가고, 같은 코드면 같은 퍼즐이다.
//
// 링크 코드
//   1.<보드 hex 50자>.<피스>                          처음 형식. Modern·홀드 없음·중력 없음·판 비우기로 연다
//   2.<설정>.<높이 + 보드 hex>.<피스>[.<제목·설명>]   설정은 "_"로 이은 짧은 기호, 규칙은 바탕 규칙과 다른 것만
// 계획: docs/PUZZLE_MAKER.md "링크 형식 2."
import { fromBase64Url, toBase64Url } from "../core/base64url.js";
import { HEIGHT, VISIBLE_ROWS, WIDTH } from "../core/board.js";
import { GARBAGE, PIECE_TYPES } from "../core/pieces.js";
import { t } from "../i18n/index.js";
import { MODERN, PRESETS } from "../rules/presets.js";
import { RANDOMIZERS } from "../rules/randomizer/index.js";
import { GRAVITY_OPTIONS, sanitizeRuleBody } from "../rules/sanitize.js";
import { SCORINGS } from "../rules/scoring/index.js";
import { GOAL_KINDS, goalOf } from "./puzzle-goals.js";
import { KIND_NAMES, makePuzzleMode } from "./puzzles.js";

export const PUZZLE_CELLS = WIDTH * VISIBLE_ROWS;
/** 피스 수 안전선(판 비우기 기준 판 높이에 맞춘 넉넉한 값). 링크에서는 피스 하나가 한 글자다 */
export const MAX_PUZZLE_PIECES = 50;
export const MAX_TITLE = 24;
export const MAX_DESC = 60;
/** "N줄 지우기" 목표의 줄 수 범위 */
export const MAX_GOAL_LINES = 20;
/** 링크 코드 길이 한도(망가진 코드를 오래 붙잡지 않게) */
const MAX_CODE = 600;

/** @typedef {Omit<import("../rules/presets.js").RuleSet, "id" | "name">} RuleBody */
/** @typedef {"none" | "20g" | "rules"} PuzzleGravity */
/** @typedef {"modern" | "retro" | "arcade"} RuleBase */
/**
 * @typedef {{
 *   cells: Uint8Array,
 *   pieces: string,
 *   goal?: { kind: string, lines?: number },
 *   gravity?: PuzzleGravity,
 *   base?: RuleBase,
 *   rules?: RuleBody,
 *   holdStart?: string,
 *   title?: string,
 *   desc?: string,
 *   checked?: number,
 * }} CustomPuzzle
 *   checked: 만든 사람이 확인한 것(1 자동 확인, 2 직접 풀어 봄). 같은 퍼즐인지 가릴 때는 빼고 본다
 * @typedef {Required<Omit<CustomPuzzle, "goal">> & { goal: { kind: string, lines: number } }} FullPuzzle
 */

export const CHECKED_AUTO = 1;
export const CHECKED_TRIED = 2;

/**
 * 퍼즐의 바탕 규칙 내용: 그 규칙에서 홀드만 끈 것(퍼즐은 홀드 없이가 기본 — 고급 설정에서 켠다)
 * @param {RuleBase} base
 */
export const baseRules = base => sanitizeRuleBody({ ...(PRESETS[base] ?? MODERN), hold: { enabled: false } });

/** 처음 형식(1.)과 새 퍼즐의 규칙: Modern에서 홀드만 끈 것 */
export const DEFAULT_RULES = Object.freeze(baseRules("modern"));

/** 빠진 값은 기본값으로, 규칙은 허용된 값으로 @param {CustomPuzzle} p @returns {FullPuzzle} */
export const normalizePuzzle = p => {
  const kind = GOAL_KINDS.includes(p.goal?.kind ?? "") ? /** @type {string} */ (p.goal?.kind) : "pc";
  const lines = Math.min(MAX_GOAL_LINES, Math.max(1, Math.round(Number(p.goal?.lines) || 1)));
  const rules = sanitizeRuleBody(p.rules ?? DEFAULT_RULES);
  const holdStart = rules.hold.enabled && PIECE_TYPES.includes(/** @type {any} */ (p.holdStart)) ? p.holdStart : "";
  return {
    cells: p.cells,
    pieces: p.pieces,
    goal: { kind, lines: kind === "lines" ? lines : 0 },
    gravity: p.gravity === "20g" || p.gravity === "rules" ? p.gravity : "none",
    base: p.base && p.base in PRESETS ? p.base : "modern",
    rules,
    holdStart: /** @type {string} */ (holdStart),
    title: String(p.title ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, MAX_TITLE),
    desc: String(p.desc ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, MAX_DESC),
    checked: Number(p.checked) & (CHECKED_AUTO | CHECKED_TRIED),
  };
};

// ---- 링크 코드 ----

const KIND_CODES = Object.freeze({ pc: "p", tsd: "d", tst: "t", mini: "m", quad: "q", combo: "c", lines: "l" });
const GRAVITY_CODES = Object.freeze({ "20g": "2", rules: "r" });
const BASE_CODES = Object.freeze({ modern: "m", retro: "r", arcade: "a" });
const ROTATION_CODES = Object.freeze({ srs: "s", ars: "a", classic: "c" });
const LOCK_CODES = Object.freeze({ moveReset: "m", stepReset: "s", infinite: "i", none: "n" });
const invert = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [v, k]));
const bit = v => (v ? "1" : "0");
const indexIn = (list, v) => String(list.indexOf(v));

/**
 * 규칙 항목 하나: [기호, 값 → 글자, (규칙 내용, 글자) → 고친 규칙 내용]. 글자에는 "." "_"를 쓰지 않는다.
 * @type {ReadonlyArray<[string, (b: RuleBody) => string, (b: any, v: string) => void]>}
 */
const RULE_FIELDS = [
  ["r", b => ROTATION_CODES[b.rotation], (b, v) => (b.rotation = invert(ROTATION_CODES)[v])],
  ["z", b => indexIn(Object.keys(RANDOMIZERS), b.randomizer), (b, v) => (b.randomizer = Object.keys(RANDOMIZERS)[+v])],
  ["n", b => String(b.previewCount), (b, v) => (b.previewCount = +v)],
  ["h", b => bit(b.hold.enabled), (b, v) => (b.hold = { enabled: v === "1" })],
  ["y", b => bit(b.ghost), (b, v) => (b.ghost = v === "1")],
  ["d", b => bit(b.hardDrop), (b, v) => (b.hardDrop = v === "1")],
  [
    "k",
    b => `${LOCK_CODES[b.lock.type]}${b.lock.delay}x${b.lock.maxResets}`,
    (b, v) => {
      const m = /^([msin])(\d+)x(\d+)$/.exec(v);
      if (m) b.lock = { type: invert(LOCK_CODES)[m[1]], delay: +m[2], maxResets: +m[3] };
    },
  ],
  [
    "a",
    b => `${b.are.spawn}x${b.are.lineClear}`,
    (b, v) => {
      const m = /^(\d+)x(\d+)$/.exec(v);
      if (m) b.are = { spawn: +m[1], lineClear: +m[2] };
    },
  ],
  ["v", b => indexIn(GRAVITY_OPTIONS, b.gravity), (b, v) => (b.gravity = GRAVITY_OPTIONS[+v])],
  ["s", b => (b.tspin === "none" ? "n" : "t"), (b, v) => (b.tspin = v === "n" ? "none" : "threeCorner")],
  ["c", b => indexIn(Object.keys(SCORINGS), b.scoring), (b, v) => (b.scoring = Object.keys(SCORINGS)[+v])],
  [
    "f",
    b => (b.fixedHandling ? `${b.fixedHandling.das}x${b.fixedHandling.arr}x${b.fixedHandling.sdf}` : "n"),
    (b, v) => {
      const m = /^(\d+)x(\d+)x(\d+)$/.exec(v);
      b.fixedHandling = m ? { das: +m[1], arr: +m[2], sdf: +m[3] } : null;
    },
  ],
  ["i", b => bit(b.irs), (b, v) => (b.irs = v === "1")],
  ["j", b => bit(b.ihs), (b, v) => (b.ihs = v === "1")],
];

/** 블록이 있는 가장 높은 줄까지의 높이(아래에서부터, 빈 판은 0) @param {Uint8Array} cells */
export const usedHeight = cells => {
  const first = cells.findIndex(Boolean);
  return first < 0 ? 0 : VISIBLE_ROWS - Math.floor(first / WIDTH);
};

/** 쓰는 높이만: <높이 base36><hex> */
const encodeBoard = cells => {
  const h = usedHeight(cells);
  const bits = [...cells.subarray(PUZZLE_CELLS - h * WIDTH)];
  while (bits.length % 4) bits.push(0);
  let hex = "";
  for (let i = 0; i < bits.length; i += 4)
    hex += (bits[i] * 8 + bits[i + 1] * 4 + bits[i + 2] * 2 + bits[i + 3]).toString(16);
  return h.toString(36) + hex;
};
const decodeBoard = text => {
  const h = Number.parseInt(text[0] ?? "", 36);
  if (!(h >= 1 && h <= VISIBLE_ROWS)) return null;
  const hex = text.slice(1);
  if (hex.length !== Math.ceil((h * WIDTH) / 4) || /[^0-9a-f]/.test(hex)) return null;
  const bits = hex.split("").flatMap(d => [3, 2, 1, 0].map(b => (Number.parseInt(d, 16) >> b) & 1));
  const cells = new Uint8Array(PUZZLE_CELLS);
  cells.set(bits.slice(0, h * WIDTH), PUZZLE_CELLS - h * WIDTH);
  return cells;
};

/** 링크로 보낼 수 있는 퍼즐인가 @param {FullPuzzle} p */
const valid = p =>
  p.cells.length === PUZZLE_CELLS &&
  p.cells.some(Boolean) &&
  !p.cells.some(value => value > 1) &&
  p.pieces.length > 0 &&
  !/[^IJLOSTZ]/.test(p.pieces) &&
  p.pieces.length <= MAX_PUZZLE_PIECES;

/**
 * 퍼즐 → 링크 코드(2. 형식). 보낼 수 없는 퍼즐이면 null.
 * @param {CustomPuzzle} puzzle
 * @param {{ checked?: boolean }} [options]  checked: 확인 표시까지 담는다(공유할 때). 빼면 같은 퍼즐인지 가리는 코드
 */
export const encodePuzzle = (puzzle, { checked = false } = {}) => {
  const p = normalizePuzzle(puzzle);
  if (!valid(p)) return null;
  const tokens = [];
  if (p.goal.kind !== "pc") tokens.push(`o${KIND_CODES[p.goal.kind]}${p.goal.kind === "lines" ? p.goal.lines : ""}`);
  if (p.gravity !== "none") tokens.push(`g${GRAVITY_CODES[p.gravity]}`);
  if (p.base !== "modern") tokens.push(`b${BASE_CODES[p.base]}`);
  const base = baseRules(p.base);
  for (const [key, write] of RULE_FIELDS) if (write(p.rules) !== write(base)) tokens.push(`${key}${write(p.rules)}`);
  if (p.holdStart) tokens.push(`p${p.holdStart}`);
  if (checked && p.checked) tokens.push(`e${p.checked}`);
  const text = p.title || p.desc ? toBase64Url(new TextEncoder().encode(`${p.title}\n${p.desc}`)) : "";
  return ["2", tokens.join("_") || "-", encodeBoard(p.cells), p.pieces, ...(text ? [text] : [])].join(".");
};

/** 처음 형식(1.) */
const decodeV1 = (board, pieces) => {
  if (board?.length !== PUZZLE_CELLS / 4 || /[^0-9a-f]/.test(board)) return null;
  const cells = Uint8Array.from(
    board.split("").flatMap(digit => [3, 2, 1, 0].map(b => (Number.parseInt(digit, 16) >> b) & 1))
  );
  return normalizePuzzle({ cells, pieces: pieces ?? "" });
};

/**
 * 링크 코드 → 퍼즐. 읽을 수 없으면 null. 모르는 설정 기호는 건너뛴다(나중 형식과 섞여도 열리게).
 * @param {unknown} code
 * @returns {FullPuzzle | null}
 */
export const decodePuzzle = code => {
  if (typeof code !== "string" || code.length > MAX_CODE) return null;
  const parts = code.split(".");
  let p = null;
  if (parts[0] === "1" && parts.length === 3) p = decodeV1(parts[1], parts[2]);
  else if (parts[0] === "2" && (parts.length === 4 || parts.length === 5)) {
    const [, settings, board, pieces, text] = parts;
    const cells = decodeBoard(board);
    if (!cells || !/^[\w~-]*$/.test(settings) || (text !== undefined && !/^[\w-]+$/.test(text))) return null;
    const read = Object.fromEntries(
      settings
        .split("_")
        .filter(tok => tok && tok !== "-")
        .map(tok => [tok[0], tok.slice(1)])
    );
    const kindCode = read.o?.[0];
    const base = /** @type {RuleBase} */ (invert(BASE_CODES)[read.b] ?? "modern");
    const rules = /** @type {any} */ (structuredClone(baseRules(base)));
    for (const [key, , apply] of RULE_FIELDS) if (read[key] !== undefined) apply(rules, read[key]);
    let title = "";
    let desc = "";
    if (text) {
      try {
        [title, desc = ""] = new TextDecoder("utf-8", { fatal: true }).decode(fromBase64Url(text)).split("\n");
      } catch {
        return null;
      }
    }
    p = normalizePuzzle({
      cells,
      pieces: pieces ?? "",
      goal: { kind: invert(KIND_CODES)[kindCode] ?? "pc", lines: Number(read.o?.slice(1)) },
      gravity: /** @type {PuzzleGravity} */ (invert(GRAVITY_CODES)[read.g] ?? "none"),
      base,
      rules,
      holdStart: read.p,
      title,
      desc,
      checked: Number(read.e),
    });
  }
  return p && valid(p) ? p : null;
};

/** 퍼즐 링크(다른 공유 링크와 같은 모양: 주소 + #puzzle=코드) @param {string} code @param {string} href */
export const puzzleLink = (code, href) => `${String(href).split("#")[0]}#puzzle=${code}`;

/** 같은 퍼즐인지 가리는 코드(확인 표시 빼고) @param {CustomPuzzle} p */
export const puzzleId = p => encodePuzzle(p);

// ---- 플레이 ----

/** 편집 칸(보이는 20줄)을 엔진 판(40줄) 칸으로 @param {Uint8Array} cells */
export const solverBoard = cells => {
  const board = new Uint8Array(WIDTH * HEIGHT);
  board.set(
    cells.map(v => v * GARBAGE),
    board.length - PUZZLE_CELLS
  );
  return board;
};

/** 피스 수(처음 홀드 피스 포함) @param {FullPuzzle} p */
const totalPieces = p => p.pieces.length + (p.holdStart ? 1 : 0);

/**
 * 풀이 탐색 설정(js/modes/puzzle-solver.js). 판 비우기는 블록 수로 쌓을 수 있는 높이를 정하고,
 * 다른 목표는 처음 판의 높이 안에서 먼저 찾은 뒤 보이는 판 전체로 넓힌다.
 * @param {CustomPuzzle} puzzle
 * @returns {import("./puzzle-solver.js").SearchOptions}
 */
export const searchOptions = puzzle => {
  const p = normalizePuzzle(puzzle);
  const filled = p.cells.reduce((n, v) => n + v, 0);
  const used = usedHeight(p.cells);
  // 판 비우기에서 쌓인 높이는 앞으로 지울 줄 수를 넘지 않는다(빈 줄 위에 블록이 뜰 수 없으므로)
  const pcRows = Math.max(2, used, Math.floor((filled + 4 * totalPieces(p)) / WIDTH));
  return {
    sonic: p.gravity === "20g",
    irs: p.rules.irs,
    lockNone: p.rules.lock.type === "none",
    tspin: p.rules.tspin,
    hold: p.rules.hold.enabled,
    // 판 비우기는 쌓을 수 있는 높이가 정해진다. 다른 목표는 처음 판의 높이 안에서 먼저 찾고 못 찾으면 보이는 판 전체로
    ...(p.goal.kind === "pc" ? { ceilingRows: Math.min(VISIBLE_ROWS, pcRows) } : { looseRows: VISIBLE_ROWS }),
  };
};

/** 자동 확인·첫 수 보기를 할 수 있는가: "규칙대로" 중력은 푸는 사람의 손 빠르기에 달려 있어 확인할 수 없다 */
export const canSearch = puzzle => normalizePuzzle(puzzle).gravity !== "rules";

/**
 * 처음부터 끝까지 풀이를 찾는 탐색 한 건
 * @param {CustomPuzzle} puzzle
 * @returns {import("./puzzle-solver.js").SolverTask}
 */
export const solutionTask = puzzle => {
  const p = normalizePuzzle(puzzle);
  return {
    type: "solution",
    kind: p.goal.kind,
    count: totalPieces(p),
    lines: p.goal.lines,
    rotation: p.rules.rotation,
    board: solverBoard(p.cells),
    pieces: [...p.pieces],
    holdStart: p.holdStart || null,
    opts: searchOptions(p),
  };
};

/** 목표 이름 @param {{ kind: string, lines?: number }} goal */
export const goalLabel = goal =>
  goal.kind === "lines" ? t("{n}줄 지우기", { n: goal.lines ?? 1 }) : (KIND_NAMES[goal.kind] ?? KIND_NAMES.pc);

/**
 * 처음 형식(Modern·홀드 없음·중력 없음)과 다른 규칙을 짧게: "20G · 홀드 · ARS 회전"
 * @param {CustomPuzzle} puzzle
 */
export const ruleSummary = puzzle => {
  const p = normalizePuzzle(puzzle);
  const r = p.rules;
  const parts = [];
  if (p.base !== "modern") parts.push(t("{name} 바탕", { name: PRESETS[p.base].name }));
  if (p.gravity === "20g") parts.push("20G");
  if (p.gravity === "rules") parts.push(t("규칙대로 떨어짐"));
  if (r.rotation !== DEFAULT_RULES.rotation) parts.push(t("{name} 회전", { name: r.rotation.toUpperCase() }));
  if (r.hold.enabled) parts.push(p.holdStart ? t("홀드(처음 {piece})", { piece: p.holdStart }) : t("홀드"));
  if (r.previewCount !== DEFAULT_RULES.previewCount) parts.push(t("미리보기 {n}", { n: r.previewCount }));
  if (r.tspin === "none") parts.push(t("T-spin 없음"));
  if (!r.hardDrop) parts.push(t("하드 드롭 없음"));
  if (r.lock.type === "none") parts.push(t("고정 지연 없음"));
  return parts.join(" · ");
};

/** @param {CustomPuzzle} puzzle */
export const customPuzzleMode = puzzle => {
  const p = normalizePuzzle(puzzle);
  const preset = PRESETS[p.base];
  const rules = Object.freeze({ id: preset.id, name: preset.name, ...p.rules });
  return makePuzzleMode(
    {
      kind: p.goal.kind,
      lines: p.goal.lines,
      pieces: [...p.pieces],
      holdStart: p.holdStart || null,
      gravity: p.gravity,
      custom: p,
      build: board =>
        board.cells.set(
          p.cells.map(value => value * GARBAGE),
          board.cells.length - PUZZLE_CELLS
        ),
      ...goalOf(p.goal.kind, totalPieces(p), p.goal.lines),
    },
    rules
  );
};
