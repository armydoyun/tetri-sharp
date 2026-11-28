import { TIME_SHIFT_STAGES, findTimeShiftStage } from "../modes/time-shift.js";

export const TIME_SHIFT_PROGRESS_KEY = "time-shift:progress";

export const sanitizeTimeShiftProgress = raw =>
  Array.isArray(raw) ? TIME_SHIFT_STAGES.filter(stage => raw.includes(stage.id)).map(stage => stage.id) : [];

/** @param {ReturnType<typeof import("./store.js").createStore>} store */
export const createTimeShiftProgress = store => {
  const read = () => sanitizeTimeShiftProgress(store.get(TIME_SHIFT_PROGRESS_KEY, []));
  return {
    read,
    mark(id) {
      const cleared = read();
      if (cleared.includes(id)) return true;
      return Boolean(findTimeShiftStage(id)) && store.set(TIME_SHIFT_PROGRESS_KEY, [...cleared, id]);
    },
  };
};
