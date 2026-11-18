// 진입점: 게임 루프(고정 60Hz 로직 + 화면 주사율 렌더), 입력, HUD를 연결한다.
import { DEFAULT_HANDLING, createGame } from "./core/engine.js";
import { MODERN } from "./rules/presets.js";
import { createRenderer } from "./render/canvas.js";
import { createKeyboard } from "./input/keyboard.js";
import { DEFAULT_KEYMAP, SYSTEM_KEYS } from "./input/keymap.js";

const FRAME_MS = 1000 / 60;
const MAX_CATCH_UP_MS = 250; // 탭 복귀 등으로 시간이 크게 튀면 한꺼번에 따라잡지 않는다.

const $ = id => /** @type {HTMLElement} */ (document.getElementById(id));
const canvas = /** @type {HTMLCanvasElement} */ ($("board"));
const overlay = $("overlay");
const hud = { time: $("hud-time"), lines: $("hud-lines"), pieces: $("hud-pieces"), pps: $("hud-pps") };

const renderer = createRenderer(canvas);

let game;
let paused = false;
let acc = 0;
let last = performance.now();

const newGame = () => {
  game = createGame({ rules: MODERN, handling: DEFAULT_HANDLING, seed: (Math.random() * 2 ** 32) >>> 0 });
  paused = false;
  acc = 0;
  keyboard.releaseAll();
  showOverlay(null);
};

const showOverlay = text => {
  overlay.hidden = !text;
  overlay.textContent = text || "";
};

const setPaused = value => {
  if (!game || game.state.over) return;
  paused = value;
  keyboard.releaseAll();
  showOverlay(paused ? "일시정지 — Esc로 계속" : null);
};

const keyboard = createKeyboard({
  keymap: DEFAULT_KEYMAP,
  systemKeys: SYSTEM_KEYS,
  onSystem: action => {
    if (action === "restart") newGame();
    if (action === "pause") setPaused(!paused);
  },
});

// 창이 포커스를 잃으면 keyup을 못 받는다 → 자동 일시정지.
window.addEventListener("blur", () => setPaused(true));
document.addEventListener("visibilitychange", () => document.hidden && setPaused(true));

const formatTime = frames => {
  const s = frames / 60;
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(2).padStart(5, "0")}`;
};

const updateHud = () => {
  const { frame, stats } = game.state;
  hud.time.textContent = formatTime(frame);
  hud.lines.textContent = String(stats.lines);
  hud.pieces.textContent = String(stats.pieces);
  hud.pps.textContent = frame ? (stats.pieces / (frame / 60)).toFixed(2) : "0.00";
};

const loop = now => {
  acc += Math.min(now - last, MAX_CATCH_UP_MS);
  last = now;
  if (paused || game.state.over) acc = 0;
  while (acc >= FRAME_MS) {
    // 모아 둔 pressed는 첫 프레임에만 넘긴다.
    const events = game.step({ held: keyboard.held, pressed: keyboard.takePressed() });
    acc -= FRAME_MS;
    if (events.some(e => e.type === "gameOver")) {
      showOverlay("게임 오버 — R로 다시 시작");
      break;
    }
  }
  renderer.draw(game);
  updateHud();
  requestAnimationFrame(loop);
};

newGame();
requestAnimationFrame(loop);

// 브라우저 테스트가 "앱이 끝까지 떴는지" 확인하는 표시.
document.documentElement.dataset.ready = "1";
