// 진행 중인 판은 시드와 실제로 적용된 입력을 보관한다. 되돌리기·힌트·조작 변경도 프레임 사이에 기록한다.
export const SUSPENDED_RUN_KEY = "run:suspended";
const VERSION = 1;

const isFrame = value => Number.isSafeInteger(value) && value >= 0;
const isInput = value => Number.isInteger(value) && value >= 0 && value <= 255;
const isOrdered = (list, lastFrame, valid) =>
  Array.isArray(list) &&
  list.every(
    (entry, i) =>
      Array.isArray(entry) &&
      entry.length === 3 &&
      isFrame(entry[0]) &&
      entry[0] <= lastFrame &&
      (i === 0 || entry[0] >= list[i - 1][0]) &&
      valid(entry)
  );

export const readSuspendedRun = raw => {
  if (
    raw?.v !== VERSION ||
    typeof raw.id !== "string" ||
    typeof raw.mode !== "string" ||
    !isFrame(raw.seed) ||
    raw.seed > 0xffffffff ||
    !isFrame(raw.steps) ||
    !isFrame(raw.frame) ||
    !isFrame(raw.lines) ||
    typeof raw.fingerprint !== "string" ||
    !raw.rules ||
    !raw.handling ||
    !isOrdered(raw.inputs, raw.steps - 1, ([, held, pressed]) => isInput(held) && isInput(pressed)) ||
    !isOrdered(
      raw.actions,
      raw.steps,
      ([, kind, value]) =>
        ((kind === "undo" || kind === "hint") && value === null) ||
        (kind === "handling" && value && typeof value === "object")
    )
  )
    return null;
  return raw;
};

export const createRunJournal = (options, saved = null) => {
  const entry = saved ?? { ...options, v: VERSION, steps: 0, inputs: [], actions: [] };
  let held = entry.inputs.at(-1)?.[1] ?? 0;
  return {
    entry,
    input(nextHeld, pressed) {
      if (held !== nextHeld || pressed) entry.inputs.push([entry.steps, nextHeld, pressed]);
      held = nextHeld;
      entry.steps++;
    },
    action(kind, value = null) {
      entry.actions.push([entry.steps, kind, value]);
    },
  };
};

/** 엔진이 규칙 변경 등으로 다른 판을 재현했다면 그 판을 이어서 기록하지 않는다. */
export const runFingerprint = (game, opponent = null) =>
  JSON.stringify(
    [game, opponent].map(current => {
      if (!current) return null;
      const { board, active, queue, hold, holdUsed, frame, score, level, stats, lock, das, are, garbage } =
        current.state;
      return [
        board.cells.join(""),
        active,
        queue,
        hold,
        holdUsed,
        frame,
        score,
        level,
        stats,
        lock,
        das,
        are,
        garbage?.pending,
        garbage?.received,
        garbage?.sent,
        ...(current.state.timeShift
          ? [current.state.timeShift.past, current.state.timeShift.moves, current.state.timeShift.echoLines]
          : []),
      ];
    })
  );

// 입력 사이의 조작을 원래 순서로 적용한다. 긴 판을 불러오는 동안 브라우저도 화면을 갱신할 수 있다.
export const replayRunJournal = async (entry, { applyInput, applyAction }) => {
  let inputIndex = 0;
  let actionIndex = 0;
  let held = 0;
  let yieldAt = performance.now() + 12;
  for (let step = 0; step <= entry.steps; step++) {
    while (entry.actions[actionIndex]?.[0] === step) {
      const [, kind, value] = entry.actions[actionIndex++];
      applyAction(kind, value);
    }
    if (step === entry.steps) break;
    let pressed = 0;
    if (entry.inputs[inputIndex]?.[0] === step) {
      [, held, pressed] = entry.inputs[inputIndex++];
    }
    applyInput(held, pressed);
    if (step % 60 === 0 && performance.now() >= yieldAt) {
      await new Promise(resolve => setTimeout(resolve, 0));
      yieldAt = performance.now() + 12;
    }
  }
};
