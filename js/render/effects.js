// 착지와 줄 삭제 이벤트를 화면 시계로 재생한다. 엔진 보드는 그대로 읽는다.
import { WIDTH } from "../core/board.js";
import { CELL_ID } from "../core/pieces.js";

const REDUCED_CLEAR_MS = 175;
const PRESS_AT = 0.2;
const REBOUND_AT = 0.62;

export const createEffects = () => {
  const landings = new Map();
  let clears = [];
  let drops = [];

  const add = (events, level, now, motion) => {
    if (level === "off") return;
    const full = level === "full";
    let dropDistance = 0;
    for (const e of events) {
      if (e.type === "hardDrop" && full && e.distance > 0) {
        dropDistance = e.distance;
        const tops = new Map();
        for (const [x, y] of e.cells) tops.set(x, Math.min(tops.get(x) ?? y, y));
        drops.push({ tops, distance: Math.min(motion.trailCells, e.distance), start: now, duration: motion.trailMs });
      }
      if (e.type === "practice") {
        landings.clear();
        clears = [];
        drops = [];
      }
      if (e.type !== "lock") continue;
      if (e.lines > 0) {
        landings.clear();
        clears.push({ rows: e.rows, start: now, motion });
      } else if (full && e.cells?.length) {
        const floors = new Map();
        for (const [x, y] of e.cells) floors.set(x, Math.max(floors.get(x) ?? 0, y + 1));
        for (const [x, y] of e.cells) {
          landings.set(y * WIDTH + x, {
            value: CELL_ID[e.piece],
            floor: floors.get(x),
            start: now,
            duration: motion.landMs,
            rebound: motion.rebound,
            depth: motion.depth * (1 + Math.min(1, dropDistance / 6) / 3),
          });
        }
      }
      dropDistance = 0;
    }
  };

  const prune = (now, level) => {
    for (const [key, impact] of landings) {
      if (level !== "full" || now - impact.start >= impact.duration) landings.delete(key);
    }
    drops = level === "full" ? drops.filter(drop => now - drop.start < drop.duration) : [];
    clears =
      level === "off"
        ? []
        : clears.filter(clear => now - clear.start < (level === "full" ? clear.motion.clearMs : REDUCED_CLEAR_MS));
  };

  const landing = (x, y, value, now) => {
    const impact = landings.get(y * WIDTH + x);
    if (!impact || impact.value !== value) return null;
    const t = Math.max(0, (now - impact.start) / impact.duration);
    if (t >= 1) return null;
    let scale;
    if (t < PRESS_AT) {
      scale = 1 - impact.depth * (t / PRESS_AT);
    } else if (t < REBOUND_AT) {
      const recovery = (t - PRESS_AT) / (REBOUND_AT - PRESS_AT);
      scale = 1 - impact.depth + (impact.depth + impact.rebound) * (1 - (1 - recovery) ** 2);
    } else {
      scale = 1 + impact.rebound * ((1 - t) / (1 - REBOUND_AT)) ** 2;
    }
    return { floor: impact.floor, scale };
  };

  const drawDrops = (ctx, { bx, by, cell, toY }, now, color) => {
    if (!drops.length) return;
    ctx.save();
    ctx.fillStyle = color;
    for (const drop of drops) {
      const remaining = 1 - Math.max(0, now - drop.start) / drop.duration;
      ctx.globalAlpha = 0.42 * remaining;
      for (const [x, row] of drop.tops) {
        const bottom = toY(row);
        const top = Math.max(by, bottom - drop.distance * cell * remaining);
        if (bottom > top) ctx.fillRect(bx + (x + 0.44) * cell, top, 0.12 * cell, bottom - top);
      }
    }
    ctx.restore();
  };

  const draw = (ctx, { bx, cell, toY, cols }, now, color, level) => {
    if (!clears.length) return;
    const width = cols * cell;
    ctx.save();
    ctx.fillStyle = color;
    for (const { rows, start, motion } of clears) {
      const full = level === "full";
      const duration = full ? motion.clearMs : REDUCED_CLEAR_MS;
      const t = Math.max(0, (now - start) / duration);
      const remaining = 1 - t;
      ctx.globalAlpha = (full && rows.length >= 4 ? 0.75 : 0.55) * remaining;
      for (const row of rows) {
        const middle = toY(row) + cell / 2;
        if (!full) {
          ctx.fillRect(bx, middle - cell * 0.06, width, cell * 0.12);
        } else if (motion.clear === "spread") {
          const span = width * (1 - (1 - Math.min(1, t * 2.5)) ** 2);
          const height = cell * (0.12 + remaining * 0.5);
          ctx.fillRect(bx + (width - span) / 2, middle - height / 2, span, height);
        } else if (motion.clear === "wipe") {
          const span = width * Math.min(1, t * 2.8);
          ctx.fillRect(bx, middle - cell * 0.1, span, cell * 0.2);
        } else if (motion.clear === "flash") {
          // 줄 전체가 번쩍였다가 가늘어진다
          const height = cell * (0.08 + 0.92 * remaining ** 2);
          ctx.fillRect(bx, middle - height / 2, width, height);
        } else if (motion.clear === "pop") {
          // 칸마다 작은 네모가 줄어들며 사라진다
          const size = cell * 0.7 * remaining;
          for (let c = 0; c < cols; c++) ctx.fillRect(bx + c * cell + (cell - size) / 2, middle - size / 2, size, size);
        } else if (motion.clear === "converge") {
          // 양 끝에서 가운데로 모여 닫힌다
          const half = (width / 2) * (1 - (1 - Math.min(1, t * 2.4)) ** 2);
          const height = cell * 0.18;
          ctx.fillRect(bx, middle - height / 2, half, height);
          ctx.fillRect(bx + width - half, middle - height / 2, half, height);
        } else if (motion.clear === "fade") {
          // 칸 높이 그대로 옅어지기만 한다
          ctx.globalAlpha *= 0.6;
          ctx.fillRect(bx, middle - cell * 0.45, width, cell * 0.9);
        } else if (motion.clear === "sink") {
          // 얇은 띠가 반 칸 아래로 가라앉으며 사라진다
          const y = middle + cell * 0.5 * t;
          ctx.fillRect(bx, y - cell * 0.07, width, cell * 0.14);
        } else if (motion.clear === "scan") {
          // 오른쪽에서 왼쪽으로 훑는 가는 선과 그 머리
          const head = width * (1 - Math.min(1, t * 2.2));
          ctx.fillRect(bx + head, middle - cell * 0.04, width - head, cell * 0.08);
          ctx.fillRect(bx + Math.max(0, head - cell * 0.15), toY(row), cell * 0.15, cell);
        } else {
          const offset = cell * (0.1 + 0.26 * t);
          const thickness = cell * 0.09;
          ctx.fillRect(bx, middle - offset - thickness / 2, width, thickness);
          ctx.fillRect(bx, middle + offset - thickness / 2, width, thickness);
        }
      }
    }
    ctx.restore();
  };

  return {
    add,
    drawDrops,
    prune,
    landing,
    draw,
    clear() {
      landings.clear();
      clears = [];
      drops = [];
    },
  };
};
