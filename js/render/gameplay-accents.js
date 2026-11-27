import { accentMaterial, accentOpacity } from "./motion-accents.js";
import { clearEffectDuration } from "./effects.js";

/** @typedef {"next" | "hold" | "spin" | "perfect" | "combo"} Accent */

/** 엔진이 확정한 사건만 시간표에 남긴다. 리플레이와 실제 게임이 같은 이벤트를 쓴다. */
export const createGameplayAccents = () => {
  let next = null;
  let holdAt = -Infinity;
  let spin = null;
  let perfectAt = -Infinity;
  let comboAt = -Infinity;

  const clear = () => {
    next = spin = null;
    holdAt = perfectAt = comboAt = -Infinity;
  };

  return {
    add(events, now) {
      for (const event of events) {
        if (event.type === "practice" && event.reset) clear();
        if (event.type === "spawn") next = event.fromHold ? null : { piece: event.piece, at: now };
        if (event.type === "hold") holdAt = now;
        if (event.type === "lock") {
          next = null;
          if (event.spinPivot) spin = { ...event.spinPivot, at: now };
          if (event.perfect) perfectAt = now;
          comboAt = event.combo >= 0 && event.lines > 0 ? now : -Infinity;
        }
      }
    },

    /** @param {import("./canvas.js").Visual} visual */
    frame(now, visual, theme) {
      const material = accentMaterial(visual.theme);
      const duration = material[2];
      const enabled = (/** @type {Accent} */ key) =>
        visual.effects === "full" && visual.gameplayEffects?.[key] !== false;
      const nextAge = enabled("next") && next ? now - next.at : Infinity;
      const holdAge = enabled("hold") ? now - holdAt : Infinity;
      const spinAge = enabled("spin") && spin ? now - spin.at : Infinity;
      const perfectAge = enabled("perfect")
        ? now - perfectAt - Math.round(clearEffectDuration(theme.motion, visual.clearEffectLength) * 0.82)
        : Infinity;
      const comboAge = enabled("combo") ? now - comboAt : Infinity;
      return {
        material,
        nextPiece: next?.piece,
        nextAlpha: accentOpacity(nextAge, duration + 95, false, 1.5),
        holdAlpha: accentOpacity(holdAge, duration + 130, false, 1.6),
        holdOffset: -0.35 * Math.max(0, 1 - holdAge / 235),
        spin: spinAge < duration + 105 ? { ...spin, age: spinAge } : null,
        perfectAge,
        combo: enabled("combo"),
        comboAlpha: accentOpacity(comboAge, duration + 110, false),
        animating:
          nextAge < duration + 95 ||
          holdAge < duration + 130 ||
          spinAge < duration + 105 ||
          perfectAge < duration + 290 ||
          comboAge < duration + 110,
      };
    },
    clear,
  };
};
