// 테스트용: 퍼즐 한 단계를 하드 드롭만으로 푸는 키 입력을 엔진으로 찾는다(피스마다 회전 수 + 좌우 칸 수).
import { BTN, createGame } from "../../js/core/engine.js";
import { MODERN } from "../../js/rules/presets.js";
import { puzzleMode } from "../../js/modes/puzzles.js";

const plays = moves => {
  const out = [];
  for (const { rot, dx } of moves) {
    for (let i = 0; i < rot; i++) out.push(BTN.CW);
    for (let i = 0; i < Math.abs(dx); i++) out.push(dx < 0 ? BTN.LEFT : BTN.RIGHT);
    out.push(BTN.HARD);
  }
  return out;
};

const run = (puzzle, moves) => {
  const game = createGame({ rules: MODERN, seed: 1, mode: puzzleMode(puzzle) });
  game.step();
  for (const b of plays(moves)) {
    game.step({ pressed: b });
    game.step();
  }
  return game.state.over;
};

/** @returns {{ rot: number, dx: number }[] | null} */
export const solvePuzzle = puzzle => {
  const n = puzzle.pieces.length;
  const search = moves => {
    if (moves.length === n) return run(puzzle, moves) === "clear" ? moves : null;
    for (let rot = 0; rot < 4; rot++)
      for (let dx = -5; dx <= 5; dx++) {
        const r = search([...moves, { rot, dx }]);
        if (r) return r;
      }
    return null;
  };
  return search([]);
};

/** 키보드 키 이름(기본 배치) */
export const keysFor = moves =>
  moves.flatMap(({ rot, dx }) => [
    ...Array(rot).fill("ArrowUp"),
    ...Array(Math.abs(dx)).fill(dx < 0 ? "ArrowLeft" : "ArrowRight"),
    "Space",
  ]);
