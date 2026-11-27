import { accentMaterial, accentOpacity } from "./motion-accents.js";
import { clearEffectDuration } from "./effects.js";
import { DANGER_ENTER_MS, DANGER_RELEASE_MS, garbageFoldTime, kickDuration } from "./situation-effects.js";

/** @typedef {"next" | "hold" | "spin" | "perfect" | "combo" | "danger" | "kick" | "cancel" | "record"} Accent */
/** @param {import("./canvas.js").Visual} visual @param {Accent} key */
export const accentEnabled = (visual, key) => visual.effects === "full" && visual.gameplayEffects?.[key] !== false;

/** 엔진이 확정한 사건만 시간표에 남긴다. 리플레이와 실제 게임이 같은 이벤트를 쓴다. */
export const createGameplayAccents = () => {
  let next = null;
  let holdAt = -Infinity;
  let spin = null;
  let perfectAt = -Infinity;
  let comboAt = -Infinity;
  let kick = null;
  let canceled = null;
  let dangerAt = -Infinity;
  let releaseAt = -Infinity;
  let releaseLevel = 0;
  let wasDangerous = false;

  const clear = () => {
    next = spin = kick = canceled = null;
    holdAt = perfectAt = comboAt = dangerAt = releaseAt = -Infinity;
    releaseLevel = 0;
    wasDangerous = false;
  };

  return {
    add(events, now) {
      for (const event of events) {
        if (event.type === "practice" && event.reset) clear();
        if (event.type === "spawn") next = event.fromHold ? null : { piece: event.piece, at: now };
        if (event.type === "hold") holdAt = now;
        if (event.type === "rotate" && event.contact) kick = { ...event.contact, at: now };
        if (event.type === "garbageCancel") canceled = { ...event, at: now };
        if (event.type === "lock") {
          next = null;
          if (event.spinPivot) spin = { ...event.spinPivot, at: now };
          if (event.perfect) perfectAt = now;
          comboAt = event.combo >= 0 && event.lines > 0 ? now : -Infinity;
        }
      }
    },

    /** @param {import("./canvas.js").Visual} visual */
    frame(now, visual, theme, dangerous = false) {
      const material = accentMaterial(visual.theme);
      const duration = material[2];
      const enabled = (/** @type {Accent} */ key) => accentEnabled(visual, key);
      const dangerOn = enabled("danger") && dangerous;
      if (dangerOn !== wasDangerous) {
        if (dangerOn) dangerAt = now;
        else {
          releaseAt = now;
          releaseLevel = Math.min(1, (now - dangerAt) / DANGER_ENTER_MS);
        }
        wasDangerous = dangerOn;
      }
      const entered = dangerOn ? Math.min(1, (now - dangerAt) / DANGER_ENTER_MS) : releaseLevel;
      const released = dangerOn ? 0 : Math.min(1, (now - releaseAt) / DANGER_RELEASE_MS);
      const nextAge = enabled("next") && next ? now - next.at : Infinity;
      const holdAge = enabled("hold") ? now - holdAt : Infinity;
      const spinAge = enabled("spin") && spin ? now - spin.at : Infinity;
      const perfectAge = enabled("perfect")
        ? now - perfectAt - Math.round(clearEffectDuration(theme.motion, visual.clearEffectLength) * 0.82)
        : Infinity;
      const comboAge = enabled("combo") ? now - comboAt : Infinity;
      const kickAge = enabled("kick") && kick ? now - kick.at : Infinity;
      const cancelAge = enabled("cancel") && canceled ? now - canceled.at : Infinity;
      const showKick = kickAge < kickDuration(material);
      const showCancel = canceled && cancelAge < garbageFoldTime(canceled.blocked);
      const showDanger = enabled("danger") && (dangerOn || released < 1);
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
        kick: showKick ? { ...kick, age: kickAge } : null,
        canceled: showCancel ? { ...canceled, age: cancelAge } : null,
        danger: showDanger ? { entered, released } : null,
        animating:
          nextAge < duration + 95 ||
          holdAge < duration + 130 ||
          spinAge < duration + 105 ||
          perfectAge < duration + 290 ||
          comboAge < duration + 110 ||
          showKick ||
          Boolean(showCancel) ||
          (showDanger && (!dangerOn || entered < 1)),
      };
    },
    clear,
  };
};
