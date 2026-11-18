// 진입점. M0 단계: 보드를 만들고 그리기만 한다. 게임 루프·입력은 M1에서 붙인다.
import { createBoard } from "./core/board.js";
import { createRenderer } from "./render/canvas.js";

const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById("board"));
const status = /** @type {HTMLElement} */ (document.getElementById("status"));

const board = createBoard();
const renderer = createRenderer(canvas);
renderer.draw(board);
status.textContent = "준비 중 — 게임 로직은 다음 단계에서 붙습니다.";

// 브라우저 테스트가 "앱이 끝까지 떴는지" 확인하는 표시.
document.documentElement.dataset.ready = "1";
