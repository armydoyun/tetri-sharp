// 화면 효과: 엔진 이벤트를 받아 짧은 연출을 만들고, 렌더러가 매 프레임 그린다.
// 게임 상태는 건드리지 않는다. 시간은 화면 시계(ms) 기준이라 로직 틱과 무관하게 부드럽게 줄어든다.
// 연출의 모양은 테마(theme.fx)가, 양은 접근성 설정(효과 수준)이 정한다.
//   full    테마가 정한 연출 전부
//   reduced 움직임 없는 연출만(섬광·반짝임) — 동작 줄이기 설정의 기본값
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
   * @param {import("./themes.js").Theme} theme
   */
  const add = (events, level, now, theme) => {
    if (level === "off") return;
    const motion = level === "full";
    const fx = theme.fx;
    for (const e of events) {
      if (e.type === "hardDrop" && motion && fx.trail && e.distance > 0 && e.cells) {
        items.push({ kind: "trail", cells: e.cells, distance: e.distance, start: now, end: now + DURATION.trail });
      }
      if (e.type === "lock" && e.cells && fx.lockFlash > 0) {
        items.push({ kind: "lock", cells: e.cells, power: fx.lockFlash, start: now, end: now + DURATION.lock });
      }
      if (e.type === "lock" && e.lines > 0) {
        items.push({ kind: "flash", style: fx.flash, rows: e.rows, start: now, end: now + DURATION.flash });
        if (motion && fx.particles !== "none") {
          for (const row of e.rows) {
            for (let i = 0; i < 10; i++) {
              items.push({
                kind: "particle",
                shape: fx.particles,
                x: i + Math.random(),
                y: row + Math.random(),
                vx: (Math.random() - 0.5) * 8,
                vy: -Math.random() * 10 - 2,
                start: now,
                end: now + DURATION.particle * (0.6 + Math.random() * 0.4),
              });
            }
          }
        }
        const big = e.lines >= 4 || e.tspin === "full" || e.perfect;
        if (motion && fx.shake && big) {
          shakeUntil = now + DURATION.shake;
          shakePower = e.perfect ? 6 : 4;
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

  /** 줄 삭제 섬광의 세기(0~1): 레트로는 두 번 깜빡, 미니멀·모던은 옅어진다 */
  const flashAlpha = (style, t) => {
    if (style === "blink") return t < 0.25 || (t >= 0.5 && t < 0.75) ? 0.7 : 0;
    if (style === "fade") return 0.3 * (1 - t);
    return 0.6 * (1 - t);
  };

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {{ bx: number, cell: number, toY: (y: number) => number, cols: number }} g
   * @param {number} now
   * @param {import("./themes.js").Theme} theme
   */
  const draw = (ctx, g, now, theme) => {
    items = items.filter(it => it.end > now);
    const width = g.cols * g.cell;
    for (const it of items) {
      const t = (now - it.start) / (it.end - it.start); // 0 → 1
      if (it.kind === "flash") {
        const a = flashAlpha(it.style, t);
        for (const row of it.rows) {
          const y = g.toY(row);
          if (it.style === "sweep") {
            // 가운데에서 양옆으로 퍼지는 빛
            const half = (width / 2) * Math.min(1, t * 2.5);
            const grad = ctx.createLinearGradient(g.bx, 0, g.bx + width, 0);
            grad.addColorStop(0, "rgba(255,255,255,0)");
            grad.addColorStop(0.5, `rgba(255,255,255,${a})`);
            grad.addColorStop(1, "rgba(255,255,255,0)");
            ctx.globalAlpha = 1;
            ctx.fillStyle = grad;
            ctx.fillRect(g.bx + width / 2 - half, y, half * 2, g.cell);
          } else {
            ctx.globalAlpha = a;
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(g.bx, y, width, g.cell);
          }
        }
      } else if (it.kind === "lock") {
        ctx.fillStyle = "#ffffff";
        ctx.globalAlpha = it.power * (1 - t);
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
        ctx.fillStyle = theme.id === "modern" ? "#c7d4ff" : "#ffffff";
        ctx.globalAlpha = 1 - t;
        if (it.shape === "circle") {
          ctx.beginPath();
          ctx.arc(px, py, size / 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // 픽셀 격자에 맞춰 딱딱하게
          ctx.fillRect(Math.round(px / size) * size, Math.round(py / size) * size, size, size);
        }
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
