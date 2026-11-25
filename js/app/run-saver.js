// 이어서 하기: 진행 중인 판을 입력 기록(journal)으로 이 기기에 저장하고, 다음에 그 기록을 다시 돌려 같은 자리로 되살린다.
//  - 기록·저장·지우기, 다른 창에서 저장된 판이 바뀌었는지 확인, 새 판이 저장된 판을 지울 때 묻기
//  - 첫 화면 "이어서 하기" 단추와 되살리는 절차(되살리는 중 표시 → 기록 다시 돌리기 → 체크포인트 대조 → 실패하면 알림)
// 판을 시작하고 한 프레임 진행하는 일은 게임 쪽(main.js)이 hooks로 맡는다 — 이 모듈은 게임 규칙을 모른다.
import { createRunJournal, readSuspendedRun, replayRunJournal, SUSPENDED_RUN_KEY } from "../storage/suspended-run.js";
import { sanitizeSettings } from "../storage/settings.js";
import { customPuzzleMode, decodePuzzle } from "../modes/custom-puzzle.js";
import { formatTime } from "../modes/format.js";
import { t } from "../i18n/index.js";

const $ = id => /** @type {HTMLElement} */ (document.getElementById(id));
const newId = () => Array.from(crypto.getRandomValues(new Uint32Array(4))).join("-");

/**
 * @param {{
 *   store: ReturnType<typeof import("../storage/store.js").createStore>,
 *   findMode: (id: string) => any,
 *   lessons: ReadonlyArray<ReadonlyArray<any>>,
 *   ask: (options: any) => Promise<boolean>,
 *   saveInterval: number,
 *   live: {
 *     journalInfo: () => { mode: any, rules: any, handling: any, name: string, resultPbSplits: any, pbSplits: any },
 *     game: () => any,
 *     sceneEnded: () => boolean,
 *     fingerprint: () => string,
 *     paused: () => boolean,
 *   },
 *   hooks: {
 *     canRestore: () => boolean,
 *     prepare: (entry: any, mode: any, handling: any) => void,
 *     applyAction: (kind: string, value: any) => void,
 *     applyInput: (held: number, pressed: number) => void,
 *     adopted: (mode: any) => void,
 *     failed: () => void,
 *     restored: () => void,
 *   },
 * }} deps
 */
export const createRunSaver = ({ store, findMode, lessons, ask, saveInterval, live, hooks }) => {
  let journal = null;
  /** 이 창이 마지막으로 저장한(또는 시작할 때 본) 저장된 판의 id — 다른 창이 바꿨는지 가린다 */
  let savedRunId = null;
  let lastSavedStep = -1;
  let restoring = false;
  const button = /** @type {HTMLButtonElement} */ ($("continue-run"));

  const savedRun = () => readSuspendedRun(store.get(SUSPENDED_RUN_KEY, null));

  /** 저장된 판의 모드(연습 단계·만든 퍼즐 포함). 지금 버전에 없는 모드면 null */
  const runMode = entry => {
    if (entry.mode === "custom-puzzle") {
      const puzzle = decodePuzzle(entry.puzzle);
      return puzzle
        ? { ...customPuzzleMode(puzzle), puzzleCode: entry.puzzle, trialCode: entry.trial ? entry.puzzle : null }
        : null;
    }
    const found = lessons.flat().find(item => item.id === entry.mode) ?? findMode(entry.mode);
    return found.id === entry.mode ? found : null;
  };

  /** 첫 화면 "이어서 하기" 단추: 저장된 판이 있으면 모드·시간·줄 수와 함께 보인다 */
  const renderContinue = () => {
    const entry = savedRun();
    const m = entry && runMode(entry);
    button.hidden = !m;
    if (m)
      $("continue-run-info").textContent = t("{mode} · {time} · {lines}줄", {
        mode: m.name,
        time: formatTime(entry.frame),
        lines: entry.lines,
      });
  };

  /** 새 판의 기록을 시작한다(되살리는 중에는 기록을 이어 쓰므로 하지 않는다) */
  const begin = (seed, target, scene = null) => {
    if (restoring) return;
    savedRunId = savedRun()?.id ?? null;
    lastSavedStep = -1;
    const { mode, rules, handling, name, resultPbSplits, pbSplits } = live.journalInfo();
    journal = createRunJournal({
      id: newId(),
      mode: mode.id,
      seed,
      rules,
      handling,
      name,
      target,
      puzzle: mode.puzzleCode,
      trial: Boolean(mode.trialCode),
      scene,
      resultPbSplits,
      pbSplits,
    });
  };

  /** 지금 판을 저장한다. force가 아니면 마지막 저장 뒤 saveInterval 걸음이 지났을 때만 */
  const save = (force = true) => {
    const game = live.game();
    if (restoring || !journal || !game || game.state.over || live.sceneEnded()) return;
    const entry = journal.entry;
    if (!force && entry.steps - lastSavedStep < saveInterval) return;
    const current = savedRun();
    const status = text => {
      if (live.paused()) $("resume-save-status").textContent = text;
    };
    if ((current?.id ?? null) !== savedRunId) {
      lastSavedStep = entry.steps;
      status(t("다른 창에서 저장된 판이 바뀌었어요."));
      return;
    }
    const snapshot = {
      ...entry,
      frame: game.state.frame,
      lines: game.state.stats.lines,
      fingerprint: live.fingerprint(),
    };
    if (store.set(SUSPENDED_RUN_KEY, snapshot)) {
      savedRunId = entry.id;
      lastSavedStep = entry.steps;
      status(t("창을 닫아도 이 판은 이 기기에 남아요."));
    } else {
      // 재시도 간격을 유지하고, 일시정지·창 닫기 때는 다시 시도한다.
      lastSavedStep = entry.steps;
      status(t("저장 공간을 확인해 주세요. 이번 진행을 저장하지 못했어요."));
    }
  };

  /** 이 판의 기록을 버린다(끝났거나 다른 판으로 넘어갔다). 저장된 판이 이 판이면 지운다 */
  const clear = () => {
    if (journal && savedRun()?.id === journal.entry.id) store.set(SUSPENDED_RUN_KEY, null);
    journal = null;
  };

  /** 이어서 할 판이 저장돼 있는데 다른 판을 시작하려 하는가(그러면 먼저 묻는다) */
  const replacesSaved = () => {
    const current = savedRun();
    return Boolean(current) && !(journal && current.id === savedRunId);
  };

  /** 저장된 판을 버릴지 앱 안의 확인 대화상자로 묻고, 그러자고 하면 then을 부른다 */
  const confirmReplace = then =>
    ask({
      title: t("저장된 판을 지울까요?"),
      message: t("이어서 할 수 있게 저장해 둔 판이 있어요. 새 판을 시작하면 그 판은 지워져요."),
      okLabel: t("지우고 새 판 시작"),
      okIcon: "play",
    }).then(ok => {
      if (ok) then();
    });

  /** 저장된 판을 되살린다: 같은 시드·규칙으로 시작해 기록한 입력을 다시 돌리고, 체크포인트가 맞으면 이어 간다 */
  const restore = async () => {
    if (!hooks.canRestore() || restoring) return;
    const entry = savedRun();
    const m = entry && runMode(entry);
    if (!m) return;
    const handling = sanitizeSettings({ handling: entry.handling }).handling;
    restoring = true;
    document.body.inert = true;
    let success = false;
    try {
      hooks.prepare(entry, m, handling);
      await replayRunJournal(entry, { applyAction: hooks.applyAction, applyInput: hooks.applyInput });
      if (savedRun()?.id !== entry.id || live.fingerprint() !== entry.fingerprint) throw new Error("checkpoint");
      hooks.adopted(m);
      savedRunId = entry.id;
      journal = createRunJournal(null, { ...entry, id: newId() });
      lastSavedStep = -1;
      success = true;
    } catch {
      hooks.failed();
    } finally {
      document.body.inert = false;
      restoring = false;
    }
    if (success) hooks.restored();
  };

  button.addEventListener("click", restore);

  return {
    /** 첫 화면의 "이어서 하기" 단추(포커스를 둘 때) */
    button,
    /** 지금 판의 기록(입력·동작을 덧붙인다). 기록하지 않는 판이면 null */
    get journal() {
      return journal;
    },
    /** 저장된 판을 되살리는 중 */
    get restoring() {
      return restoring;
    },
    renderContinue,
    begin,
    save,
    clear,
    replacesSaved,
    confirmReplace,
  };
};
