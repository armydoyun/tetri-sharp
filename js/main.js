// 진입점: 화면 흐름(메뉴 → 카운트다운 → 플레이 → 결과), 게임 루프, 입력, 설정, 기록을 연결한다.
// 로직은 고정 60Hz로 진행하고 화면은 모니터 주사율대로 그린다.
import { BTN, createGame } from "./core/engine.js";
import { createRenderer } from "./render/canvas.js";
import { createKeyboard } from "./input/keyboard.js";
import { createTouch, touchVisible } from "./input/touch.js";
import { compilePadmap, createGamepad } from "./input/gamepad.js";
import { ACTIONS, compileKeymap, keyLabel } from "./input/keymap.js";
import { RANK_STEPS, isRankedRules, rankLabel, rankOf } from "./modes/ranks.js";
import { MAX_RULE_SLOTS, createRuleSlots } from "./storage/rule-slots.js";
import { ACHIEVEMENTS, createAchievements } from "./storage/achievements.js";
import { createAchievementsUI } from "./ui/achievements.js";
import { MODES, RECORD_MODES, SURVIVAL_MILESTONES, findMode as findBaseMode } from "./modes/index.js";
import { dailyMode, dateKey, findDaily, recentDailyKeys } from "./modes/daily.js";
import { decodeReplayCode, encodeReplayCode, replayLink } from "./replay/share.js";
import { createDailyUI } from "./ui/daily.js";
import { formatScore, formatTime } from "./modes/format.js";
import { createStore } from "./storage/store.js";
import {
  createRunJournal,
  readSuspendedRun,
  replayRunJournal,
  runFingerprint,
  SUSPENDED_RUN_KEY,
} from "./storage/suspended-run.js";
import { loadSettings, sanitizeSettings, saveSettings, toEngineHandling } from "./storage/settings.js";
import { createRecords } from "./storage/records.js";
import { createSettingsUI } from "./ui/settings.js";
import { createRulesUI } from "./ui/rules.js";
import { button, menuRow, segmentButtons } from "./ui/components.js";
import { el } from "./ui/dom.js";
import { dropdown } from "./ui/select.js";
import { createRecordsUI } from "./ui/records.js";
import { createStatsUI } from "./ui/stats.js";
import { createPracticeUI } from "./ui/practice.js";
import { practiceMode } from "./modes/practice.js";
import { advanceSplits, analyzeSplits, formatDelta, splitDelta } from "./modes/splits.js";
import { hydrateIcons, icon } from "./ui/icons.js";
import { keycap } from "./ui/keycap.js";
import {
  MAX_RANKED,
  replayMatches,
  createPlayer,
  createRecorder,
  createReplayStore,
  sanitizeReplay,
  verifyReplay,
} from "./replay/replay.js";
import {
  createSceneAttempt,
  createSurvivalAttempt,
  findSurvivalRescue,
  splitAttemptOutcome,
} from "./replay/practice.js";
import { recordKey } from "./storage/records.js";
import { MODERN, PRESETS, PRESET_LIST } from "./rules/presets.js";
import { makeCustomRules, sanitizeRuleBody } from "./rules/sanitize.js";
import { decodeRules } from "./rules/share.js";
import { createSfx } from "./audio/sfx.js";
import { DOWNSTACK_LESSONS } from "./modes/downstack.js";
import { BUILD_LESSONS } from "./modes/build-lessons.js";
import { BATTLE_LESSONS } from "./modes/battle-lessons.js";
import { INTRO_LESSONS } from "./modes/intro-lessons.js";
import { createPracticeProgress } from "./storage/practice-progress.js";
import { SPRINT_HISTORY_KEY, createSprintHistory } from "./storage/sprint-history.js";
import { FINESSE_LESSONS } from "./modes/finesse-lessons.js";
import { createFinesseTracker } from "./modes/finesse.js";
import { analyzeReplay } from "./replay/analyze.js";
import { ROTATIONS } from "./rules/rotation/index.js";
import { STYLES, WIN, settleBattleFrame, versusMode, versusStatKey } from "./modes/versus.js";
import { createBot } from "./ai/bot.js";
import { createGestures } from "./input/gestures.js";
import { createUndo } from "./modes/undo.js";
import { createHelpUI } from "./ui/help.js";
import { PUZZLES, createPuzzleProgress, findPuzzle, puzzleMode } from "./modes/puzzles.js";
import { customPuzzleMode, decodePuzzle } from "./modes/custom-puzzle.js";
import { createPuzzleEditor } from "./ui/puzzle-editor.js";
import { createPuzzleUI } from "./ui/puzzles.js";
import { createShareUI } from "./ui/share.js";
import { createVersusUI } from "./ui/versus.js";
import { lang, t, translateDom } from "./i18n/index.js";
import { createFeedback } from "./app/feedback.js";
import { createInputDisplay } from "./app/input-display.js";
import { createKeyHelp } from "./app/key-help.js";
import { setupBackup } from "./app/backup.js";
import { downloadJson } from "./app/download.js";
import { takeLinkHash } from "./app/links.js";

const FRAME_MS = 1000 / 60;
const MAX_CATCH_UP_MS = 250; // 시간이 크게 튀면(탭 복귀 등) 한꺼번에 따라잡지 않는다.
const READY_FRAMES = 40; // "READY"
/** 카운트다운 길이 설정 → 프레임 */
const COUNTDOWN_FRAMES = { normal: READY_FRAMES, short: 15, off: 0 };
const SAVE_INTERVAL = 600; // 강제 종료에 대비해 10초마다 저장한다.
const GO_FRAMES = 20; // "GO!" — 이 동안에는 이미 플레이 중

const $ = id => /** @type {HTMLElement} */ (document.getElementById(id));
const canvas = /** @type {HTMLCanvasElement} */ ($("board"));
const panels = {
  menu: $("menu"),
  pause: $("pause"),
  confirm: $("confirm"),
  results: $("results"),
  sceneResult: $("scene-result"),
};
const countdownEl = $("countdown");
const hud = {
  timeLabel: $("hud-time-label"),
  time: $("hud-time"),
  survivalGoal: $("hud-survival-goal"),
  score: $("hud-score"),
  level: $("hud-level"),
  linesLabel: $("hud-lines-label"),
  lines: $("hud-lines"),
  pieces: $("hud-pieces"),
  pps: $("hud-pps"),
  split: $("hud-split"),
  streak: $("hud-streak"),
  finesse: $("hud-finesse"),
  attack: $("hud-attack"),
};

const store = createStore();
const records = createRecords(store);
const practiceProgress = createPracticeProgress(store);
const sprintHistory = createSprintHistory(store);
let settings = loadSettings(store);
let bindings = compileKeymap(settings.keymap);
let padBindings = compilePadmap(settings.padmap);

/** 화면 색: 시스템이면 표시를 지워 미디어 쿼리를 따르고, 아니면 html[data-scheme]으로 덮는다 */
const applyScheme = () => {
  if (settings.scheme === "system") delete document.documentElement.dataset.scheme;
  else document.documentElement.dataset.scheme = settings.scheme;
  // 게임 화면: 늘 어둡게(기본) 또는 화면 색 따르기 — css/tokens.css
  document.body.dataset.gameSurface = settings.gameSurface;
  document.body.classList.toggle("show-inputs", settings.visual.inputs === "on");
  refreshBoardColors();
};

const renderer = createRenderer(canvas, { getVisual: () => settings.visual });
const sfx = createSfx({ getVolume: () => settings.volume });
const racePanel = $("race-panel");
const raceProgress = /** @type {HTMLProgressElement} */ ($("race-progress"));
const raceLabel = $("race-progress-label");
const raceOwnProgress = /** @type {HTMLProgressElement} */ ($("race-own-progress"));
const raceBoard = /** @type {HTMLCanvasElement} */ ($("race-board"));
const raceBoardVisible = window.matchMedia("(width > 720px)");
const raceRenderer = createRenderer(raceBoard, {
  compact: true,
  getVisual: () => settings.visual,
});
let race = null;

// ---- CPU 대전: 상대 엔진 + CPU 입력 ----
const versusPanel = $("versus-panel");
const cpuRenderer = createRenderer(/** @type {HTMLCanvasElement} */ ($("cpu-board")), {
  compact: true,
  getVisual: () => settings.visual,
});
const replayCpuRenderer = createRenderer(/** @type {HTMLCanvasElement} */ ($("replay-cpu-board")), {
  getVisual: () => settings.visual,
});
const refreshBoardColors = () => {
  renderer.invalidate();
  replayCpuRenderer.invalidate();
};
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", refreshBoardColors);
applyScheme();
/** @type {null | { cpu: ReturnType<typeof createGame>, bot: ReturnType<typeof createBot>, recorder: ReturnType<typeof createRecorder> }} */
let versus = null;
/** "CPU · 쉬움", 균형이 아닌 성향이면 "CPU · 쉬움 · 4줄 노림" */
const versusTitle = versus => {
  const style = STYLES.find(x => x.id === versus.style);
  return style && style.id !== "balanced"
    ? t("CPU · {level} · {style}", { level: versus.name, style: style.name })
    : t("CPU · {level}", { level: versus.name });
};
/** 난이도별 전적 */
const versusStats = () => {
  const raw = store.get("versus:stats", {});
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
};
const addVersusResult = (levelId, won) => {
  const all = versusStats();
  const s = all[levelId] && typeof all[levelId] === "object" ? all[levelId] : { win: 0, loss: 0 };
  all[levelId] = { win: (s.win | 0) + (won ? 1 : 0), loss: (s.loss | 0) + (won ? 0 : 1) };
  store.set("versus:stats", all);
};

/** @type {"menu" | "countdown" | "play" | "paused" | "results" | "replay"} */
let screen = "menu";
/** @typedef {{from: number, to: number, endFrame: number}} SceneSplit */
/** @typedef {import("./replay/analyze.js").FinesseScene} FinesseScene */
/** @type {{spawnFrame: number, split: SceneSplit | null, target: FinesseScene | null, rescue: ReturnType<typeof findSurvivalRescue>, startFrame: number, best: number | null, ended: boolean} | null} */
let scenePractice = null;
let sceneFinesse = null;
/** 모드 찾기: 오늘의 도전(날짜별) + 나머지 */
const findMode = id => findDaily(id) ?? findPuzzle(id) ?? findBaseMode(id);
let mode = findMode(store.get("lastMode", null));

// ---- 규칙 선택 (Modern / Retro / Arcade / Custom) ----

const RULE_CHOICES = [...PRESET_LIST.map(p => p.id), "custom"];
let ruleChoice = RULE_CHOICES.includes(store.get("lastRules", null)) ? store.get("lastRules", null) : "modern";
// 내 규칙(이름 붙인 Custom 규칙 여러 개). customBody는 지금 고른 규칙의 내용
const ruleSlots = createRuleSlots(store);
let customBody = ruleSlots.active().body;
/** 지금 고른 규칙 */
const currentRules = () => (ruleChoice === "custom" ? makeCustomRules(customBody) : PRESETS[ruleChoice]);
/** 규칙 id → 규칙: 프리셋이거나 지금 쓰는 Custom 규칙일 때만(다른 Custom 내용은 기록에 id만 있다) */
const rulesById = id => {
  if (PRESETS[id]) return PRESETS[id];
  const slot = ruleSlots.read().slots.find(x => makeCustomRules(x.body).id === id);
  return slot ? makeCustomRules(slot.body) : null;
};
/** 이번 판에 쓰는 규칙(게임 중에 Custom을 고쳐도 이번 판 기록은 시작할 때 규칙으로 남는다) */
let rules = currentRules();
let runPlayerName = "";
/** @type {ReturnType<typeof createGame> | null} */
let game = null;
let countdown = 0;
/** 이번 판의 구간 기록(프레임)과 비교할 최고 기록의 구간 */
let splits = [];
let resultPbSplits = /** @type {number[] | undefined} */ (undefined);
let pbSplits = /** @type {number[] | undefined} */ (undefined);
let goTimer = 0;
/** @type {ReturnType<typeof createFinesseTracker> | null} 이번 판의 피네스 판정 */
let finesse = null;
let acc = 0;
let last = performance.now();

// ---- 이어서 하기 ----
let runJournal = null;
let savedRunId = null;
let lastSavedStep = -1;
let restoringRun = false;
const continueRun = /** @type {HTMLButtonElement} */ ($("continue-run"));
const savedRun = () => readSuspendedRun(store.get(SUSPENDED_RUN_KEY, null));
const getRunMode = entry => {
  if (entry.mode === "custom-puzzle") {
    const puzzle = decodePuzzle(entry.puzzle);
    return puzzle
      ? { ...customPuzzleMode(puzzle), puzzleCode: entry.puzzle, trialCode: entry.trial ? entry.puzzle : null }
      : null;
  }
  const found =
    [INTRO_LESSONS, BATTLE_LESSONS, BUILD_LESSONS, DOWNSTACK_LESSONS, FINESSE_LESSONS]
      .flat()
      .find(item => item.id === entry.mode) ?? findMode(entry.mode);
  return found.id === entry.mode ? found : null;
};
const renderContinue = () => {
  const entry = savedRun();
  const m = entry && getRunMode(entry);
  continueRun.hidden = !m;
  if (m)
    $("continue-run-info").textContent = t("{mode} · {time} · {lines}줄", {
      mode: m.name,
      time: formatTime(entry.frame),
      lines: entry.lines,
    });
};
const beginJournal = (seed, target, scene = null) => {
  if (restoringRun) return;
  savedRunId = savedRun()?.id ?? null;
  lastSavedStep = -1;
  runJournal = createRunJournal({
    id: Array.from(crypto.getRandomValues(new Uint32Array(4))).join("-"),
    mode: mode.id,
    seed,
    rules,
    handling: settings.handling,
    name: runPlayerName,
    target,
    puzzle: mode.puzzleCode,
    trial: Boolean(mode.trialCode),
    scene,
    resultPbSplits,
    pbSplits,
  });
};
const saveRun = (force = true) => {
  if (restoringRun || !runJournal || !game || game.state.over || scenePractice?.ended) return;
  const entry = runJournal.entry;
  if (!force && entry.steps - lastSavedStep < SAVE_INTERVAL) return;
  const current = savedRun();
  if ((current?.id ?? null) !== savedRunId) {
    lastSavedStep = entry.steps;
    if (screen === "paused") $("resume-save-status").textContent = t("다른 창에서 저장된 판이 바뀌었어요.");
    return;
  }
  const snapshot = {
    ...entry,
    frame: game.state.frame,
    lines: game.state.stats.lines,
    fingerprint: runFingerprint(game, scenePractice ? null : (versus?.cpu ?? race?.player.game)),
  };
  if (store.set(SUSPENDED_RUN_KEY, snapshot)) {
    savedRunId = entry.id;
    lastSavedStep = entry.steps;
    if (screen === "paused") $("resume-save-status").textContent = t("창을 닫아도 이 판은 이 기기에 남아요.");
  } else {
    // 재시도 간격을 유지하고, 일시정지·창 닫기 때는 다시 시도한다.
    lastSavedStep = entry.steps;
    if (screen === "paused")
      $("resume-save-status").textContent = t("저장 공간을 확인해 주세요. 이번 진행을 저장하지 못했어요.");
  }
};
const clearRun = () => {
  if (runJournal && savedRun()?.id === runJournal.entry.id) store.set(SUSPENDED_RUN_KEY, null);
  runJournal = null;
};
const canReplaceRun = () => {
  const current = savedRun();
  return (
    !current || (runJournal && current.id === savedRunId) || window.confirm(t("저장된 판을 지우고 새 판을 시작할까요?"))
  );
};

// ---- 표시 도우미 ----

const showPanel = name => {
  if (
    name === "pause" &&
    (scenePractice?.split || scenePractice?.target || scenePractice?.rescue) &&
    scenePractice.ended
  )
    name = "sceneResult";
  for (const [key, el] of Object.entries(panels)) el.hidden = key !== name;
  // 결과 화면은 버튼이 아니라 패널 자체에 포커스를 둔다: 하드 드롭(Space)을 연타하다 끝났을 때
  // 그 입력이 "다시 하기"를 눌러 결과를 건너뛰지 않게. 다시 하기·메뉴는 단축키(R·Esc)나 클릭으로.
  const target =
    name === "results" || name === "sceneResult"
      ? panels[name]
      : name && /** @type {HTMLElement | null} */ (panels[name].querySelector("button:not(:disabled)"));
  target?.focus();
  if (!name && document.activeElement instanceof HTMLElement) document.activeElement.blur();
};

/** @type {ReturnType<typeof createGamepad> | null} 아래에서 만든 뒤 채운다 */
let padRef = null;
const keyHelp = createKeyHelp({
  target: $("key-help"),
  getSettings: () => settings,
  getRules: () => game?.rules ?? currentRules(),
  padConnected: () => Boolean(padRef?.connected),
});
const keysOf = keyHelp.keysOf;
const renderKeyHelp = keyHelp.render;

/** 프리셋 한 줄 설명(첫 화면 규칙 카드) */
const RULE_DESCRIPTIONS = {
  modern: t("요즘 표준: SRS 회전, 7-Bag, 홀드·하드 드롭·고스트, 넥스트 5개, T-spin 점수."),
  retro: t("옛날 가정용 게임 느낌: 벽차기·홀드·하드 드롭·고스트 없음, 닿으면 바로 고정, 조작감 고정."),
  arcade: t("아케이드 느낌: ARS 회전, 최근 4개를 피하는 생성기, 생성·줄 삭제 지연, 미리 회전(IRS)."),
};

/** 첫 화면 규칙 카드의 내 규칙 줄(Custom일 때만 보이고, 자리는 늘 차지한다) */
const renderRuleSlotRow = () => {
  const row = $("rule-slot-row");
  const state = ruleSlots.read();
  const picker = dropdown({
    id: "rule-slot",
    label: t("내 규칙"),
    options: state.slots.map((slot, i) => ({ value: i, label: slot.name })),
    value: state.active,
    onChange: i => {
      ruleSlots.select(i);
      customBody = ruleSlots.active().body;
      renderMenu();
      renderKeyHelp();
      /** @type {HTMLElement | null} */ ($("rule-slot"))?.focus();
    },
  });
  const share = button({ label: t("공유"), icon: "link", size: "s", id: "rule-slot-share" });
  share.addEventListener("click", () => rulesUI.open("share"));
  // Custom이 아니면 같은 자리에 안내 한 줄(비워 두면 휴대폰에서 탭과 아래 블록 사이가 크게 빈다)
  if (ruleChoice === "custom") row.replaceChildren(picker, share);
  else
    row.replaceChildren(
      el("p", {
        class: "rule-slot-hint",
        text: t("Custom을 고르면 규칙을 직접 바꾸고, 내 규칙을 10개까지 저장해 공유할 수 있어요."),
      })
    );
};

const renderRuleTabs = () => {
  const tabs = $("rule-tabs");
  tabs.replaceChildren(
    ...segmentButtons(
      RULE_CHOICES.map(id => [id, id === "custom" ? "Custom" : PRESETS[id].name]),
      ruleChoice,
      id => {
        ruleChoice = id;
        store.set("lastRules", id);
        renderMenu();
        renderKeyHelp();
        /** @type {HTMLElement | null} */ (tabs.querySelector(`[data-rules="${id}"]`))?.focus();
      }
    ).map(b => {
      b.dataset.rules = b.dataset.value;
      return b;
    })
  );
  renderRuleSlotRow();
  // 편집 버튼은 늘 같은 자리에 있다. Custom이 아닐 때는 비활성(원칙 2) — 이유는 설명 줄에.
  /** @type {HTMLButtonElement} */ ($("edit-rules")).disabled = ruleChoice !== "custom";
  $("rule-desc").textContent =
    ruleChoice === "custom"
      ? t('직접 조합한 규칙이에요. "편집"으로 바꿀 수 있고, 조합마다 기록이 따로 쌓여요.')
      : RULE_DESCRIPTIONS[ruleChoice];
};

/** 이 모드·규칙의 최고 기록과 그 리플레이(둘이 같은 판이고, 끝까지 간 판일 때만) */
const raceTargetFor = (m, ruleSet) => {
  if (!m.race) return null;
  const best = records.best(m, ruleSet);
  if (!best) return null;
  const replay = replays.best(recordKey(m, ruleSet));
  if (
    !replay ||
    replay.mode !== m.id ||
    replay.rules.id !== ruleSet.id ||
    replay.result.over !== m.race.finish ||
    !replayMatches(replay, best)
  )
    return null;
  return { replay, best };
};

const setText = (element, text) => {
  if (element.textContent !== text) element.textContent = text;
};

const updateRaceProgress = () => {
  if (!race || !game) return;
  const p = mode.race.progress(race.player.game.state);
  if (raceProgress.max !== p.max) raceProgress.max = p.max;
  if (raceProgress.value !== p.value) raceProgress.value = p.value;
  setText(raceLabel, race.player.done ? mode.formatRecord(race.target.best) : p.text);
  const own = mode.race.progress(game.state);
  if (raceOwnProgress.max !== own.max) raceOwnProgress.max = own.max;
  if (raceOwnProgress.value !== own.value) raceOwnProgress.value = own.value;
  setText($("race-own-label"), own.text);
};

const startRace = (m, selected = currentRules()) => {
  const target = raceTargetFor(m, selected);
  if (!target) return;
  let targetSplits = [];
  const verified = verifyReplay(target.replay, findMode, state => {
    if (m.splits) targetSplits = advanceSplits(m.splits, targetSplits, state.stats.lines, state.frame);
  });
  if (!verified.ok || verified.actual.over !== m.race.finish) {
    const message = t("이 최고 기록은 현재 버전에서 재현할 수 없어요. 새 최고 기록이 필요해요.");
    if (screen === "results") $("results-split-note").textContent = message;
    else showMenuNotice(message);
    return;
  }
  start(m, selected, { ...target, splits: targetSplits });
};

const renderMenu = () => {
  renderRuleTabs();
  renderPuzzleProgress();
  renderAchievementProgress();
  const ruleSet = currentRules();
  $("active-rules").textContent = t("규칙 · {name}", { name: ruleSet.name });
  const list = $("mode-list");
  list.replaceChildren(
    ...MODES.map(m => {
      const best = records.best(m, ruleSet);
      const rank = rankOf(m, best, ruleSet);
      return menuRow({
        "data-mode": m.id,
        title: m.name,
        desc: m.description,
        meta: best
          ? t("최고 기록 {record}", { record: m.formatRecord(best) }) + (rank ? ` · ${rankLabel(rank)}` : "")
          : "",
        onClick: () => start(m),
      });
    }),
    versusRow(),
    dailyRow()
  );
};

/** 첫 화면 모드 목록 끝의 CPU 대전 줄: 누르면 난이도를 고른다 */
const versusRow = () => {
  const wins = Object.values(versusStats()).reduce((sum, s) => sum + (s?.win | 0), 0);
  return menuRow({
    "data-mode": "versus",
    title: t("CPU 대전"),
    desc: t("CPU와 쓰레기 줄을 주고받기 · 먼저 막히면 패배"),
    meta: wins ? t("{n}승", { n: wins }) : "",
    onClick: () => versusUI.open(),
  });
};

// ---- 오늘의 도전 ----

const dailyEntry = key => {
  const mode = dailyMode(key);
  const best = records.best(mode, MODERN);
  return { mode, best, replay: best ? replays.forEntry(recordKey(mode, MODERN), best) : null };
};

/** 첫 화면 모드 목록 끝의 오늘의 도전 줄 */
const dailyRow = () => {
  const key = dateKey();
  const m = dailyMode(key);
  const best = records.best(m, MODERN);
  return menuRow({
    "data-mode": "daily",
    title: t("오늘의 도전"),
    desc: `${key} · ${t("{mode} · 모두 같은 블록 순서", { mode: m.baseName })}`,
    meta: best ? t("최고 기록 {record}", { record: m.formatRecord(best) }) : "",
    onClick: () => dailyUI.open(),
  });
};

/** 받은 코드로 겨루기. 문제가 있으면 알림 문구를 돌려준다 */
const raceFromCode = async text => {
  const raw = await decodeReplayCode(text);
  const replay = raw && sanitizeReplay(raw, findMode);
  if (!replay) return t("읽을 수 없는 코드예요");
  const m = findDaily(replay.mode);
  // 끝까지 간 결과만(Sprint·Dig는 완료, Ultra는 시간 종료 — 모드의 달리기 완주 조건)
  if (!m || replay.rules.id !== MODERN.id || replay.result.over !== (m.race?.finish ?? "clear"))
    return t("오늘의 도전을 끝까지 간 결과 코드만 겨룰 수 있어요");
  let targetSplits = [];
  const verified = verifyReplay(replay, findMode, state => {
    if (m.splits) targetSplits = advanceSplits(m.splits, targetSplits, state.stats.lines, state.frame);
  });
  if (!verified.ok) return t("이 코드는 결과를 다시 만들 수 없어요. 다른 버전일 수 있어요");
  const r = replay.result;
  const best = { frames: r.frames, lines: r.lines, pieces: r.pieces, score: r.score };
  start(m, MODERN, { replay, best, splits: targetSplits, friend: replay.name || t("상대") });
  return null;
};

const dailyUI = createDailyUI({
  dialog: /** @type {HTMLDialogElement} */ ($("daily")),
  dates: recentDailyKeys,
  getEntry: dailyEntry,
  makeCode: replay => encodeReplayCode(replay, records.playerName),
  makeLink: code => replayLink(code, location.href),
  onStart: mode => start(mode, MODERN),
  onWatch: replay => startReplay(replay, "menu", "", true),
  onRace: raceFromCode,
});
$("daily").addEventListener("close", () => {
  if (screen === "menu") /** @type {HTMLElement | null} */ (document.querySelector('[data-mode="daily"]'))?.focus();
});
const formatSurvivalGoal = frames => formatTime(frames).split(".")[0];

let lastHud;
const updateHud = () => {
  const frame = game?.state.frame ?? 0;
  if (lastHud?.game === game && lastHud.frame === frame && lastHud.mode === mode && lastHud.screen === screen) return;
  lastHud = { game, frame, mode, screen };
  if (scenePractice?.split && game) updateSceneSplitProgress(game.state);
  const stats = game?.state.stats ?? { pieces: 0, lines: 0 };
  const lines = game ? mode.hudLines(game.state) : { label: t("줄"), value: "0" };
  const time = game ? mode.hudTime(game.state) : { label: t("시간"), frames: 0 };
  setText(hud.timeLabel, time.label);
  setText(hud.time, formatTime(time.frames));
  if (mode.id === "survival") {
    const next = SURVIVAL_MILESTONES.find(goal => frame < goal);
    const goal = next ? formatSurvivalGoal(next) : t("달성");
    setText(hud.survivalGoal, goal);
  }
  setText(hud.score, formatScore(game?.state.score ?? 0));
  setText(hud.level, game ? (mode.hudLevel?.(game.state) ?? String(game.state.level)) : "1");
  setText(hud.linesLabel, lines.label);
  setText(hud.lines, lines.value);
  setText(hud.pieces, String(stats.pieces));
  setText(hud.attack, String(game?.state.garbage?.sent ?? 0));
  if (versus) {
    setText($("versus-cpu-sent"), String(versus.cpu.state.garbage.sent));
    setText($("versus-cpu-incoming"), String(versus.cpu.state.garbage.pending));
  }
  const practice = game?.state.practice;
  setText(hud.streak, practice ? `${practice.streak} / ${practice.bestStreak}` : "0 / 0");
  const fin = game?.state.finesse;
  setText(hud.finesse, fin ? `${fin.faults} / ${fin.judged}` : "0 / 0");
  setText(hud.pps, frame ? (stats.pieces / (frame / 60)).toFixed(2) : "0.00");
  const delta = game && mode.splits ? splitDelta(splits, pbSplits) : null;
  setText(hud.split, formatDelta(delta));
  const ahead = delta === null ? undefined : String(delta < 0);
  if (hud.split.dataset.ahead !== ahead) {
    if (ahead === undefined) delete hud.split.dataset.ahead;
    else hud.split.dataset.ahead = ahead;
  }
};

// ---- 화면 흐름 ----

const setScreen = next => {
  screen = next;
  document.body.dataset.screen = next;
  keyboard.setEnabled(next === "play" || next === "countdown");
  touch.setEnabled(next === "play" || next === "countdown");
  gestures.setEnabled((next === "play" || next === "countdown") && gesturesOn());
  document.body.classList.toggle("is-practice", Boolean(mode.practice && !isGuidedPractice()) && next !== "menu");
  document.body.classList.toggle("has-lesson-hints", hasLessonHints(mode) && next !== "menu");
  document.body.classList.toggle("is-finesse-lesson", Boolean(mode.lesson) && next !== "menu");
  const modeTitle = mode.versus ? versusTitle(mode.versus) : mode.name;
  $("session-title").textContent = next === "menu" ? "" : scenePractice ? scenePracticeTitle() : modeTitle;
  $("mode-objective").textContent =
    next === "menu" || next === "replay"
      ? ""
      : mode.puzzle
        ? mode.puzzle.kind === "pc"
          ? t("목표 · 주어진 피스로 판 비우기")
          : t("목표 · T 하나로 {kind} 만들기", { kind: mode.description })
        : mode.practice
          ? mode.description
          : "";
};

const toMenu = (initial = false) => {
  confirming = null;
  game = null;
  race = null;
  racePanel.hidden = true;
  versus = null;
  versusPanel.hidden = true;
  document.body.classList.remove("is-versus");
  setScreen("menu");
  countdownEl.hidden = true;
  renderMenu();
  renderContinue();
  /** @type {HTMLButtonElement} */ ($("watch-last")).disabled = !replays.last();
  showPanel("menu");
  // 이어 할 판이 있으면 Enter로 복원하고, 없으면 마지막 모드에 포커스를 둔다.
  const defaultMode = /** @type {HTMLElement | null} */ (panels.menu.querySelector(`[data-mode="${mode.id}"]`));
  // 처음 열 때는 포커스만 두고(Enter로 바로 시작) 테두리는 그리지 않는다 — "골라 둔 모드"처럼 보이지 않게.
  // 게임에서 돌아올 때는 키보드로 오가는 중일 수 있으니 브라우저가 정한 대로 보인다.
  (continueRun.hidden ? defaultMode : continueRun)?.focus(
    /** @type {FocusOptions} */ ({ preventScroll: initial, ...(initial ? { focusVisible: false } : {}) })
  );
};

const showModeHud = (m, replay = false) => {
  const items = m.hud ?? ["time", "score", "level", "lines", "pieces", "pps"];
  for (const cell of document.querySelectorAll(".hud [data-hud]")) {
    const item = cell.getAttribute("data-hud");
    cell.classList.toggle("is-off", !items.includes(item) || (replay && (item === "split" || item === "time")));
  }
};

const start = (
  m,
  selectedRules = currentRules(),
  target = null,
  retrySeed = /** @type {number | undefined} */ (undefined),
  restored = null
) => {
  if (restoringRun ? !restored : !canReplaceRun()) return;
  confirming = null;
  if (screen === "replay") stopReplay();
  mode = m;
  if (!restoringRun && !m.practice && m.id !== "custom-puzzle") store.set("lastMode", m.id);
  rules = selectedRules;
  runPlayerName = restored?.name ?? records.playerName;
  const seed = target?.replay.seed ?? retrySeed ?? m.fixedSeed ?? (Math.random() * 2 ** 32) >>> 0;
  $("race-label").textContent = target?.friend ? t("{name}의 기록", { name: target.friend }) : t("내 최고 기록");
  race = target ? { target, player: createPlayer(target.replay, findMode) } : null;
  racePanel.hidden = !race;
  game = createGame({ rules, handling: toEngineHandling(restored?.handling ?? settings.handling), seed, mode: m });
  updateRaceProgress();
  // 대전: CPU도 같은 시드(같은 블록 순서)로 시작한다. 상대와 함께라야 재현되므로 리플레이는 남기지 않는다.
  if (m.versus) {
    const cpu = createGame({ rules, seed, mode: m });
    versus = {
      cpu,
      bot: createBot({ game: cpu, rotation: ROTATIONS[rules.rotation], level: m.versus, seed }),
      recorder: createRecorder({ seed, mode: m, rules, handling: cpu.handling }),
    };
    $("versus-name").textContent = versusTitle(m.versus);
  } else versus = null;
  versusPanel.hidden = !versus;
  document.body.classList.toggle("is-versus", Boolean(versus));
  recorder = m.noReplay ? null : createRecorder({ seed, mode: m, rules, handling: game.handling });
  finesse = createFinesseTracker(game, ROTATIONS[rules.rotation]);
  splits = [];
  showModeHud(m);
  resultPbSplits = m.splits ? records.best(m, rules)?.splits : undefined;
  if (m.splits && !resultPbSplits) {
    const best = raceTargetFor(m, rules);
    if (best) {
      let restored = [];
      const check = verifyReplay(best.replay, findMode, state => {
        restored = advanceSplits(m.splits, restored, state.stats.lines, state.frame);
      });
      if (check.ok) resultPbSplits = restored;
    }
  }
  pbSplits = target?.splits ?? resultPbSplits;
  if (restored) {
    resultPbSplits = restored.resultPbSplits;
    pbSplits = restored.pbSplits;
  }
  acc = 0;
  countdown = hasLessonHints(m) || m.battleLesson ? 0 : (COUNTDOWN_FRAMES[settings.access.countdown] ?? READY_FRAMES);
  if (hasLessonHints(m)) resetLessonHint();
  goTimer = 0;
  undo.reset();
  showPanel(null);
  fb.clearAction();
  renderer.clearEffects();
  renderKeyHelp();
  setScreen("countdown");
  window.scrollTo(0, 0);
  countdownEl.hidden = false;
  countdownEl.dataset.phase = "ready";
  $("countdown-label").textContent = t("준비");
  // 카운트다운 "없음": 바로 시작
  if (restoringRun) return;
  beginJournal(seed, target);
  saveRun();
  if (countdown <= 0) {
    countdownEl.hidden = true;
    setScreen("play");
    sfx.play("go");
  } else sfx.play("ready");
  say(t("{mode} 시작", { mode: mode.name }));
};

let pausedFrom = /** @type {"play" | "countdown"} */ ("play");

const pause = () => {
  if (restoringRun) return;
  if (screen !== "play" && screen !== "countdown") return;
  pausedFrom = screen;
  setScreen("paused");
  showPanel("pause");
  $("resume-save-status").textContent = "";
  saveRun();
};

$("pause-game").addEventListener("click", pause);

const resume = () => {
  if (screen !== "paused" || scenePractice?.ended) return;
  confirming = null;
  showPanel(null);
  setScreen(pausedFrom);
};

// ---- 진행 중인 판을 버리기 전에 묻기(R 다시 시작 · 로고로 첫 화면) ----

/** @type {null | "restart" | "menu"} 지금 묻고 있는 것 */
let confirming = null;
let confirmWasPaused = false;
/** 게임이 진행 중(끝나지 않음)이라 버리면 잃는 게 있는가 */
const inProgress = () => screen === "play" || screen === "countdown" || screen === "paused";

const askConfirm = kind => {
  if (!inProgress() || confirming) return;
  confirmWasPaused = screen === "paused";
  pause();
  confirming = kind;
  const restart = kind === "restart";
  panels.confirm.querySelector(".confirm-cancel-text").textContent = confirmWasPaused ? t("취소") : t("계속하기");
  // "계속하기"는 판으로 돌아가니 재생 표시, "취소"는 일시정지 화면으로 돌아가니 뒤로 표시
  /** @type {HTMLElement} */ (panels.confirm.querySelector(".confirm-cancel-icon")).replaceChildren(
    icon(confirmWasPaused ? "arrow-left" : "play")
  );
  $("confirm-title").textContent = restart ? t("다시 시작할까요?") : t("첫 화면으로 갈까요?");
  const ok = /** @type {HTMLElement} */ (panels.confirm.querySelector('[data-confirm="ok"]'));
  /** @type {HTMLElement} */ (ok.querySelector(".confirm-ok-icon")).replaceChildren(icon(restart ? "restart" : "menu"));
  /** @type {HTMLElement} */ (ok.querySelector(".confirm-ok-text")).textContent = restart
    ? t("다시 시작")
    : t("첫 화면으로");
  const first = keysOf("RESTART")[0];
  /** @type {HTMLElement} */ (ok.querySelector(".confirm-ok-key")).replaceChildren(
    ...(restart && first ? [keycap(first)] : [])
  );
  showPanel("confirm");
};

const cancelConfirm = () => {
  if (!confirming) return;
  confirming = null;
  if (confirmWasPaused) showPanel("pause");
  else resume();
};

const acceptConfirm = () => {
  const kind = confirming;
  if (!kind) return;
  confirming = null;
  if (kind === "restart") start(mode, rules, race?.target);
  else {
    clearRun();
    if (scenePractice) {
      exitScenePractice();
      stopReplay();
    }
    toMenu();
  }
};

for (const btn of panels.confirm.querySelectorAll("[data-confirm]")) {
  btn.addEventListener("click", () => (btn.getAttribute("data-confirm") === "ok" ? acceptConfirm() : cancelConfirm()));
}

/** 로고: 첫 화면으로. 게임 중이면 먼저 묻는다 */
$("go-home").addEventListener("click", () => {
  if (
    settingsUI.isOpen ||
    rulesUI.isOpen ||
    recordsUI.isOpen ||
    statsUI.isOpen ||
    practiceUI.isOpen ||
    versusUI.isOpen ||
    dailyUI.isOpen ||
    achievementsUI.isOpen ||
    helpUI.isOpen ||
    puzzleUI.isOpen ||
    shareUI.isOpen
  )
    return;
  if (screen === "menu") return window.scrollTo(0, 0);
  if (scenePractice) exitScenePractice();
  if (inProgress()) return askConfirm("menu");
  if (screen === "replay") stopReplay();
  toMenu();
});

/**
 * 너무 일찍 끝난 판: 결과의 비율 값을 —로, 공유·추천 연습을 끄고 "마지막 판"으로 남기지 않는다(F11·F21).
 * 20초 안에 막혔고, 줄을 하나도 못 지웠거나 피스를 10개도 못 놓은 판. 하드 드롭 연타(1초에 12피스, 0줄)도 여기에 든다.
 * 깬 판(퍼즐 등)과 20초 넘게 버틴 판(Survival 등)은 아니다.
 */
const SHORT_GAME_SECONDS = 20;
const SHORT_GAME_PIECES = 10;
const isShortGame = state => {
  if (state.over === "clear" || state.frame >= SHORT_GAME_SECONDS * 60) return false;
  // 버틴 시간이 기록인 모드(Survival)는 줄을 안 지워도 제대로 된 판일 수 있다 → 피스 수만 본다
  const survives = mode.record?.metric === "frames" && mode.record.order === "desc";
  return state.stats.pieces < SHORT_GAME_PIECES || (!survives && state.stats.lines === 0);
};

const renderResultSplits = () => {
  const details = /** @type {HTMLDetailsElement} */ ($("results-splits"));
  details.hidden = !mode.splits;
  details.open = false;
  const practice = $("results-practice-scene");
  practice.hidden = true;
  practice.onclick = null;
  if (!mode.splits) return;

  const { rows, slowest } = analyzeSplits(mode.splits, splits, resultPbSplits);
  const replay = lastReplay;
  /** @type {HTMLButtonElement} */ ($("results-race-best")).disabled = !raceTargetFor(mode, rules);
  $("results-split-rows").replaceChildren(
    ...rows.map(({ to, frames, delta }, index) => {
      const row = document.createElement("tr");
      const from = mode.splits[index - 1] ?? 0;
      const startFrame = splits[index - 1] ?? 0;
      const label = t("{from}–{to}줄", { from, to });
      row.classList.toggle("is-slowest", slowest?.to === to);
      const segment = row.insertCell();
      if (replay) {
        segment.append(
          button({
            label,
            size: "s",
            "aria-label": t("{segment} 구간 다시 보기", { segment: label }),
            onClick: () => {
              startReplay(replay, "results", "", true);
              seekReplay(startFrame, true);
            },
          })
        );
      } else segment.textContent = label;
      const priorDelta = index === 0 ? 0 : rows[index - 1].delta;
      row.insertCell().textContent = formatTime(frames - startFrame);
      row.insertCell().textContent = formatDelta(
        delta === null || priorDelta === null ? null : (delta - priorDelta) / 60
      );
      return row;
    })
  );
  const note = slowest
    ? t("가장 많이 밀린 구간 {from}–{to}줄 ({delta}초)", {
        from: slowest.from,
        to: slowest.to,
        delta: formatDelta(slowest.lost / 60),
      })
    : rows.length === 0
      ? t("10줄부터 구간 기록이 남아요.")
      : rows.every(row => row.delta === null)
        ? ""
        : t("완료한 비교 구간에서 잃은 시간이 없어요.");
  $("results-split-note").textContent = note;
  // 첫 구간(10줄)에 닿기 전에 끝났으면 머리줄뿐인 빈 표 대신 안내만 보인다
  /** @type {HTMLTableElement} */ ($("results-splits").querySelector("table")).hidden = rows.length === 0;
  // 너무 일찍 끝난 판(연타 등)에서 고른 "추천 연습"은 뜻이 없다
  if (replay && mode.id === "sprint40" && !isShortGame(game.state)) {
    let target = null;
    if (!slowest && rows.every(row => row.delta === null)) {
      if (analysis?.for !== replay) analysis = { ...analyzeReplay(replay, findMode), for: replay };
      target = analysis.finesseScene;
    }
    if (slowest || target) {
      practice.hidden = false;
      practice.querySelector(".btn-label").textContent = slowest
        ? t("추천 연습 · {from}–{to}줄", slowest)
        : t("추천 연습 · {piece} 피네스", { piece: target.piece });
      practice.onclick = () => {
        startReplay(replay, "results", "", true);
        if (target) {
          seekReplay(target.spawnFrame, true);
          enterScenePractice(null, target);
          return;
        }
        const index = mode.splits.indexOf(slowest.to);
        const endFrame = splits[index];
        seekReplay(splits[index - 1] ?? 0, true);
        // 구간 경계에 등장 대기가 있으면 다음 피스를 먼저 보여 준다.
        if (player && !player.game.state.active) {
          while (!player.done && !player.game.state.active) player.step();
          updateReplayBar();
        }
        enterScenePractice({ from: slowest.from, to: slowest.to, endFrame });
      };
    }
  }
  details.querySelector("summary").textContent = slowest
    ? t("구간 기록 · {from}–{to}줄 {delta}초", {
        from: slowest.from,
        to: slowest.to,
        delta: formatDelta(slowest.lost / 60),
      })
    : rows.length === 0
      ? // 첫 구간(10줄) 전에 끝났으면 펼쳐도 표가 없다 → 안에 있는 "같은 순서로 재시작"을 이름으로(U44)
        t("같은 블록 순서로 다시 · 구간 기록은 10줄부터")
      : t("구간 기록");
};

/** 달리기 결과 한 줄: 시간 기록 모드는 시간 차, 점수 모드는 점수 차 */
const raceResultText = (state, best, friend = "") => {
  if (friend) {
    if (state.over !== mode.race.finish)
      return t("끝까지 가지 못했어요 · {name} 기록 {record}", { name: friend, record: mode.formatRecord(best) });
    const d = state.frame - best.frames;
    return d === 0
      ? t("{name}와(과) 같은 시간이에요.", { name: friend })
      : t(d < 0 ? "{name}보다 {n}초 빨라요." : "{name}보다 {n}초 느려요.", {
          name: friend,
          n: (Math.abs(d) / 60).toFixed(2),
        });
  }
  if (state.over !== mode.race.finish)
    return t("끝까지 가지 못했어요 · 상대 기록 {record}", { record: mode.formatRecord(best) });
  if (mode.record.metric === "score") {
    const diff = state.score - (best.score ?? 0);
    return diff === 0
      ? t("내 최고 기록과 같은 점수예요.")
      : t(diff > 0 ? "이전 최고 기록보다 {n}점 높아요." : "이전 최고 기록보다 {n}점 낮아요.", {
          n: formatScore(Math.abs(diff)),
        });
  }
  const delta = state.frame - best.frames;
  return delta === 0
    ? t("내 최고 기록과 같은 시간이에요.")
    : t(delta < 0 ? "이전 최고 기록보다 {n}초 빨라요." : "이전 최고 기록보다 {n}초 느려요.", {
        n: (Math.abs(delta) / 60).toFixed(2),
      });
};

const survivalResultText = (frame, previousBest) => {
  const reached = SURVIVAL_MILESTONES.findLast(goal => goal <= frame);
  const goal = reached
    ? t("{time} 구간 달성", { time: formatSurvivalGoal(reached) })
    : t("첫 목표 {time} 미달성", { time: formatSurvivalGoal(SURVIVAL_MILESTONES[0]) });
  if (!previousBest) return goal;

  const delta = frame - previousBest.frames;
  const comparison =
    delta === 0
      ? t("이전 최고와 같은 시간")
      : t(delta > 0 ? "이전 최고보다 {n}초 더 버팀" : "이전 최고보다 {n}초 덜 버팀", {
          n: (Math.abs(delta) / 60).toFixed(2),
        });
  return `${goal} · ${comparison}`;
};

const finish = () => {
  if (!game) return;
  const state = game.state;
  clearRun();
  setScreen("results");
  countdownEl.hidden = true;
  if (mode.id === "sprint40" && state.stats.pieces > 0)
    sprintHistory.add(rules.id, state.frame, state.over === "clear");
  if (state.over === "clear" && isGuidedPractice()) {
    practiceProgress.mark(mode.id, lessonHintState(state)?.usedHint);
  }

  let outcome = null;
  if (mode.isRecordable(state)) {
    outcome = records.add(mode, rules, {
      frames: state.frame,
      lines: state.stats.lines,
      pieces: state.stats.pieces,
      score: state.score,
      level: state.level,
      ...(mode.splits ? { splits } : {}),
      playerName: runPlayerName,
      date: new Date().toISOString(),
    });
  }
  const best = records.best(mode, rules);
  const survival = mode.id === "survival";

  if (mode.versus) addVersusResult(versusStatKey(mode.versus.id, mode.versus.style), state.over === WIN);
  // 퍼즐: 깬 단계를 남기고, 깼으면 "다음 단계"를 보인다(마지막 단계면 다시 하기만)
  if (mode.puzzle?.number && state.over === "clear") puzzleProgress.markCleared(mode.puzzle.id);
  if (mode.trialCode && state.over === "clear") puzzleEditor.markCleared(mode.trialCode);
  // 업적: 이번 판에 처음 이룬 것(플레이 업적은 실제 모드·오늘의 도전·CPU 대전에서만)
  const freshAchievements = achievements.evaluate({
    mode,
    state,
    // Custom 규칙 판은 업적을 주지 않는다(퍼즐 업적은 규칙과 무관) — 2차 평가 F22
    real:
      !scenePractice && isRankedRules(rules) && (MODES.includes(mode) || Boolean(mode.daily) || Boolean(mode.versus)),
    won: Boolean(mode.versus) && state.over === WIN,
    puzzlesCleared: puzzleProgress.cleared(),
    puzzles: PUZZLES,
  });
  $("results-achievements").textContent = freshAchievements.length
    ? t("업적 달성 · {names}", { names: freshAchievements.map(a => a.name).join(", ") })
    : "";
  const nextPuzzle = /** @type {HTMLButtonElement} */ (panels.results.querySelector('[data-action="next-puzzle"]'));
  const nextLesson = nextPracticeLesson();
  const hasNext = nextLesson || (mode.puzzle?.number && mode.puzzle.number < PUZZLES.length);
  nextPuzzle.hidden = !(hasNext && state.over === "clear");
  lastReplay = recorder ? recorder.finish(state) : null;
  const survivalRetry = $("survival-retry-seed");
  survivalRetry.hidden = !survival || !lastReplay;
  const rescueButton = $("survival-rescue");
  rescueButton.hidden = !survival || !lastReplay || !state.stats.pieces;
  if (lastReplay && versus) lastReplay.cpu = versus.recorder.finish(versus.cpu.state);
  /** @type {HTMLButtonElement} */ (panels.results.querySelector('[data-action="watch"]')).disabled = !lastReplay;
  // 피스 몇 개 만에 막힌 판: 비율 값(PPS)은 뜻이 없고, 공유·"마지막 판"으로 남길 만한 판도 아니다(F11)
  const tooShort = isShortGame(state);
  const exportButton = /** @type {HTMLButtonElement} */ (panels.results.querySelector('[data-action="export"]'));
  exportButton.disabled = !mode.trialCode && (!lastReplay || Boolean(versus) || tooShort);
  exportButton.querySelector(".btn-label").textContent = mode.trialCode ? t("퍼즐 편집") : t("공유");
  exportButton.setAttribute("aria-label", mode.trialCode ? t("퍼즐 편집·공유") : t("리플레이 공유"));
  exportButton.title = mode.trialCode ? t("퍼즐 편집·공유") : t("리플레이 공유(링크·파일)");
  if (lastReplay && !versus && !tooShort) {
    replays.saveLast(lastReplay);
    if (outcome && outcome.rank < MAX_RANKED)
      replays.saveRanked(recordKey(mode, rules), lastReplay, records.list(mode, rules));
  }
  recorder = null;

  $("results-mode").textContent = `${mode.name} · ${rules.name}`;
  const summary = mode.summary(state);
  $("results-title").textContent = summary.title;
  $("results-main").textContent = summary.main;
  if (!mode.lesson && !survival && !mode.battleLesson) say(`${summary.title} ${summary.main}`);
  fb.clearAction();
  countdownEl.hidden = true;
  $("results-badge").classList.toggle("is-invisible", !outcome?.isBest);

  const resultNote = mode.battleLesson
    ? t("공격 {attack}줄 · 상쇄 {blocked}줄 · 상대에게 {sent}줄", {
        attack: state.garbage.blocked + state.garbage.sent,
        blocked: state.garbage.blocked,
        sent: state.garbage.sent,
      })
    : survival
      ? survivalResultText(state.frame, outcome ? outcome.previousBest : best)
      : race
        ? raceResultText(state, race.target.best, race.target.friend)
        : "";
  const shortNote =
    tooShort && !mode.trialCode ? t("너무 일찍 끝난 판이라 공유하지 않고 마지막 판으로 남기지 않아요") : "";
  $("race-result").textContent = [resultNote, shortNote].filter(Boolean).join(" · ");
  if (survival || mode.battleLesson) say(`${summary.title} ${summary.main}. ${resultNote}`);

  const seconds = state.frame / 60;
  if (mode.versus && versus) {
    const g = state.garbage;
    const cg = versus.cpu.state.garbage;
    const vrows = [
      [t("시간"), formatTime(state.frame)],
      [t("줄"), String(state.stats.lines)],
      [t("피스"), String(state.stats.pieces)],
      ["PPS", tooShort ? "—" : seconds ? (state.stats.pieces / seconds).toFixed(2) : "0.00"],
      [t("보낸 줄"), String(g.sent)],
      [t("막은 쓰레기"), String(g.blocked)],
      [t("받은 쓰레기"), String(g.received)],
      [t("CPU가 보낸 줄"), String(cg.sent)],
    ];
    const s = versusStats()[versusStatKey(mode.versus.id, mode.versus.style)];
    vrows.push([t("전적"), s ? t("{win}승 {loss}패", { win: s.win, loss: s.loss }) : "—"]);
    $("results-stats").replaceChildren(
      ...vrows.flatMap(([k, v]) => {
        const dt = document.createElement("dt");
        dt.textContent = k;
        const dd = document.createElement("dd");
        dd.textContent = v;
        return [dt, dd];
      })
    );
    renderResultSplits();
    showPanel("results");
    return;
  }
  const rows = [
    [t("시간"), formatTime(state.frame)],
    [t("점수"), formatScore(state.score)],
    [t("레벨"), String(state.level)],
    [t("줄"), String(state.stats.lines)],
    [t("피스"), String(state.stats.pieces)],
    ["PPS", tooShort ? "—" : seconds ? (state.stats.pieces / seconds).toFixed(2) : "0.00"],
    [t("최고 기록"), best ? mode.formatRecord(best) : "—"],
  ];
  // 순위 줄은 늘 둔다(없으면 —) → 결과 화면 높이가 판마다 같다.
  rows.push([t("순위"), outcome && outcome.rank < 10 ? t("{n}위", { n: outcome.rank + 1 }) : "—"]);
  // 랭크가 있는 모드: 기록으로 남는 판이면 이 판의 랭크(다음 랭크 기준은 기록 화면에서)
  if (RANK_STEPS[mode.id]) {
    const run = { frames: state.frame, score: state.score, lines: state.stats.lines, level: state.level };
    rows.push([t("랭크"), (mode.isRecordable(state) && rankOf(mode, run, rules)) || "—"]);
  }
  if (mode.splits) {
    const delta = splitDelta(splits, resultPbSplits);
    if (delta !== null) rows.push([t("PB 대비"), formatDelta(delta)]);
    if (state.over === "clear") rows.splice(0, 1);
  }
  if (mode.battleLesson) {
    rows.splice(0, rows.length, [t("받은 쓰레기"), String(state.garbage.received)]);
  }
  if (mode.lesson) {
    const path = mode.lesson.path;
    const steps = [...path, { action: "HARD" }].map(({ action, hold }) => {
      const code = settings.keymap[action]?.[0];
      const label = code ? keyLabel(code) : (ACTIONS.find(item => item.id === action)?.label ?? action);
      return hold ? t("{key} 길게", { key: label }) : label;
    });
    const comparison = t("내 입력 {actual}회 · 최소 {minimum}회", {
      actual: finesse.lastInputs,
      minimum: path.length,
    });
    rows.splice(
      0,
      rows.length,
      [t("이동·회전"), state.over === "clear" ? comparison : t("내 입력 {n}회", { n: finesse.lastInputs })],
      [t("추천 입력"), steps.join(", ")]
    );
    say(`${summary.title}. ${rows[0][1]}. ${t("추천 입력")} ${rows[1][1]}`);
  }
  $("results-stats").replaceChildren(
    ...rows.flatMap(([k, v]) => {
      const dt = document.createElement("dt");
      dt.textContent = k;
      const dd = document.createElement("dd");
      dd.textContent = v;
      return [dt, dd];
    })
  );
  renderResultSplits();
  showPanel("results");
};

// ---- 반응: 액션 표시(보드 위 큰 글씨) · 진동 · 화면 읽기 알림 ----
const fb = createFeedback({
  actionEl: $("action"),
  versusEl: $("versus-feedback"),
  srStatus: $("sr-status"),
  getSettings: () => settings,
  describeLeft: () => (game ? mode.hudLines(game.state) : null),
});
const { announce, announceText, say } = fb;
const feedback = fb.react;

// ---- 입력 ----

const settingsUI = createSettingsUI({
  dialog: /** @type {HTMLDialogElement} */ ($("settings")),
  getSettings: () => settings,
  onChange: next => {
    // 저장소가 막혀 있어도 이번 실행 동안은 반영되도록 메모리 값을 먼저 바꾼다.
    settings = sanitizeSettings(next);
    saveSettings(store, settings);
    bindings = compileKeymap(settings.keymap);
    padBindings = compilePadmap(settings.padmap);
    applyTouch();
    applyScheme();
    if (game && screen !== "replay") {
      applyRunHandling(settings.handling);
      runJournal?.action("handling", settings.handling);
      saveRun();
    }
    renderKeyHelp();
  },
  onPreviewSound: () => sfx.play("clear2"),
  // 모드 이름처럼 시작할 때 만든 글자까지 바꾸려면 다시 불러오는 게 가장 확실하다.
  onLanguage: () => location.reload(),
  // 데이터 탭: 백업과 리플레이 파일(첫 화면에서 연 경우에만 불러오기). 버튼을 누를 때 부르므로 아래 정의를 쓴다.
  data: {
    canImport: () => screen === "menu",
    exportBackup: () => backupActions.exportBackup(),
    importBackup: () => backupActions.importBackup(),
    openReplay: () => /** @type {HTMLInputElement} */ ($("replay-file")).click(),
    // 기록 지우기(F25): 기록표·리플레이·Sprint 기록 흐름·CPU 전적. 설정·내 규칙·연습·퍼즐 진행도·업적은 남긴다
    clearRecords: () => {
      store.set("records", {});
      store.set("replay:best", {});
      store.set("replay:last", null);
      store.set(SPRINT_HISTORY_KEY, null);
      store.set("versus:stats", {});
      lastReplay = null;
    },
  },
  onClose: () => {
    if (screen === "menu") toMenu();
    else if (screen === "paused") showPanel("pause");
    else if (screen === "results") showPanel("results");
  },
});

const rulesUI = createRulesUI({
  dialog: /** @type {HTMLDialogElement} */ ($("rules-editor")),
  getRules: () => customBody,
  onChange: body => {
    ruleSlots.update(body);
    customBody = ruleSlots.active().body;
  },
  // 편집기의 내 규칙 줄(이름·새 규칙·지우기)과 받은 코드: 바꾼 뒤 지금 고른 규칙을 다시 읽는다
  slots: {
    read: ruleSlots.read,
    rename: name => ruleSlots.rename(name),
    add: (name, body) => {
      const added = ruleSlots.add(name, body);
      customBody = ruleSlots.active().body;
      return added;
    },
    remove: () => {
      const removed = ruleSlots.remove();
      customBody = ruleSlots.active().body;
      return removed;
    },
  },
  onClose: () => {
    renderMenu();
    /** @type {HTMLElement | null} */ ($("edit-rules"))?.focus();
  },
});

$("active-rules").addEventListener("click", e => {
  e.preventDefault();
  /** @type {HTMLElement | null} */ ($("rule-tabs").querySelector('[aria-pressed="true"]'))?.focus();
});
$("edit-rules").addEventListener("click", () => rulesUI.open());

const hasLessonHints = m => Boolean(m.downstack || m.buildLesson);
const lessonHintState = state => state.downstack ?? state.buildLesson;
const isGuidedPractice = (m = mode) => m.lesson || hasLessonHints(m) || m.intro || m.battleLesson;
const nextPracticeLesson = () =>
  mode.buildLesson
    ? BUILD_LESSONS[mode.buildLesson]
    : mode.battleLesson
      ? BATTLE_LESSONS[mode.battleLesson]
      : mode.intro
        ? INTRO_LESSONS[mode.intro]
        : mode.downstack
          ? DOWNSTACK_LESSONS[mode.downstack.index + 1]
          : mode.lesson
            ? FINESSE_LESSONS[mode.lesson.index + 1]
            : null;
const downstackHint = $("downstack-hint");
const resetLessonHint = () => {
  downstackHint.textContent = t("힌트");
  $("downstack-status").textContent = "";
};
const downstackRetry = $("downstack-retry");
for (const control of [downstackHint, downstackRetry]) {
  // 버튼에 키보드 포커스가 있으면 Space는 버튼을 실행한다.
  control.addEventListener("keydown", event => {
    if (event.code === "Space") event.stopPropagation();
  });
}
const applyLessonHint = () => {
  $("downstack-status").textContent = mode.hint(game.state);
  downstackHint.textContent = t(["힌트", "자리 힌트", "힌트 숨기기"][lessonHintState(game.state).hintLevel]);
};
downstackHint.addEventListener("click", event => {
  if (!hasLessonHints(mode) || screen !== "play" || !game?.state.active) return;
  applyLessonHint();
  runJournal?.action("hint");
  if (event.detail > 0) downstackHint.blur();
});
downstackRetry.addEventListener("click", () => {
  if (hasLessonHints(mode) && screen === "play") start(mode, rules);
});

const practiceUI = createPracticeUI({
  dialog: /** @type {HTMLDialogElement} */ ($("practice")),
  onPick: drill => start(practiceMode(drill)),
  progress: practiceProgress,
  onStage: lesson => start(lesson, lesson.rules),
});
$("open-practice").addEventListener("click", () => practiceUI.open());

// ---- 퍼즐 ----
const puzzleProgress = createPuzzleProgress(store);
const puzzleDialog = /** @type {HTMLDialogElement} */ ($("puzzles"));
const playCustomPuzzle = (code, trial = false) => {
  const puzzle = decodePuzzle(code);
  if (!puzzle) {
    showMenuNotice(t("링크의 퍼즐을 읽을 수 없었어요."));
    return;
  }
  const custom = customPuzzleMode(puzzle);
  start({ ...custom, puzzleCode: code, trialCode: trial ? code : null }, custom.rules);
};
const puzzleEditor = createPuzzleEditor({ dialog: puzzleDialog, onTry: code => playCustomPuzzle(code, true) });
const puzzleUI = createPuzzleUI({
  dialog: puzzleDialog,
  onCreate: () => puzzleEditor.open(),
  progress: puzzleProgress,
  onPick: p => start(puzzleMode(p), MODERN),
});
$("open-puzzles").addEventListener("click", () => puzzleUI.open());
$("puzzles").addEventListener("close", () => {
  if (!puzzleDialog.open && screen === "menu") $("open-puzzles").focus();
  if (!puzzleDialog.open && screen === "results" && mode.trialCode)
    /** @type {HTMLElement | null} */ (panels.results.querySelector('[data-action="export"]'))?.focus();
});
/** 첫 화면 "퍼즐" 줄의 진행도 */
const renderAchievementProgress = () => {
  const done = achievements.unlocked();
  $("achievement-progress").textContent = `${ACHIEVEMENTS.filter(a => done[a.id]).length} / ${ACHIEVEMENTS.length}`;
};

const renderPuzzleProgress = () => {
  $("puzzle-progress").textContent = `${puzzleProgress.cleared().size} / ${PUZZLES.length}`;
};
$("practice").addEventListener("close", () => {
  if (screen === "menu") /** @type {HTMLElement | null} */ ($("open-practice"))?.focus();
});

const versusUI = createVersusUI({
  dialog: /** @type {HTMLDialogElement} */ ($("versus")),
  getStats: versusStats,
  onPick: (level, style) => start(versusMode(level, style)),
  getStyle: () => String(store.get("versus:style", "balanced")),
  setStyle: style => store.set("versus:style", style),
});
$("versus").addEventListener("close", () => {
  if (screen === "menu") /** @type {HTMLElement | null} */ (document.querySelector('[data-mode="versus"]'))?.focus();
});

const statsUI = createStatsUI({ dialog: /** @type {HTMLDialogElement} */ ($("stats")) });
$("stats").addEventListener("close", () => {
  if (screen !== "results") return;
  const stats = /** @type {HTMLDialogElement} */ ($("stats"));
  if (stats.returnValue === "splits") {
    const details = /** @type {HTMLDetailsElement} */ ($("results-splits"));
    details.open = true;
    details.querySelector("summary")?.focus();
  } else {
    /** @type {HTMLElement | null} */ (document.querySelector('[data-action="stats"]'))?.focus();
  }
});

const achievements = createAchievements(store);
const achievementsUI = createAchievementsUI({
  dialog: /** @type {HTMLDialogElement} */ ($("achievements")),
  achievements,
});
$("open-achievements").addEventListener("click", () => achievementsUI.open());
$("achievements").addEventListener("close", () => {
  if (screen === "menu") /** @type {HTMLElement | null} */ ($("open-achievements"))?.focus();
});

const recordsUI = createRecordsUI({
  dialog: /** @type {HTMLDialogElement} */ ($("records")),
  modes: RECORD_MODES,
  records,
  sprintHistory,
  replayFor: (key, entry) => replays.forEntry(key, entry),
  onWatch: replay => startReplay(replay, "menu", "", true),
  // 내 기록과 달리기(첫 화면에서 옮겨 왔다): 프리셋 규칙이나 지금 쓰는 Custom 규칙일 때
  canRace: (modeId, rulesId) => {
    const ruleSet = rulesById(rulesId);
    return Boolean(ruleSet && raceTargetFor(findMode(modeId), ruleSet));
  },
  onRace: (modeId, rulesId) => {
    const ruleSet = rulesById(rulesId);
    if (ruleSet) startRace(findMode(modeId), ruleSet);
  },
});
$("open-records").addEventListener("click", () => recordsUI.open({ modeId: mode.id, rulesId: currentRules().id }));
$("records").addEventListener("close", () => {
  if (screen === "menu") /** @type {HTMLElement | null} */ ($("open-records"))?.focus();
});

const handleSystem = (action, code = "") => {
  if (restoringRun) return;
  if (
    settingsUI.isOpen ||
    rulesUI.isOpen ||
    recordsUI.isOpen ||
    statsUI.isOpen ||
    practiceUI.isOpen ||
    versusUI.isOpen ||
    dailyUI.isOpen ||
    achievementsUI.isOpen ||
    helpUI.isOpen ||
    puzzleUI.isOpen ||
    shareUI.isOpen
  )
    return;
  if (scenePractice) {
    if (action === "restart") resetSceneAttempt();
    else if (action === "pause" && code !== "Escape") {
      if (screen === "paused") resume();
      else pause();
    }
    return;
  }
  if (screen === "replay") {
    if (action === "restart") restartReplay();
    else if (action === "pause" && code === "Escape") stopReplay();
    else if (action === "pause" && player && !player.done) {
      replayPaused = !replayPaused;
      updateReplayBar();
    }
    return;
  }
  // 묻는 중: R은 한 번 더 누르면 다시 시작, Esc는 취소
  if (confirming) {
    if (action === "pause") cancelConfirm();
    else if (action === "restart" && confirming === "restart") acceptConfirm();
    return;
  }
  // 진행 중인 판은 묻고, 끝난 판(결과 화면)은 바로 다시 시작
  if (action === "restart" && inProgress()) return askConfirm("restart");
  if (action === "restart" && screen === "results") return start(mode, rules, race?.target);
  if (action === "undo") return undoPiece();
  if (action !== "pause") return;
  if (screen === "play" || screen === "countdown") pause();
  else if (screen === "paused") resume();
  else if (screen === "results") toMenu();
};

const keyboard = createKeyboard({ getBindings: () => bindings, onSystem: handleSystem });
const touch = createTouch({
  root: $("touchpad"),
  onSystem: handleSystem,
  vibrate: () => settings.access.vibrate === "on",
});

// ---- 편의: 제스처 조작 · 되돌리기 · 진동 · 화면 읽기 알림 ----

/** 보드 한 칸의 화면 폭(px): 캔버스 폭 ÷ 칸 수(넓으면 20, 좁으면 16) */
const boardCellPx = () =>
  canvas.getBoundingClientRect().width /
  (window.matchMedia(
    "(max-width: 720px) and (not ((orientation: landscape) and (max-height: 520px) and (pointer: coarse)))"
  ).matches
    ? 16
    : 20);
const gestures = createGestures({
  root: /** @type {HTMLElement} */ (document.querySelector(".board-wrap")),
  cellSize: boardCellPx,
});
/** 제스처 방식을 쓰는가: 설정이 제스처이고 터치 조작이 보이는 기기 */
const gesturesOn = () => settings.touchMode === "gestures" && touchVisible(settings.touch, isTouchScreen());

const undo = createUndo();

// ---- 키 입력 표시 ----
const inputDisplay = createInputDisplay({ root: $("input-display"), isOn: () => settings.visual.inputs === "on" });

/** 연습 모드에서 바로 앞 피스로 되돌린다 */
const undoPiece = () => {
  if (!game || !mode.practice || isGuidedPractice() || (screen !== "play" && screen !== "paused")) return;
  if (!undo.undo(game.state)) {
    say(t("더 되돌릴 수 없어요"));
    return;
  }
  runJournal?.action("undo");
  renderer.clearEffects();
  announceText([t("되돌리기")]);
  say(t("한 피스 되돌렸어요"));
};
$("undo-piece").addEventListener("click", undoPiece);

/** 터치 버튼 보이기: 설정 + 기기(굵은 포인터). 설정을 바꿀 때만 바뀐다(원칙 2). */
// 터치 화면 판정: 굵은 포인터이거나, 마우스 올리기가 없는 화면에서 터치를 지원할 때(iPhone 등)
const coarse = typeof matchMedia === "function" ? matchMedia("(pointer: coarse)") : null;
const noHover = typeof matchMedia === "function" ? matchMedia("(hover: none)") : null;
const isTouchScreen = () =>
  Boolean(coarse?.matches) || (Boolean(noHover?.matches) && (navigator.maxTouchPoints ?? 0) > 0);
const applyTouch = () => {
  document.body.classList.toggle("touch-on", touchVisible(settings.touch, isTouchScreen()));
  // 제스처 방식: 보드 아래 버튼 대신 보드를 밀고 두드린다
  document.body.classList.toggle("gestures-mode", gesturesOn());
  gestures.setEnabled((screen === "play" || screen === "countdown") && gesturesOn());
};
coarse?.addEventListener?.("change", applyTouch);
noHover?.addEventListener?.("change", applyTouch);

/** 메뉴·결과·일시정지 화면에서 게임패드로 버튼 사이를 옮겨 다니고 누른다. */
const handlePadMenu = action => {
  if (
    settingsUI.isOpen ||
    rulesUI.isOpen ||
    recordsUI.isOpen ||
    statsUI.isOpen ||
    practiceUI.isOpen ||
    versusUI.isOpen ||
    dailyUI.isOpen ||
    achievementsUI.isOpen ||
    helpUI.isOpen ||
    puzzleUI.isOpen ||
    shareUI.isOpen
  )
    return;
  const panel = Object.values(panels).find(p => !p.hidden);
  if (!panel || screen === "play" || screen === "countdown" || screen === "replay") return;
  const buttons = /** @type {HTMLButtonElement[]} */ ([...panel.querySelectorAll("button")]).filter(
    b => !b.disabled && b.offsetParent !== null
  );
  if (!buttons.length) return;
  const at = buttons.indexOf(/** @type {any} */ (document.activeElement));
  if (action === "select") {
    if (at >= 0) buttons[at].click();
    else buttons[0].focus();
  } else {
    const next = at < 0 ? 0 : (at + (action === "down" ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next].focus();
  }
};

const pad = createGamepad({ onSystem: handleSystem, onMenu: handlePadMenu, getMap: () => padBindings });
padRef = pad;

// ---- 도움말 · 처음 오신 분 안내 ----
const helpUI = createHelpUI({
  dialog: /** @type {HTMLDialogElement} */ ($("help")),
  getSettings: () => settings,
  isTouch: () => touchVisible(settings.touch, isTouchScreen()),
  canStart: () => screen === "menu",
  onStart: () => start(findMode("sprint40"), MODERN),
  onIntro: () => start(INTRO_LESSONS[0], MODERN),
  onOpenSettings: tab => {
    pause();
    settingsUI.open(tab);
  },
});
const welcome = $("welcome");
const dismissWelcome = () => {
  welcome.hidden = true;
  store.set("welcomeSeen", true);
};
welcome.hidden = Boolean(store.get("welcomeSeen", false));
$("welcome-open").addEventListener("click", () => {
  dismissWelcome();
  helpUI.open({ fromWelcome: true });
});
$("welcome-close").addEventListener("click", dismissWelcome);
// 처음 온 사람이 설정을 찾지 않아도 소리를 켤 수 있게(설정의 효과음 크기와 같은 값을 바꾼다)
const WELCOME_VOLUME = 60;
const welcomeSound = $("welcome-sound");
const renderWelcomeSound = () => {
  const on = settings.volume > 0;
  welcomeSound.setAttribute("aria-pressed", String(on));
  /** @type {HTMLElement} */ (welcomeSound.querySelector(".btn-label")).textContent = on
    ? t("소리 끄기")
    : t("소리 켜기");
};
welcomeSound.addEventListener("click", () => {
  settings = sanitizeSettings({ ...settings, volume: settings.volume > 0 ? 0 : WELCOME_VOLUME });
  saveSettings(store, settings);
  renderWelcomeSound();
  if (settings.volume > 0) sfx.play("clear2");
});
renderWelcomeSound();
$("open-help").addEventListener("click", () => {
  pause();
  helpUI.open();
});
$("help").addEventListener("close", () => {
  if (screen === "paused") showPanel("pause");
});

$("open-settings").addEventListener("click", () => {
  pause();
  settingsUI.open();
});

for (const btn of document.querySelectorAll("[data-action]")) {
  btn.addEventListener("click", () => {
    const action = btn.getAttribute("data-action");
    if (action === "scene-retry" || (scenePractice && action === "retry")) return resetSceneAttempt();
    if (action === "scene-exit" || (scenePractice && action === "menu")) return exitScenePractice();
    if (action === "resume") resume();
    if (action === "retry") {
      if (inProgress()) askConfirm("restart");
      else start(mode, rules, race?.target);
    }
    if (
      lastReplay &&
      ((action === "retry-seed" && mode.splits) || (action === "survival-retry-seed" && mode.id === "survival"))
    )
      start(mode, rules, null, lastReplay.seed);
    if (action === "race-best" && mode.splits) startRace(mode, rules);
    if (action === "next-puzzle" && isGuidedPractice()) {
      const next = nextPracticeLesson();
      if (next) start(next, next.rules);
    }
    if (action === "next-puzzle" && mode.puzzle?.number) {
      const next = PUZZLES[mode.puzzle.number] ?? puzzleProgress.next();
      start(puzzleMode(next), MODERN);
    }
    if (action === "menu") {
      if (inProgress()) askConfirm("menu");
      else toMenu();
    }
    if (action === "watch" && lastReplay) startReplay(lastReplay, "results", "", true);
    if (action === "stats" && game)
      statsUI.open(game.state, `${mode.name} · ${rules.name}`, !!mode.splits && splits.length > 0);
    if (action === "export") {
      if (mode.trialCode) puzzleEditor.open();
      else if (lastReplay && !lastReplay.cpu) shareUI.open(lastReplay, `${mode.name} · ${rules.name}`);
    }
  });
}

// 창이 포커스를 잃으면 keyup을 못 받는다 → 자동 일시정지.
window.addEventListener("blur", pause);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) return;
  if (screen === "paused") saveRun();
  else pause();
});
window.addEventListener("pagehide", () => saveRun());
window.addEventListener("storage", () => {
  if (screen === "menu") renderContinue();
});

// ---- 리플레이 ----

const replays = createReplayStore(store, findMode);
/** @type {ReturnType<typeof createRecorder> | null} */
let recorder = null;
/** 방금 끝난 판의 리플레이 */
let lastReplay = null;
/** @type {ReturnType<typeof createPlayer> | null} */
let player = null;
let playing = null;
let ownReplay = false;
let replayPaused = false;
let replaySpeed = 1;
/** 리플레이를 닫으면 돌아갈 곳 */
let replayReturn = /** @type {{ screen: string, game: any, mode: any, rules: any, focus: Element | null }} */ ({});
const SPEEDS = [1, 2, 4];
const replayBar = $("replay-bar");
const replayStatus = $("replay-status");
const replayNote = $("replay-note");
const replayProgress = /** @type {HTMLInputElement} */ ($("replay-progress"));
const replayMarkers = $("replay-markers");
let selectedMark = -1;
/** @type {(ReturnType<typeof analyzeReplay> & { for: any }) | null} 지금 보는 리플레이의 분석 */
let analysis = null;
const replayTime = $("replay-time");
const replayBattleView = $("replay-battle-view");
const replayBattleTally = $("replay-battle-tally");
const replayBattleEvent = $("replay-battle-event");
const resetReplayBattleEvent = () => {
  if (!replayBattleEvent.hidden) replayBattleEvent.hidden = true;
};
const replayStep = /** @type {HTMLButtonElement} */ (replayBar.querySelector('[data-replay="step"]'));
const replayToggle = /** @type {HTMLButtonElement} */ (replayBar.querySelector('[data-replay="toggle"]'));

const replayLength = () => playing?.result?.frames || analysis?.length || 0;

const updateReplayProgress = () => {
  const frame = player?.frame ?? 0;
  const length = replayLength();
  const max = String(length || 1);
  if (replayProgress.max !== max) replayProgress.max = max;
  const value = String(Math.min(frame, length || 1));
  if (replayProgress.value !== value) replayProgress.value = value;
  const fill = `${length ? (Math.min(frame, length) / length) * 100 : 0}%`;
  if (replayProgress.style.getPropertyValue("--fill") !== fill) replayProgress.style.setProperty("--fill", fill);
  setText(replayTime, length ? `${formatTime(frame)} / ${formatTime(length)}` : formatTime(frame));
  if (player?.cpu) {
    setText($("replay-own-pending"), String(player.game.state.garbage.pending));
    setText($("replay-cpu-pending"), String(player.cpu.state.garbage.pending));
  }
};

const MARK_LABELS = {
  finesse: m => t("피네스 실수 +{n} · {piece}", { n: m.value, piece: m.label }),
  slow: m => t("오래 고민한 피스 · {s}초", { s: (m.value / 60).toFixed(1) }),
  highlight: m => m.label,
  sent: m => m.label,
  blocked: m => m.label,
  received: m => m.label,
};

/** 같은 줄에 있는 가까운 표시만 묶는다. 종류마다 별도 줄을 써서 서로 가리지 않는다. */
const renderTimelineMarks = () => {
  const length = replayLength();
  const width = replayMarkers.clientWidth;
  const groups = [];
  const lastOfKind = new Map();
  const marks = analysis?.markers ?? [];
  if (!length || !width) return;
  for (const [index, mark] of marks.entries()) {
    const x = (mark.frame / length) * width;
    const last = lastOfKind.get(mark.kind);
    if (last && x - last.x < 18) last.count++;
    else {
      const group = { x, index, count: 1 };
      groups.push(group);
      lastOfKind.set(mark.kind, group);
    }
  }
  const lanes = new Map(Object.keys(MARK_LABELS).map(kind => [kind, document.createElement("div")]));
  for (const { x, index, count } of groups) {
    const mark = marks[index];
    const b = document.createElement("button");
    b.type = "button";
    b.tabIndex = -1;
    b.className = `replay-mark is-${mark.kind}`;
    b.classList.toggle("is-group", count > 1);
    b.style.left = `${(x / width) * 100}%`;
    const firstLabel = MARK_LABELS[mark.kind](mark);
    const label = count > 1 ? `${t("장면 {n}개", { n: count })} · ${firstLabel}` : firstLabel;
    b.title = `${formatTime(mark.frame)} · ${label}`;
    b.setAttribute("aria-label", b.title);
    b.addEventListener("click", () => {
      seekMark(index);
      replayProgress.focus({ preventScroll: true });
    });
    lanes.get(mark.kind).append(b);
  }
  replayMarkers.replaceChildren(...[...lanes.values()].filter(lane => lane.childElementCount));
};

new ResizeObserver(() => {
  if (screen === "replay") renderTimelineMarks();
}).observe(replayMarkers);

// 리플레이 조작 줄의 실제 높이: 휴대폰 세로에서 보드가 남는 높이를 정확히 쓰게 한다(css/game.css).
// 조작 줄 높이는 언어·화면 폭에 따라 240~300px로 달라 고정값으로 빼면 보드가 너무 작아지거나 화면을 넘친다.
new ResizeObserver(() => {
  const h = replayBar.hidden ? 0 : Math.ceil(replayBar.getBoundingClientRect().height);
  if (h) document.body.style.setProperty("--replay-bar-h", `${h}px`);
}).observe(replayBar);

/** 장면 목록(넓은 화면): 표시마다 [이름 | 시간] 한 줄, 누르면 그 장면으로 */
const renderSceneList = () => {
  const marks = analysis?.markers ?? [];
  $("replay-scene-list").replaceChildren(
    ...(marks.length
      ? marks.map((mark, index) =>
          button({
            label: MARK_LABELS[mark.kind](mark),
            meta: formatTime(mark.frame),
            variant: "ghost",
            size: "s",
            class: `replay-scene is-${mark.kind}`,
            "data-mark": String(index),
            "aria-current": index === selectedMark ? "true" : undefined,
            onClick: () => seekMark(index),
          })
        )
      : [el("p", { class: "replay-scene-empty", text: t("표시할 장면이 없어요") })])
  );
};

const renderMarkers = () => {
  renderTimelineMarks();
  renderSceneList();
  const markers = analysis?.markers ?? [];
  const highlights = markers.filter(m => m.kind === "highlight").length;
  // 요약: 표시 색과 같은 작은 칸 + 개수(범례 역할)
  const part = (kind, text) => {
    const span = document.createElement("span");
    span.className = `replay-legend is-${kind}`;
    span.textContent = text;
    return span;
  };
  $("replay-summary").replaceChildren(
    ...(analysis
      ? [
          ...(analysis.finesse.faults ? [part("finesse", t("피네스 실수 {n}", { n: analysis.finesse.faults }))] : []),
          ...(analysis.slow ? [part("slow", t("오래 고민 {n}", { n: analysis.slow }))] : []),
          ...(highlights ? [part("highlight", t("주요 장면 {n}", { n: highlights }))] : []),
          ...(player?.cpu
            ? [
                ["sent", t("전송")],
                ["blocked", t("상쇄")],
                ["received", t("수신")],
              ]
                .filter(([kind]) => markers.some(mark => mark.kind === kind))
                .map(([kind, label]) => part(kind, label))
            : []),
        ]
      : [])
  );
  for (const b of /** @type {NodeListOf<HTMLButtonElement>} */ (
    replayBar.querySelectorAll('[data-replay="prev-mark"], [data-replay="next-mark"]')
  ))
    b.disabled = !markers.length;
};

/**
 * 원하는 프레임으로 간다. 뒤로 갈 때는 처음부터 다시 돌려 그 프레임까지 빠르게 진행한다(엔진이 결정론적이라 같은 판).
 * 이동한 뒤에는 멈춘다(pause = true)거나 재생 상태를 그대로 둔다.
 */
const seekReplay = (target, pause = false) => {
  if (!playing || !player) return;
  selectedMark = -1;
  resetReplayBattleEvent();
  const to = Math.max(0, Math.min(Math.round(target), replayLength() || target));
  if (to < player.frame) {
    player = createPlayer(playing, findMode);
    game = player.game;
  }
  while (player.frame < to && !player.done) player.step();
  if (pause) replayPaused = true;
  renderer.clearEffects();
  replayCpuRenderer.clearEffects();
  fb.clearAction();
  updateReplayBar();
};

const seekMark = index => {
  const mark = analysis?.markers[index];
  if (!mark) return false;
  seekReplay(player?.cpu ? mark.frame : mark.frame - 30, true);
  selectedMark = index;
  for (const row of $("replay-scene-list").querySelectorAll("[data-mark]"))
    if (row.getAttribute("data-mark") === String(index)) row.setAttribute("aria-current", "true");
    else row.removeAttribute("aria-current");
  if (player?.cpu) {
    replayBattleEvent.textContent = mark.label;
    replayBattleEvent.hidden = false;
  }
  return true;
};

/** 지금 위치 또는 마지막으로 선택한 표시를 기준으로 앞뒤 장면을 본다. */
const jumpMark = dir => {
  const marks = analysis?.markers ?? [];
  const frame = player?.frame ?? 0;
  if (selectedMark >= 0) return seekMark(selectedMark + dir);
  const next =
    dir > 0
      ? marks.findIndex(mark => (frame === 0 ? mark.frame >= frame : mark.frame > frame))
      : marks.findLastIndex(mark => mark.frame < frame);
  return seekMark(next);
};

replayProgress.addEventListener("input", () => seekReplay(Number(replayProgress.value), true));
const menuNotice = $("menu-notice");

const replayPractice = /** @type {HTMLButtonElement} */ (replayBar.querySelector('[data-replay="practice"]'));

const canPracticeScene = () => ownReplay && playing?.mode === "sprint40" && player && !player.done;

const updateReplayBar = () => {
  // 재생 중에도 누를 수 있다: 누르면 멈추고 지금 장면을 연습한다(이유 없이 꺼져 있던 것, U43)
  replayPractice.disabled = !canPracticeScene();
  // 끝까지 본 뒤에는 재생 단추가 "다시 재생"(처음부터)이 된다. 흐려진 "일시정지"로 남지 않게.
  const ended = Boolean(player?.done);
  /** @type {HTMLElement} */ (replayBar.querySelector(".replay-toggle-icon")).replaceChildren(
    icon(ended ? "restart" : replayPaused ? "play" : "pause")
  );
  /** @type {HTMLElement} */ (replayBar.querySelector(".replay-toggle-text")).textContent = ended
    ? t("다시 재생")
    : replayPaused
      ? t("재생")
      : t("일시정지");
  /** @type {HTMLElement} */ (replayBar.querySelector(".replay-speed")).textContent = `${replaySpeed}x`;
  replayStatus.textContent = player?.done ? (player.cpu ? mode.summary(game.state).title : t("끝")) : "";
  replayStep.disabled = !player || player.done;
  replayToggle.disabled = !player;
  for (const b of /** @type {NodeListOf<HTMLButtonElement>} */ (
    replayBar.querySelectorAll('[data-replay="back"], [data-replay="step-back"]')
  ))
    b.disabled = !player || player.frame === 0;
  updateReplayProgress();
};

const startReplay = (replay, returnTo = screen, note = "", local = false) => {
  const entering = screen !== "replay";
  const focus = document.activeElement;
  if (entering) {
    replayReturn = { screen: returnTo, game, mode, rules, focus };
    ownReplay = local;
  }
  selectedMark = -1;
  playing = replay;
  player = createPlayer(replay, findMode);
  game = player.game;
  mode = player.mode;
  rules = replay.rules;
  replayPaused = false;
  const battle = Boolean(player.cpu);
  if (entering && battle) selectReplayBoard("own");
  document.body.toggleAttribute("data-battle-replay", battle);
  replayBattleView.hidden = replayBattleTally.hidden = !battle;
  resetReplayBattleEvent();
  versusPanel.hidden = true;
  document.body.classList.remove("is-versus");
  if (analysis?.for !== replay) analysis = { ...analyzeReplay(replay, findMode), for: replay };
  // 끝까지 갔을 때의 시간 표시만큼 처음부터 자리를 잡는다.
  const length = replayLength();
  const endTime = formatTime(length);
  $("replay-time-width").textContent = length ? `${endTime} / ${endTime}` : endTime;
  acc = 0;
  renderer.clearEffects();
  replayCpuRenderer.clearEffects();
  fb.clearAction();
  countdownEl.hidden = true;
  showPanel(null);
  setScreen("replay");
  showModeHud(mode, true);
  replayBar.hidden = false;
  replayPractice.hidden = !ownReplay || replay.mode !== "sprint40";
  replayNote.textContent = note;
  $("replay-title").textContent = `${mode.name} · ${rules.name}`;
  renderMarkers();
  /** @type {HTMLButtonElement} */ (replayBar.querySelector('[data-replay="race"]')).hidden = !canRace(replay);
  /** @type {HTMLButtonElement} */ (replayBar.querySelector('[data-replay="share"]')).hidden = battle;
  updateReplayBar();
  if (!entering && focus instanceof HTMLElement && replayBar.contains(focus)) focus.focus({ preventScroll: true });
  else replayToggle.focus({ preventScroll: true });
};

const restartReplay = () => playing && startReplay(playing, screen, replayNote.textContent);

const stopReplay = () => {
  if (screen !== "replay") return;
  player = null;
  playing = null;
  ownReplay = false;
  replayBar.hidden = true;
  replayBattleView.hidden = replayBattleTally.hidden = true;
  document.body.removeAttribute("data-battle-replay");
  document.body.removeAttribute("data-replay-board");
  versusPanel.hidden = !versus;
  document.body.classList.toggle("is-versus", Boolean(versus));
  renderer.clearEffects();
  replayCpuRenderer.clearEffects();
  ({ game, mode, rules } = replayReturn);
  if (replayReturn.screen === "results") {
    showModeHud(mode);
    setScreen("results");
    showPanel("results");
    if (replayReturn.focus instanceof HTMLElement && panels.results.contains(replayReturn.focus))
      replayReturn.focus.focus();
  } else {
    toMenu();
    if (replayReturn.focus instanceof HTMLElement && replayReturn.focus.getClientRects().length)
      replayReturn.focus.focus();
  }
};

const selectReplayBoard = view => {
  document.body.dataset.replayBoard = view;
  for (const b of replayBattleView.querySelectorAll("[data-board-view]")) {
    b.setAttribute("aria-pressed", String(b.getAttribute("data-board-view") === view));
  }
};
replayBattleView.addEventListener("click", e => {
  if (!(e.target instanceof Element)) return;
  const view = e.target.closest("[data-board-view]")?.getAttribute("data-board-view");
  if (player?.cpu && view) selectReplayBoard(view);
});

const sceneControls = $("scene-practice-controls");
const sceneStatus = $("scene-practice-status");
const pauseResume = /** @type {HTMLButtonElement} */ (panels.pause.querySelector('[data-action="resume"]'));

const sceneSplitProgress = $("scene-split-progress");
const sceneSplitMeter = /** @type {HTMLProgressElement} */ ($("scene-split-meter"));

const updateSceneSplitProgress = state => {
  const split = scenePractice.split;
  const cleared = Math.min(state.stats.lines, split.to);
  $("scene-split-lines").textContent = t("{n} / {goal}줄", { n: cleared, goal: split.to });
  $("scene-split-elapsed").textContent = formatTime(state.frame - scenePractice.startFrame);
  sceneSplitMeter.value = cleared - split.from;
};

const showSceneOutcome = outcome => {
  const { split } = scenePractice;
  const { delta, frames, original } = outcome;
  if (delta !== null) scenePractice.best = Math.min(scenePractice.best ?? frames, frames);
  $("scene-result-range").textContent = t("{from}–{to}줄 구간", split);
  $("scene-result-title").textContent = delta === null ? t("구간 미완료") : t("구간 완료");
  $("scene-result-original").textContent = formatTime(original);
  $("scene-result-attempt").textContent = delta === null ? "—" : formatTime(frames);
  const feedback = $("scene-result-delta");
  feedback.dataset.comparison = delta === null ? "incomplete" : delta < 0 ? "faster" : delta > 0 ? "slower" : "even";
  feedback.textContent =
    delta === null
      ? t("목표 {goal}줄 중 {n}줄까지 도달했어요.", { goal: split.to, n: game.state.stats.lines })
      : delta === 0
        ? t("원래 판과 같은 시간이에요.")
        : t(delta < 0 ? "원래 판보다 {time}초 단축" : "원래 판보다 {time}초 느림", {
            time: (Math.abs(delta) / 60).toFixed(2),
          });
  $("scene-result-best").textContent =
    scenePractice.best === null ? "" : t("이번 연습 최고 · {time}", { time: formatTime(scenePractice.best) });
};

const showFinesseSceneOutcome = (lock, inputs) => {
  const target = scenePractice.target;
  const same =
    lock?.piece === target.piece && target.cells.every(([x, y]) => lock.cells.some(([cx, cy]) => cx === x && cy === y));
  const delta = target.inputs - inputs;
  $("scene-result-range").textContent = t("{piece} 피네스 연습", { piece: target.piece });
  $("scene-result-title").textContent = same ? t("목표에 놓았어요") : t("목표와 다른 칸에 놓았어요");
  $("scene-result-original").textContent = t("{n}회 입력", { n: target.inputs });
  $("scene-result-attempt").textContent = t("{n}회 입력", { n: inputs });
  const feedback = $("scene-result-delta");
  feedback.dataset.comparison = !same ? "incomplete" : delta > 0 ? "faster" : delta < 0 ? "slower" : "even";
  feedback.textContent = !same
    ? t("점선과 같은 위치에 놓아야 비교할 수 있어요.")
    : delta === 0
      ? t("원래 판과 입력 횟수가 같아요.")
      : t(delta > 0 ? "원래 판보다 {n}회 적게 입력했어요." : "원래 판보다 {n}회 더 입력했어요.", {
          n: Math.abs(delta),
        });
  $("scene-result-best").textContent = "";
};

const showRescueOutcome = () => {
  const { originalFrame, originalBlocked } = scenePractice.rescue;
  const delta = game.state.frame - originalFrame;
  $("scene-result-range").textContent = t("Survival 구조 연습");
  $("scene-result-title").textContent = t("구조 시도 결과");
  $("scene-result-original").textContent = formatTime(originalFrame - scenePractice.startFrame);
  $("scene-result-attempt").textContent = formatTime(game.state.frame - scenePractice.startFrame);
  $("scene-result-delta").dataset.comparison = delta > 0 ? "faster" : delta === 0 ? "even" : "slower";
  $("scene-result-delta").textContent =
    delta === 0
      ? t("원래 판과 같은 시간이에요.")
      : t(delta > 0 ? "원래 판보다 {time}초 더 버텼어요." : "원래 판보다 {time}초 덜 버텼어요.", {
          time: (Math.abs(delta) / 60).toFixed(2),
        });
  const blocked = game.state.garbage.blocked - originalBlocked;
  $("scene-result-best").textContent = t("막은 쓰레기 줄 차이 {n}", { n: blocked > 0 ? `+${blocked}` : blocked });
};

const scenePracticeTitle = () =>
  scenePractice.rescue
    ? t("Survival 구조 연습")
    : scenePractice.target
      ? t("피네스 장면 연습")
      : scenePractice.split
        ? t("구간 연습")
        : t("장면 연습");
const sceneRetryLabel = () => (scenePractice.split ? t("구간 재시도") : t("장면 재시도"));

const setScenePauseLabels = () => {
  const ended = Boolean(scenePractice?.ended);
  pauseResume.disabled = ended;
  panels.pause.querySelector(".panel-title").textContent = ended ? t("장면 연습 종료") : t("일시정지");
  panels.pause.querySelector('[data-action="retry"] .btn-label').textContent = scenePractice
    ? sceneRetryLabel()
    : t("다시 시작");
  panels.pause.querySelector('[data-action="menu"] .btn-label').textContent = scenePractice
    ? t("리플레이로")
    : t("첫 화면으로");
};

const resetSceneAttempt = (restored = null) => {
  if (!scenePractice) return;
  const attempt = scenePractice.rescue
    ? createSurvivalAttempt(playing, findMode, scenePractice.spawnFrame)
    : createSceneAttempt(playing, findMode, scenePractice.spawnFrame);
  const split = scenePractice.split;
  if (
    !attempt ||
    (split &&
      (attempt.state.stats.lines < split.from ||
        attempt.state.stats.lines >= split.to ||
        attempt.state.frame >= split.endFrame))
  ) {
    exitScenePractice();
    replayNote.textContent = t("이 장면을 연습할 수 없어요. 다른 위치를 선택해 주세요.");
    return;
  }
  game = attempt;
  const target = scenePractice.target;
  if (target) game.state.finesseTarget = target.cells;
  sceneFinesse = target ? createFinesseTracker(game, ROTATIONS[rules.rotation]) : null;
  scenePractice.startFrame = game.state.frame;
  scenePractice.ended = false;
  if (!scenePractice.rescue) game.setHandling(toEngineHandling(restored?.handling ?? settings.handling));
  keyboard.releaseAll();
  touch.releaseAll();
  gestures.setEnabled(false);
  acc = 0;
  goTimer = 0;
  countdownEl.hidden = true;
  fb.clearAction();
  renderer.clearEffects();
  inputDisplay.show(0, 0);
  showPanel(null);
  setScreen("play");
  showModeHud(scenePractice.rescue ? mode : { hud: [] });
  setScenePauseLabels();
  sceneControls.querySelector('[data-action="scene-retry"] .btn-label').textContent = sceneRetryLabel();
  sceneStatus.textContent = target
    ? t("점선 칸에 맞춘 뒤 하드 드롭하세요.")
    : split
      ? t("{from}–{to}줄 구간", split)
      : t("연습 시작점 · {time}", { time: formatTime(scenePractice.spawnFrame) });
  if (!restoringRun) {
    beginJournal(playing.seed, null, {
      source: playing,
      returnFrame: player.frame,
      spawnFrame: scenePractice.spawnFrame,
      split: scenePractice.split,
      target: scenePractice.target,
      rescue: scenePractice.rescue,
      best: scenePractice.best,
    });
    saveRun();
  }
  sceneSplitProgress.hidden = !split;
  if (split) {
    sceneSplitMeter.max = split.to - split.from;
    updateSceneSplitProgress(game.state);
  }
  /** @type {HTMLElement | null} */ (sceneControls.querySelector('[data-action="scene-retry"]'))?.focus({
    preventScroll: true,
  });
};

/** @param {SceneSplit | null} split @param {FinesseScene | null} target */
const enterScenePractice = (split = null, target = null, rescue = null, restored = null) => {
  if (!replayPaused || !(canPracticeScene() || (rescue && player && !player.done))) return;
  if (!restoringRun && !canReplaceRun()) return;
  scenePractice = {
    spawnFrame: restored?.scene.spawnFrame ?? rescue?.spawnFrame ?? target?.spawnFrame ?? player.spawnFrame,
    split,
    target,
    rescue,
    startFrame: 0,
    best: restored?.scene.best ?? null,
    ended: false,
  };
  document.body.dataset.scenePractice = rescue ? "rescue" : target ? "finesse" : split ? "split" : "scene";
  replayBar.hidden = true;
  sceneControls.hidden = false;
  resetSceneAttempt(restored);
};

const exitScenePractice = () => {
  if (!scenePractice || !player) return;
  clearRun();
  scenePractice = null;
  sceneFinesse = null;
  document.body.removeAttribute("data-scene-practice");
  sceneControls.hidden = true;
  game = player.game;
  renderer.clearEffects();
  fb.clearAction();
  inputDisplay.show(player.input.held, player.input.pressed);
  showPanel(null);
  setScreen("replay");
  showModeHud(mode, true);
  setScenePauseLabels();
  replayBar.hidden = false;
  renderTimelineMarks();
  updateReplayBar();
  const target = playing?.mode === "survival" ? replayToggle : replayPractice;
  target.focus({ preventScroll: true });
};

$("survival-rescue").addEventListener("click", () => {
  const rescue = lastReplay && findSurvivalRescue(lastReplay, findMode);
  if (!rescue) return;
  startReplay(lastReplay, "results", "", true);
  seekReplay(rescue.spawnFrame, true);
  enterScenePractice(null, null, rescue);
});

const advanceReplay = count => {
  if (!player || player.done) return;
  selectedMark = -1;
  resetReplayBattleEvent();
  for (let i = 0; i < count && !player.done; i++) {
    const events = player.step();
    inputDisplay.show(player.input.held, player.input.pressed);
    if (!player.cpu) for (const e of events) announce(e);
    renderer.addEvents(events);
    if (player.cpu) replayCpuRenderer.addEvents(player.cpuEvents);
    // 빨리 감기 중에는 소리를 겹쳐 내지 않는다.
    if (count === 1) sfx.events(events);
  }
  if (player.done) updateReplayBar();
  else updateReplayProgress();
};

const tickReplay = () => {
  if (!replayPaused) advanceReplay(replaySpeed);
};

for (const btn of replayBar.querySelectorAll("[data-replay]")) {
  btn.addEventListener("click", e => {
    const action = btn.getAttribute("data-replay");
    if (action === "toggle") {
      if (player?.done) return restartReplay();
      replayPaused = !replayPaused;
    }
    if (action === "speed") replaySpeed = SPEEDS[(SPEEDS.indexOf(replaySpeed) + 1) % SPEEDS.length];
    if (action === "step") {
      replayPaused = true;
      advanceReplay(1);
    }
    if (action === "step-back") return seekReplay((player?.frame ?? 0) - 1, true);
    if (action === "back") return seekReplay((player?.frame ?? 0) - 300);
    if (action === "ahead") return seekReplay((player?.frame ?? 0) + 300);
    if (action === "prev-mark" || action === "next-mark") {
      if (jumpMark(action === "prev-mark" ? -1 : 1) && e instanceof MouseEvent && e.detail > 0) {
        replayProgress.focus({ preventScroll: true });
      }
      return;
    }
    if (action === "practice") {
      replayPaused = true;
      return enterScenePractice();
    }
    if (action === "share" && playing && !player?.cpu) return shareUI.open(playing, `${mode.name} · ${rules.name}`);
    if (action === "race" && playing) return raceReplay(playing);
    if (action === "restart") return restartReplay();
    if (action === "exit") return stopReplay();
    updateReplayBar();
  });
}

// 리플레이 중 단축키: Space 일시정지, 1·2·4 속도 (Esc 닫기, R 처음부터는 시스템 키로 처리)
window.addEventListener("keydown", e => {
  if (
    (screen !== "replay" && !scenePractice) ||
    settingsUI.isOpen ||
    rulesUI.isOpen ||
    recordsUI.isOpen ||
    statsUI.isOpen ||
    practiceUI.isOpen ||
    versusUI.isOpen ||
    dailyUI.isOpen ||
    achievementsUI.isOpen ||
    helpUI.isOpen ||
    puzzleUI.isOpen ||
    shareUI.isOpen
  )
    return;
  if (scenePractice) {
    if (!e.repeat && e.code === "Escape") exitScenePractice();
    return;
  }
  if (e.code === "Space" && !(document.activeElement instanceof HTMLButtonElement)) {
    e.preventDefault();
    if (!e.repeat && player?.done) restartReplay();
    else if (!e.repeat && player) {
      replayPaused = !replayPaused;
      updateReplayBar();
    }
    return;
  }
  if (e.repeat) return;
  if (e.code === "Escape") return stopReplay();
  if (["Digit1", "Digit2", "Digit4"].includes(e.code)) replaySpeed = Number(e.code.slice(5));
  // ←→: 5초(Shift: 한 프레임), 막대에 포커스가 있으면 막대가 처리한다
  else if (document.activeElement !== replayProgress && (e.code === "ArrowLeft" || e.code === "ArrowRight")) {
    const dir = e.code === "ArrowLeft" ? -1 : 1;
    e.preventDefault();
    return seekReplay((player?.frame ?? 0) + dir * (e.shiftKey ? 1 : 300), e.shiftKey);
  } else if (e.code === "BracketLeft" || e.code === "BracketRight") {
    e.preventDefault();
    return jumpMark(e.code === "BracketLeft" ? -1 : 1);
  } else return;
  e.preventDefault();
  updateReplayBar();
});

/** JSON 값을 파일로 내려받게 한다 */
const exportReplay = replay => {
  const stamp = (replay.date || "").replace(/[-:]/g, "").slice(0, 15);
  downloadJson(replay, `tetri-sharp-${replay.mode}-${stamp || "replay"}.json`);
};

/** 메뉴 알림 칸은 늘 자리를 차지한다(빈 글이면 비어 보일 뿐). */
const showMenuNotice = text => {
  menuNotice.textContent = text;
};
/** 데이터 작업(백업·리플레이 파일) 결과: 설정이 열려 있으면 설정의 알림 칸, 아니면 첫 화면 알림 줄 */
const notifyData = text => {
  if (settingsUI.isOpen) settingsUI.notify(text);
  else showMenuNotice(text);
};

/** 불러온 파일을 검사하고 재생한다. 결과가 기록과 다르면 알리고 그래도 재생한다. */
const openReplayText = text => {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    raw = null;
  }
  const replay = sanitizeReplay(raw, findMode);
  if (!replay) {
    notifyData(t("읽을 수 없는 리플레이 파일이에요."));
    return false;
  }
  const check = verifyReplay(replay, findMode);
  showMenuNotice("");
  settingsUI.close();
  const note = check.ok ? "" : t("저장된 결과와 재생 결과가 달라요. 다른 버전의 파일일 수 있어요.");
  startReplay(replay, "menu", note);
  return true;
};

$("watch-last").addEventListener("click", () => {
  const replay = replays.last();
  if (replay) startReplay(replay, "menu", "", true);
});
const fileInput = /** @type {HTMLInputElement} */ ($("replay-file"));
let replayFileRequest = 0;
fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  fileInput.value = "";
  if (!file) return;

  const request = ++replayFileRequest;
  let text;
  try {
    text = await file.text();
  } catch {
    if (request === replayFileRequest && screen === "menu") notifyData(t("파일을 읽지 못했어요. 다시 선택해 주세요."));
    return;
  }
  if (request === replayFileRequest && screen === "menu") openReplayText(text);
});

// ---- 저장 데이터 백업 ----

/** 백업을 들인 뒤 메모리에 들고 있던 값들을 저장소에서 다시 읽는다. */
const reloadFromStore = () => {
  settings = loadSettings(store);
  bindings = compileKeymap(settings.keymap);
  padBindings = compilePadmap(settings.padmap);
  records.reload();
  applyScheme();
  // 내 규칙이 없는 이전 백업이면 백업의 Custom 규칙을 지금 고른 칸에 넣는다
  const restoredCustom = sanitizeRuleBody(store.get("customRules", MODERN) ?? MODERN);
  if (JSON.stringify(restoredCustom) !== JSON.stringify(ruleSlots.active().body)) ruleSlots.update(restoredCustom);
  customBody = ruleSlots.active().body;
  const last = store.get("lastRules", null);
  ruleChoice = RULE_CHOICES.includes(last) ? last : "modern";
  mode = findMode(store.get("lastMode", null));
  lastReplay = null;
  applyTouch();
  renderKeyHelp();
  toMenu();
};

const backupActions = setupBackup({
  store,
  findMode,
  fileInput: /** @type {HTMLInputElement} */ ($("backup-file")),
  canImport: () => screen === "menu",
  confirmImport: message => window.confirm(message),
  notify: notifyData,
  onRestored: reloadFromStore,
});

// ---- 루프 ----

const applyRunHandling = handling => {
  game.setHandling(toEngineHandling(handling));
  if (!scenePractice) recorder?.handlingChanged(game.handling);
};

const advanceRun = (held, pressed, reconstructing = false) => {
  if (scenePractice) {
    const hadActive = Boolean(game.state.active);
    const events = game.step({ held, pressed });
    sceneFinesse?.frame(held, pressed, hadActive, events);
    const lock = scenePractice.target && events.find(event => event.type === "lock");
    const split = scenePractice.split;
    const outcome = split && splitAttemptOutcome(game.state, scenePractice.startFrame, split.to, split.endFrame);
    const ended = Boolean(outcome || lock || game.state.over);
    if (ended) scenePractice.ended = true;
    if (reconstructing) return;
    inputDisplay.show(held, pressed);
    renderer.addEvents(events);
    sfx.events(events);
    feedback(events);
    if (ended) {
      clearRun();
      if (outcome) {
        showSceneOutcome(outcome);
        fb.clearAction();
      } else if (scenePractice.target) {
        showFinesseSceneOutcome(lock, sceneFinesse.lastInputs);
        fb.clearAction();
      } else if (scenePractice.rescue) {
        showRescueOutcome();
        fb.clearAction();
      }
      setScenePauseLabels();
      pause();
    }
    return;
  }
  if (mode.practice && !isGuidedPractice()) undo.track(game.state);
  recorder?.input(held, pressed);
  const hadActive = Boolean(game.state.active);
  const events = game.step({ held, pressed });
  if (versus) {
    const cpuInput = versus.bot.input();
    versus.recorder.input(cpuInput.held, cpuInput.pressed);
    versus.cpu.step(cpuInput);
    settleBattleFrame(game, versus.cpu, events);
  }
  if (hasLessonHints(mode) && events.some(event => event.type === "lock")) resetLessonHint();
  const extra = finesse?.frame(held, pressed, hadActive, events) ?? 0;
  if (!reconstructing && extra > 0 && mode.finesse) announceText([t("피네스 +{n}", { n: extra })]);
  if (mode.splits) splits = advanceSplits(mode.splits, splits, game.state.stats.lines, game.state.frame);
  if (race) {
    if (!race.player.done) race.player.step();
    if (!reconstructing) updateRaceProgress();
  }
  if (reconstructing) return;
  inputDisplay.show(held, pressed);
  for (const e of events) {
    if (!versus || e.type !== "lock" || !e.lines) announce(e);
  }
  renderer.addEvents(events);
  sfx.events(events);
  feedback(events);
  if (events.some(e => e.type === "gameOver" || e.type === "finish")) finish();
};

const restoreRun = async () => {
  if (screen !== "menu" || restoringRun) return;
  const entry = savedRun();
  const m = entry && getRunMode(entry);
  if (!m) return;
  const initialHandling = sanitizeSettings({ handling: entry.handling }).handling;
  restoringRun = true;
  document.body.inert = true;
  let success = false;
  try {
    if (entry.scene) {
      const source = sanitizeReplay(entry.scene.source, findMode);
      if (!source || source.mode !== m.id) throw new Error("scene");
      startReplay(source, "menu", "", true);
      seekReplay(entry.scene.returnFrame, true);
      const { split, target, rescue } = entry.scene;
      enterScenePractice(split, target, rescue, { ...entry, handling: initialHandling });
      if (!scenePractice) throw new Error("scene");
    } else {
      const savedRules =
        m.puzzle || isGuidedPractice(m) ? m.rules : (PRESETS[entry.rules.id] ?? makeCustomRules(entry.rules));
      const replay = entry.target && sanitizeReplay(entry.target.replay, findMode);
      if (entry.target && (!replay || replay.mode !== m.id)) throw new Error("race");
      start(m, savedRules, replay ? { ...entry.target, replay } : null, entry.seed, {
        ...entry,
        handling: initialHandling,
      });
    }
    countdownEl.hidden = false;
    countdownEl.dataset.phase = "ready";
    $("countdown-label").textContent = t("저장된 판을 불러오는 중…");
    await replayRunJournal(entry, {
      applyAction(kind, value) {
        if (kind === "handling") applyRunHandling(sanitizeSettings({ handling: value }).handling);
        if (kind === "undo" && !undo.undo(game.state)) throw new Error("undo");
        if (kind === "hint") applyLessonHint();
      },
      applyInput(held, pressed) {
        advanceRun(held, pressed, true);
        if (game.state.over || scenePractice?.ended) throw new Error("finished");
      },
    });
    if (
      savedRun()?.id !== entry.id ||
      runFingerprint(game, scenePractice ? null : (versus?.cpu ?? race?.player.game)) !== entry.fingerprint
    )
      throw new Error("checkpoint");
    if (m.trialCode) puzzleEditor.load(m.trialCode);
    savedRunId = entry.id;
    runJournal = createRunJournal(null, {
      ...entry,
      id: Array.from(crypto.getRandomValues(new Uint32Array(4))).join("-"),
    });
    lastSavedStep = -1;
    success = true;
  } catch {
    if (scenePractice) exitScenePractice();
    stopReplay();
    toMenu();
    countdownEl.hidden = true;
    showMenuNotice(t("저장된 판을 이어서 할 수 없어요."));
  } finally {
    document.body.inert = false;
    restoringRun = false;
  }
  if (!success) return;
  if (race) updateRaceProgress();
  if (scenePractice?.split) updateSceneSplitProgress(game.state);
  renderer.clearEffects();
  acc = 0;
  last = performance.now();
  countdown = COUNTDOWN_FRAMES[settings.access.countdown] ?? READY_FRAMES;
  countdownEl.hidden = !countdown;
  $("countdown-label").textContent = t("준비");
  setScreen(countdown ? "countdown" : "play");
  $("pause-game").focus({ preventScroll: true });
  saveRun();
};

continueRun.addEventListener("click", restoreRun);

const tick = () => {
  if (screen === "countdown") {
    keyboard.takePressed(); // 카운트다운 중 누른 키는 버린다(누르고 있는 키는 시작하자마자 반영).
    touch.takePressed();
    gestures.takePressed();
    countdown -= 1;
    if (countdown <= 0) {
      setScreen("play");
      goTimer = GO_FRAMES;
      countdownEl.dataset.phase = "go";
      $("countdown-label").textContent = t("시작!");
      sfx.play("go");
    }
    return;
  }
  if (screen === "replay") return tickReplay();
  if (screen !== "play" || !game) return;
  if (goTimer > 0 && --goTimer === 0) countdownEl.hidden = true;
  const allowed = scenePractice?.target ? ~(BTN.HOLD | BTN.SOFT) : mode.lesson ? ~BTN.SOFT : -1;
  const held = (keyboard.held | pad.held | touch.held | gestures.held) & allowed;
  const pressed = (keyboard.takePressed() | touch.takePressed() | gestures.takePressed()) & allowed;
  runJournal?.input(held, pressed);
  advanceRun(held, pressed);
  saveRun(false);
};

let padCount = 0;
const loop = now => {
  if (restoringRun) {
    last = now;
    requestAnimationFrame(loop);
    return;
  }
  pad.poll();
  // gamepadconnected 이벤트는 버튼을 한 번 눌러야 오는 브라우저가 있어 개수 변화로도 확인한다.
  if (pad.connected !== padCount) {
    padCount = pad.connected;
    renderKeyHelp();
  }
  acc += Math.min(now - last, MAX_CATCH_UP_MS);
  last = now;
  if (screen !== "play" && screen !== "countdown" && !(screen === "replay" && !replayPaused)) acc = 0;
  while (acc >= FRAME_MS) {
    tick();
    acc -= FRAME_MS;
  }
  renderer.draw(game);
  if (screen === "replay" && player?.cpu) replayCpuRenderer.draw(player.cpu);
  if (race && !scenePractice && screen !== "replay" && raceBoardVisible.matches) raceRenderer.draw(race.player.game);
  if (versus && screen !== "replay" && raceBoardVisible.matches) cpuRenderer.draw(versus.cpu);
  updateHud();
  inputDisplay.paint();
  requestAnimationFrame(loop);
};

/** 결과 링크(#daily=…)로 열었으면 오늘의 도전 창을 그 코드로 연다. 주소의 해시는 지운다. */
// ---- 리플레이 공유 · 그 기록과 달리기 ----
const shareUI = createShareUI({
  dialog: /** @type {HTMLDialogElement} */ ($("share")),
  makeCode: replay => encodeReplayCode(replay, replay.name || records.playerName),
  makeLink: code => replayLink(code, location.href, "replay"),
  onSaveFile: exportReplay,
});

/** 지금 보는 리플레이와 같은 블록 순서로 달린다(달리기가 되는 모드, 끝까지 간 판만) */
const canRace = replay => {
  const m = findMode(replay.mode);
  return Boolean(m.race) && replay.result.over === m.race.finish;
};
const raceReplay = replay => {
  if (!canRace(replay)) return;
  const m = findMode(replay.mode);
  let targetSplits = [];
  verifyReplay(replay, findMode, state => {
    if (m.splits) targetSplits = advanceSplits(m.splits, targetSplits, state.stats.lines, state.frame);
  });
  const r = replay.result;
  const best = { frames: r.frames, lines: r.lines, pieces: r.pieces, score: r.score };
  start(m, replay.rules, { replay, best, splits: targetSplits, friend: replay.name || t("이 리플레이") });
};

/** 리플레이 링크(#replay=…)로 열었으면 검증하고 바로 재생한다. 주소의 해시는 지운다. */
const importReplayFromLink = async () => {
  const hash = takeLinkHash("replay");
  if (!hash) return;
  const raw = await decodeReplayCode(hash);
  const replay = raw && sanitizeReplay(raw, findMode);
  if (!replay) {
    showMenuNotice(t("링크의 리플레이를 읽을 수 없었어요."));
    return;
  }
  const check = verifyReplay(replay, findMode);
  const from = replay.name ? t("{name}의 리플레이", { name: replay.name }) : t("받은 리플레이");
  startReplay(replay, "menu", check.ok ? from : t("저장된 결과와 재생 결과가 달라요. 다른 버전의 파일일 수 있어요."));
};

const importDailyFromLink = () => {
  const pasted = takeLinkHash("daily");
  if (!pasted) return;
  dailyUI.open({
    pasted,
    message: t("받은 결과가 있어요. 겨루기를 누르면 같은 블록 순서로 함께 달려요"),
  });
};

/** 공유 링크(#rules=…)로 열었으면 그 규칙을 Custom으로 들이고 알린다. 주소의 해시는 지운다. */
const importRulesFromLink = () => {
  const hash = takeLinkHash("rules");
  if (!hash) return false;
  const body = decodeRules(hash);
  if (!body) {
    showMenuNotice(t("링크의 규칙 코드를 읽을 수 없었어요."));
    return false;
  }
  // 지금 규칙을 덮어쓰지 않고 내 규칙에 새 칸으로
  if (!ruleSlots.add(t("받은 규칙"), body)) {
    showMenuNotice(t("내 규칙이 가득 찼어요({n}개). 하나를 지우고 링크를 다시 열어 주세요", { n: MAX_RULE_SLOTS }));
    return false;
  }
  customBody = ruleSlots.active().body;
  ruleChoice = "custom";
  store.set("lastRules", "custom");
  showMenuNotice(t("링크로 받은 규칙을 내 규칙에 새로 넣었어요"));
  return true;
};

document.documentElement.lang = lang;
translateDom(document.documentElement);
hydrateIcons();
applyTouch();
renderKeyHelp();
// 링크로 규칙을 받았으면 Custom 규칙 기준으로 키 안내를 다시 그린 뒤 메뉴를 연다.
if (importRulesFromLink()) renderKeyHelp();
toMenu(true);
const puzzleHash = takeLinkHash("puzzle");
if (puzzleHash) playCustomPuzzle(new URLSearchParams(puzzleHash.slice(1)).get("puzzle"));
else {
  importDailyFromLink();
  importReplayFromLink();
}
requestAnimationFrame(loop);

// 설치형 앱(GitHub Pages 배포본): 매니페스트가 걸려 있을 때만 서비스 워커를 등록한다.
// 한 파일 배포본(파일로 열기)에는 매니페스트가 없어서 등록하지 않는다.
if (
  "serviceWorker" in navigator &&
  document.querySelector('link[rel="manifest"]') &&
  location.protocol.startsWith("http")
) {
  navigator.serviceWorker.register("./sw.js").catch(() => {
    /* 등록이 안 돼도 게임은 그대로 된다 */
  });
}

// 브라우저 테스트가 "앱이 끝까지 떴는지" 확인하는 표시.
document.documentElement.dataset.ready = "1";
