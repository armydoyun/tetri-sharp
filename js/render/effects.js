// 화면 효과: 엔진 이벤트를 받아 짧은 연출을 만들고, 렌더러가 매 프레임 그린다.
// 게임 상태는 건드리지 않는다. 시간은 화면 시계(ms) 기준이라 로직 틱과 무관하게 부드럽게 줄어든다.
//   full    줄 삭제 섬광 + 파편, 하드 드롭 잔상, 고정 반짝임, 큰 클리어 때 화면 흔들림
//   reduced 섬광·반짝임만(움직임 없음) — 동작 줄이기 설정의 기본값
//   off     없음

const DURATION = { flash: 260, lock: 140, trail: 160, shake: 180, particle: 600 };

/** @typedef {"full" | "reduced" | "off"} EffectLevel */

export const createEffects = () => {
  /** @type {any[]} */
  let items = [];
  let shakeUntil = 0;
  let shakePower = 0;

  /**
   * @param {any[]} events  엔진 step()의 결과
   * @param {EffectLevel} level
   * @param {number} now
   */
  const add = (events, level, now) => {
    if (level === "off") return;
    const motion = level === "full";
    for (const e of events) {
      if (e.type === "hardDrop" && motion && e.distance > 0 && e.cells) {
        items.push({ kind: "trail", cells: e.cells, distance: e.distance, start: now, end: now + DURATION.trail });
      }
      if (e.type === "lock" && e.cells) {
        items.push({ kind: "lock", cells: e.cells, start: now, end: now + DURATION.lock });
      }
      if (e.type === "lock" && e.lines > 0) {
        items.push({ kind: "flash", rows: e.rows, start: now, end: now + DURATION.flash });
        if (motion) {
          for (const row of e.rows) {
            for (let i = 0; i < 10; i++) {
              items.push({
                kind: "particle",
                x: i + Math.random(),
                y: row + Math.random(),
                vx: (Math.random() - 0.5) * 8,
                vy: -Math.random() * 10 - 2,
                start: now,
                end: now + DURATION.particle * (0.6 + Math.random() * 0.4),
              });
            }
          }
          const big = e.lines >= 4 || e.tspin === "full" || e.perfect;
          if (big) {
            shakeUntil = now + DURATION.shake;
            shakePower = e.perfect ? 6 : 4;
          }
        }
      }
    }
  };

  /** 화면 흔들림 오프셋(px, 캔버스 해상도 기준) */
  const shake = (now, scale) => {
    if (now >= shakeUntil) return { dx: 0, dy: 0 };
    const t = (shakeUntil - now) / DURATION.shake;
    const p = shakePower * t * scale;
    return { dx: Math.round((Math.random() - 0.5) * p), dy: Math.round((Math.random() - 0.5) * p) };
  };

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {{ bx: number, cell: number, toY: (y: number) => number, cols: number }} g
   */
  const draw = (ctx, g, now, accent) => {
    items = items.filter(it => it.end > now);
    for (const it of items) {
      const t = (now - it.start) / (it.end - it.start); // 0 → 1
      if (it.kind === "flash") {
        ctx.fillStyle = "#ffffff";
        ctx.globalAlpha = 0.55 * (1 - t);
        for (const row of it.rows) ctx.fillRect(g.bx, g.toY(row), g.cols * g.cell, g.cell);
      } else if (it.kind === "lock") {
        ctx.fillStyle = "#ffffff";
        ctx.globalAlpha = 0.35 * (1 - t);
        for (const [x, y] of it.cells) ctx.fillRect(g.bx + x * g.cell + 1, g.toY(y) + 1, g.cell - 2, g.cell - 2);
      } else if (it.kind === "trail") {
        // 착지한 각 열 위로 떨어진 거리만큼 옅은 기둥
        const columns = new Map();
        for (const [x, y] of it.cells) columns.set(x, Math.min(columns.get(x) ?? Infinity, y));
        for (const [x, top] of columns) {
          const h = it.distance * g.cell;
          const grad = ctx.createLinearGradient(0, g.toY(top) - h, 0, g.toY(top));
          grad.addColorStop(0, "rgba(255,255,255,0)");
          grad.addColorStop(1, "rgba(255,255,255,0.35)");
          ctx.fillStyle = grad;
          ctx.globalAlpha = 1 - t;
          ctx.fillRect(g.bx + x * g.cell + g.cell * 0.15, g.toY(top) - h, g.cell * 0.7, h);
        }
      } else if (it.kind === "particle") {
        const secs = (now - it.start) / 1000;
        const px = g.bx + (it.x + it.vx * secs) * g.cell;
        const py = g.toY(it.y + it.vy * secs + 25 * secs * secs);
        const size = Math.max(2, g.cell * 0.18);
        ctx.fillStyle = accent;
        ctx.globalAlpha = 1 - t;
        ctx.fillRect(px, py, size, size);
      }
    }
    ctx.globalAlpha = 1;
  };

  return {
    add,
    draw,
    shake,
    clear: () => {
      items = [];
      shakeUntil = 0;
    },
    get count() {
      return items.length;
    },
  };
};
