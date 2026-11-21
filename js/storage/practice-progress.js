export const PRACTICE_PROGRESS_KEY = "practice:progress";
const STAGE_ID = /^(?:downstack-[1-6]|finesse-lesson-(?:[1-9]|10)|intro-[1-4])$/;

export const sanitizePracticeProgress = raw => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return Object.fromEntries(
    Object.entries(raw).filter(([id, result]) => STAGE_ID.test(id) && (result === "clear" || result === "no-hints"))
  );
};

export const createPracticeProgress = store => {
  const read = () => sanitizePracticeProgress(store.get(PRACTICE_PROGRESS_KEY, null));
  return {
    read,
    mark(id, usedHint = false) {
      const progress = read();
      if (!STAGE_ID.test(id) || progress[id] === "no-hints") return;
      progress[id] = usedHint ? "clear" : "no-hints";
      store.set(PRACTICE_PROGRESS_KEY, progress);
    },
  };
};
