import { EXPEDITION_STAGES } from "../modes/expedition.js";

export const EXPEDITION_PROGRESS_KEY = "expedition:progress";

export const sanitizeExpeditionProgress = raw => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return Object.fromEntries(
    EXPEDITION_STAGES.map(({ id }) => [id, raw[id]]).filter(([, result]) => result === "clear" || result === "bonus")
  );
};

export const createExpeditionProgress = store => {
  const read = () => sanitizeExpeditionProgress(store.get(EXPEDITION_PROGRESS_KEY, null));
  return {
    read,
    mark(id, bonus) {
      if (!EXPEDITION_STAGES.some(stage => stage.id === id)) return;
      const progress = read();
      if (progress[id] === "bonus" || (progress[id] === "clear" && !bonus)) return;
      progress[id] = bonus ? "bonus" : "clear";
      store.set(EXPEDITION_PROGRESS_KEY, progress);
    },
  };
};
