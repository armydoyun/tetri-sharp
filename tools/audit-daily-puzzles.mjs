import path from "node:path";
import { BTN, createGame } from "../js/core/engine.js";
import { generateSample, SAMPLE_START } from "../js/modes/daily-puzzle-generation.js";
import { dailyPuzzleMode, isDailyPuzzleDate } from "../js/modes/daily-puzzle.js";
import { comparePuzzleFingerprints, puzzleFingerprint } from "../js/modes/daily-puzzle-variety.js";

const placementKey = cells =>
  cells
    .map(([x, y]) => `${x},${y}`)
    .sort()
    .join(";");

const BUTTONS = { L: BTN.LEFT, R: BTN.RIGHT, CW: BTN.CW, CCW: BTN.CCW };

export const auditPuzzleVariety = (days, history = Infinity) => {
  const seen = [];
  return days.map(day => {
    const fingerprint = puzzleFingerprint(day);
    const matches = seen.slice(-history).map(previous => ({
      key: previous.key,
      sameFamily: previous.family === day.family,
      ...comparePuzzleFingerprints(fingerprint, previous.fingerprint),
    }));
    seen.push({ key: day.key, family: day.family, fingerprint });
    return {
      repeat: matches.find(match => match.sameBoard)?.key ?? null,
      nearby: matches.find(match => match.sameFamily && match.nearBoard)?.key ?? null,
      sameRoute: matches.find(match => match.sameRoute)?.key ?? null,
    };
  });
};

export const replayPuzzleInputs = day => {
  if (!day.controls) return false;
  const mode = dailyPuzzleMode(day.code, day);
  const game = createGame({ mode, rules: mode.rules, seed: day.seed, handling: { das: 10, arr: 2, sdf: 60 } });
  for (const [index, move] of day.stats.path.entries()) {
    while (!game.state.active && !game.state.over) game.step();
    if (game.state.over) return false;
    if (move.hold) game.step({ pressed: BTN.HOLD });
    if (game.state.active?.type !== move.type) return false;
    for (const step of day.controls.inputs[index]) {
      if (step === "D") game.step({ held: BTN.SOFT });
      else game.step({ pressed: BUTTONS[step] });
    }
    const events = game.step({ pressed: BTN.HARD });
    const lock = events.find(event => event.type === "lock");
    if (
      !lock ||
      lock.lines !== move.lines ||
      lock.tspin !== move.tspin ||
      placementKey(lock.cells) !== placementKey(move.cells)
    )
      return false;
  }
  return game.state.over === "clear";
};

const summarize = matches => ({
  repeatedBoards: matches.filter(result => result.repeat).length,
  nearbyBoards: matches.filter(result => !result.repeat && result.nearby).length,
  matchingRoutes: matches.filter(result => result.sameRoute).length,
});

const busiestWeek = (days, matches) => {
  let best = null;
  for (let i = 0; i + 7 <= days.length; i++) {
    const repeated = matches
      .slice(i, i + 7)
      .filter(result => result.repeat || result.nearby || result.sameRoute).length;
    if (!best || repeated > best.repeated) best = { from: days[i].key, to: days[i + 6].key, repeated };
  }
  return best;
};

const representative = (days, axis, other) => {
  const day = days.find(item => item[axis] === 3 && item[other] === 1) ?? days.find(item => item[axis] > item[other]);
  if (!day) return null;
  return {
    date: day.key,
    family: day.family,
    planning: day.planning,
    execution: day.execution,
    moves: day.stats.path.length,
    firstChoices: day.stats.firstChoices,
    wins: day.stats.wins,
    lateMoves: day.controls?.lateMoves,
    lateTurns: day.controls?.lateTurns,
  };
};

export const auditDailyPuzzles = (start = SAMPLE_START, count = 365) => {
  if (!isDailyPuzzleDate(start) || !Number.isSafeInteger(count) || count <= 0)
    throw new Error("Expected an ISO start date and a positive number of days.");
  const days = generateSample(start, count);
  const all = auditPuzzleVariety(days);
  const recent = auditPuzzleVariety(days, 35);
  const perFamily = {};
  for (const [i, day] of days.entries()) {
    const family = (perFamily[day.family] ??= { matches: [], count: 0 });
    family.count++;
    family.matches.push(all[i]);
  }
  const failedInputChecks = days.filter(day => !replayPuzzleInputs(day)).map(day => day.key);
  return {
    start,
    end: days.at(-1).key,
    count,
    inputReplaysPassed: count - failedInputChecks.length,
    failedInputChecks,
    fallback: days.filter(day => day.family !== day.planned).length,
    wholePeriod: summarize(all),
    within35Days: summarize(recent),
    busiestWeek: busiestWeek(days, recent),
    levels: [1, 2, 3].map(level => days.filter(day => day.level === level).length),
    planningAboveExecution: days.filter(day => day.planning > day.execution).length,
    executionAbovePlanning: days.filter(day => day.execution > day.planning).length,
    examples: {
      planning: representative(days, "planning", "execution"),
      execution: representative(days, "execution", "planning"),
    },
    byFamily: Object.fromEntries(
      Object.entries(perFamily).map(([family, data]) => [family, { count: data.count, ...summarize(data.matches) }])
    ),
  };
};

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  const report = auditDailyPuzzles(
    process.argv[2],
    process.argv[3] === undefined ? undefined : Number(process.argv[3])
  );
  console.log(JSON.stringify(report, null, 2));
  if (report.failedInputChecks.length) process.exitCode = 1;
}
