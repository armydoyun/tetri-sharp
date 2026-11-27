import { accentOpacity, drawAccentStroke } from "./motion-accents.js";

export const DANGER_ENTER_MS = 210;
export const DANGER_RELEASE_MS = 340;
export const GARBAGE_FOLD_MS = 236;
const GARBAGE_STAGGER_MS = 24;

const progress = (age, length) => Math.min(1, Math.max(0, age / length));

export const drawDangerLine = (ctx, material, color, left, top, columns, entered, released) => {
  const edgeInset = 0.16;
  const width = 1.1 + (columns / 2 - 1.36) * entered * (1 - released);
  drawAccentStroke(ctx, material, color, 0.88 * entered * (1 - released), path => {
    for (const side of [-1, 1]) {
      const edge = left + columns / 2 + (columns / 2 - edgeInset) * side;
      path.moveTo(edge, top + 0.87);
      path.lineTo(edge, top + 0.22);
      path.lineTo(edge - side * width, top + 0.22);
    }
  });
};

export const kickDuration = material => Math.min(320, material[2]);

/** x·y는 접촉 면 가운데, dx·dy는 장애물에서 벗어난 쪽이다. */
export const drawKickLine = (ctx, material, ink, { x, y, dx, dy }, age, reduced) => {
  const alpha = accentOpacity(age, kickDuration(material), reduced, 1.15);
  if (!alpha) return;
  const [finish, weight, duration] = material;
  ctx.save();
  ctx.translate(x, y);
  if (dx) ctx.scale(Math.sign(dx), 1);
  else ctx.rotate((Math.sign(dy) * Math.PI) / 2);
  const from = -0.485 - (reduced ? 0 : 0.14 * progress(age, 220));
  drawAccentStroke(ctx, [finish, Math.max(0.09, weight), duration], ink, alpha, path => {
    path.moveTo(-0.15, from);
    path.lineTo(-0.15, from + 0.97);
    path.lineTo(0.24, from + 0.97);
  });
  ctx.restore();
};

export const garbageFoldTime = count => GARBAGE_FOLD_MS + Math.max(0, count - 1) * GARBAGE_STAGGER_MS;

export const drawFoldingBar = (ctx, x, bottom, width, height, age, order) => {
  const fold = progress(age - order * GARBAGE_STAGGER_MS, GARBAGE_FOLD_MS);
  if (fold === 1) return;
  const remainingHeight = height * (1 - fold);
  const remainingWidth = width * (1 - 0.7 * fold);
  ctx.globalAlpha = 0.83 * (1 - fold ** 1.4);
  ctx.fillRect(x + width - remainingWidth, bottom - remainingHeight, remainingWidth, remainingHeight);
};
