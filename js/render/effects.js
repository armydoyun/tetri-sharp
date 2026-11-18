// 착지와 줄 삭제 이벤트를 화면 시계로 재생한다. 엔진 보드는 그대로 읽는다.
import { WIDTH } from "../core/board.js";
import { CELL_ID } from "../core/pieces.js";

const LAND_MS = 145;
const CLEAR_MS = 175;
const PRESS_AT = 0.2;

export const createEffects = () => {
  const landings = new Map();
  let clears = [];

  const add = (events, level, now) => {
    if (level === "off") return;
    const full = level === "full";
    for (const e of events) {
      if (e.type === "practice") {
        landings.clear();
        clears = [];
      }
      if (e.type !== "lock") continue;
      if (e.lines > 0) {
        landings.clear();
        clears.push({ rows: e.rows, start: now });
      } else if (full && e.cells?.length) {
        const floors = new Map();
        for (const [x, y] of e.cells) floors.set(x, Math.max(floors.get(x) ?? 0, y + 1));
        for (const [x, y] of e.cells) {
          landings.set(y * WIDTH + x, { value: CELL_ID[e.piece], floor: floors.get(x), start: now });
        }
      }
    }
  };

  const prune = (now, level) => {
    for (const [key, impact] of landings) {
      if (level !== "full" || now - impact.start >= LAND_MS) landings.delete(key);
    }
    clears = level === "off" ? [] : clears.filter(clear => now - clear.start < CLEAR_MS);
  };

  const landing = (x, y, value, now) => {
    const impact = landings.get(y * WIDTH + x);
    if (!impact || impact.value !== value) return null;
    const t = Math.max(0, (now - impact.start) / LAND_MS);
    if (t >= 1) return null;
    const pressure = t < PRESS_AT ? t / PRESS_AT : (1 - (t - PRESS_AT) / (1 - PRESS_AT)) ** 2;
    return { floor: impact.floor, scale: 1 - 0.12 * pressure };
  };

  const draw = (ctx, { bx, cell, toY, cols }, now, color, level) => {
    ctx.save();
    ctx.fillStyle = color;
    for (const clear of clears) {
      const remaining = 1 - Math.max(0, now - clear.start) / CLEAR_MS;
      const height = cell * (level === "full" ? 0.12 + remaining * 0.5 : 0.12);
      ctx.globalAlpha = 0.55 * remaining;
      for (const row of clear.rows) ctx.fillRect(bx, toY(row) + (cell - height) / 2, cols * cell, height);
    }
    ctx.restore();
  };

  return {
    add,
    prune,
    landing,
    draw,
    clear() {
      landings.clear();
      clears = [];
    },
  };
};
