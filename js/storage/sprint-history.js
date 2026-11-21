export const SPRINT_HISTORY_KEY = "sprint:history";
export const SPRINT_HISTORY_LIMIT = 20;
const MAX_RULE_SETS = 50;

export const sanitizeSprintHistory = raw => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return Object.fromEntries(
    Object.entries(raw)
      .slice(-MAX_RULE_SETS)
      .flatMap(([rule, attempts]) => {
        if (!/^(?:modern|retro|arcade|custom-[\w-]{1,33})$/.test(rule) || !Array.isArray(attempts)) return [];
        const runs = attempts
          .filter(run => run && Number.isSafeInteger(run.frames) && run.frames > 0 && typeof run.cleared === "boolean")
          .slice(-SPRINT_HISTORY_LIMIT)
          .map(({ frames, cleared }) => ({ frames, cleared }));
        return runs.length ? [[rule, runs]] : [];
      })
  );
};

export const createSprintHistory = store => {
  const read = () => sanitizeSprintHistory(store.get(SPRINT_HISTORY_KEY, null));
  return {
    list: rule => read()[rule] ?? [],
    rulesIds: () => Object.keys(read()),
    add(rule, frames, cleared) {
      const history = read();
      const runs = [...(history[rule] ?? []), { frames, cleared }];
      delete history[rule];
      history[rule] = runs;
      return store.set(SPRINT_HISTORY_KEY, sanitizeSprintHistory(history));
    },
  };
};

export const recentSprintMedian = attempts => {
  const frames = attempts
    .filter(run => run.cleared)
    .slice(-5)
    .map(run => run.frames)
    .sort((a, b) => a - b);
  const mid = Math.floor(frames.length / 2);
  if (!frames.length) return null;
  return frames.length % 2 ? frames[mid] : (frames[mid - 1] + frames[mid]) / 2;
};
