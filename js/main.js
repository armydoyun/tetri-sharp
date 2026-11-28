// 진입점: 화면 흐름(메뉴 → 카운트다운 → 플레이 → 결과), 게임 루프, 입력, 설정, 기록을 연결한다.
// 로직은 고정 60Hz로 진행하고 화면은 모니터 주사율대로 그린다.
import { BTN, createGame } from "./core/engine.js";
import { createRenderer } from "./render/canvas.js";
import { accentEnabled } from "./render/gameplay-accents.js";
import { createKeyboard } from "./input/keyboard.js";
import { createTouch, touchVisible } from "./input/touch.js";
import { compilePadmap, createGamepad } from "./input/gamepad.js";
import { ACTIONS, compileKeymap, keyLabel } from "./input/keymap.js";
import { RANK_STEPS, isRankedRules, rankLabel, rankOf } from "./modes/ranks.js";
import { MAX_RULE_SLOTS, createRuleSlots } from "./storage/rule-slots.js";
import { ACHIEVEMENTS, createAchievements } from "./storage/achievements.js";
import { createAchievementsUI } from "./ui/achievements.js";
import { ENDLESS, MODES, RECORD_MODES, SURVIVAL_MILESTONES, findMode as findBaseMode } from "./modes/index.js";
import { dailyMode, dateKey, findDaily, recentDailyKeys } from "./modes/daily.js";
import { decodeReplayCode, encodeReplayCode, replayLink } from "./replay/share.js";
import { createDailyUI } from "./ui/daily.js";
import { createDailyPuzzleUI } from "./ui/daily-puzzle.js";
import { dailyPuzzleMode } from "./modes/daily-puzzle.js";
import { createDailyPuzzleProgress } from "./storage/daily-puzzle.js";
import { formatScore, formatTime, gravityLabel } from "./modes/format.js";
import { createStore } from "./storage/store.js";
import { runFingerprint } from "./storage/suspended-run.js";
import { loadSettings, sanitizeSettings, saveSettings, toEngineHandling } from "./storage/settings.js";
import { createRecords } from "./storage/records.js";
import { createSettingsUI } from "./ui/settings.js";
import { createRulesUI, noRuleChanges, ruleChanges } from "./ui/rules.js";
import { createAsk } from "./ui/ask.js";
import { button, menuRow, segmentButtons } from "./ui/components.js";
import { el } from "./ui/dom.js";
import { dropdown } from "./ui/select.js";
import { createRecordsUI } from "./ui/records.js";
import { createStatsUI } from "./ui/stats.js";
import { createPracticeUI } from "./ui/practice.js";
import { createExpeditionUI } from "./ui/expedition.js";
import { EXPEDITION_STAGES } from "./modes/expedition.js";
import { createExpeditionProgress } from "./storage/expedition-progress.js";
import { practiceMode } from "./modes/practice.js";
import { advanceSplits, analyzeSplits, formatDelta, splitDelta, tookSplitLead } from "./modes/splits.js";
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
import { recordKey } from "./storage/records.js";
import { MODERN, PRESETS, PRESET_LIST } from "./rules/presets.js";
import { makeCustomRules, sanitizeRuleBody } from "./rules/sanitize.js";
import { decodeRules } from "./rules/share.js";
import { createSfx } from "./audio/sfx.js";
import { DOWNSTACK_LESSONS } from "./modes/downstack.js";
import { BUILD_LESSONS } from "./modes/build-lessons.js";
import { BATTLE_LESSONS } from "./modes/battle-lessons.js";
import { GESTURE_LESSONS } from "./modes/gesture-lessons.js";
import { INTRO_LESSONS } from "./modes/intro-lessons.js";
import { createPracticeProgress } from "./storage/practice-progress.js";
import { SPRINT_HISTORY_KEY, createSprintHistory } from "./storage/sprint-history.js";
import { FINESSE_LESSONS } from "./modes/finesse-lessons.js";
import { createFinesseTracker } from "./modes/finesse.js";
import { createReplayPlayer } from "./app/replay-player.js";
import { createScenePractice } from "./app/scene-practice.js";
import { createRunSaver } from "./app/run-saver.js";
import { ROTATIONS } from "./rules/rotation/index.js";
import { STYLES, WIN, settleBattleFrame, versusMode, versusStatKey } from "./modes/versus.js";
import { createBot } from "./ai/bot.js";
import { createGestures } from "./input/gestures.js";
import { createUndo } from "./modes/undo.js";
import { createHelpUI } from "./ui/help.js";
import { PUZZLES, createPuzzleProgress, findPuzzle, puzzleMode } from "./modes/puzzles.js";
import { describeSteps } from "./modes/puzzle-hint.js";
import { createSolver, SOLVER_UNAVAILABLE } from "./app/solver.js";
import {
  CHECKED_AUTO,
  CHECKED_TRIED,
  customPuzzleMode,
  decodePuzzle,
  ruleSummary,
  searchOptions,
} from "./modes/custom-puzzle.js";
import { sceneToPuzzle } from "./modes/puzzle-edit.js";
import { createPuzzleEditor } from "./ui/puzzle-editor.js";
import { createCustomPuzzles } from "./storage/custom-puzzles.js";
import { createPuzzleUI } from "./ui/puzzles.js";
import { decodePack, packStageMode } from "./modes/puzzle-pack.js";
import { createPuzzlePacks, MAX_PACKS } from "./storage/puzzle-packs.js";
import { createPuzzlePacksUI } from "./ui/puzzle-packs.js";
import { createShareUI } from "./ui/share.js";
import { createVersusUI } from "./ui/versus.js";
import { lang, t, translateDom } from "./i18n/index.js";
import { createFeedback } from "./app/feedback.js";
import { createPuzzleReview, reconstructPuzzleReview, reviewReason } from "./app/puzzle-review.js";
import { showPuzzleReview } from "./ui/puzzle-review.js";
import { createPuzzleGoalHud } from "./app/puzzle-goal-hud.js";
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
const expeditionProgress = createExpeditionProgress(store);
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
let splitPulse;
/** 지금 쓸 효과음 묶음(테마 키): 고정했으면 그 테마의 소리, 아니면 게임 테마의 소리 */
const soundSetFor = (themeId = settings.visual.theme) => (settings.sound === "theme" ? themeId : settings.sound);
const sfx = createSfx({ getVolume: () => settings.volume, getSet: () => soundSetFor() });
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
/** 이어서 하기(js/app/run-saver.js): 기록·저장·되살리기. 판을 시작하고 진행하는 일은 아래 hooks가 맡는다 */
let restoredSteps = 0;
const runs = createRunSaver({
  store,
  findMode,
  lessons: [
    INTRO_LESSONS,
    GESTURE_LESSONS,
    BATTLE_LESSONS,
    BUILD_LESSONS,
    DOWNSTACK_LESSONS,
    FINESSE_LESSONS,
    EXPEDITION_STAGES,
  ],
  // ask는 아래에서 정의된다: 부를 때 찾는다
  ask: options => ask(options),
  saveInterval: SAVE_INTERVAL,
  live: {
    journalInfo: () => ({
      mode,
      rules,
      handling: settings.handling,
      name: runPlayerName,
      resultPbSplits,
      pbSplits,
      arsSpinFacing: rules.rotation === "ars" && rules.tspin === "threeCorner" && game?.legacyArsSpin === false,
    }),
    game: () => game,
    sceneEnded: () => Boolean(sceneView.current?.ended),
    fingerprint: () => runFingerprint(game, sceneView.current ? null : (versus?.cpu ?? race?.player.game)),
    paused: () => screen === "paused",
  },
  hooks: {
    canRestore: () => screen === "menu",
    /** 저장된 판과 같은 시드·규칙으로 판(또는 장면 연습)을 연다 */
    prepare(entry, m, handling) {
      restoredSteps = 0;
      if (entry.scene) {
        const source = sanitizeReplay(entry.scene.source, findMode);
        if (!source || source.mode !== m.id) throw new Error("scene");
        replayView.start(source, "menu", "", true);
        replayView.seek(entry.scene.returnFrame, true);
        const { split, target, rescue } = entry.scene;
        sceneView.enter(split, target, rescue, { ...entry, handling });
        if (!sceneView.current) throw new Error("scene");
      } else {
        const savedRules =
          m.puzzle || m.expedition != null || isGuidedPractice(m)
            ? m.rules
            : (PRESETS[entry.rules.id] ?? makeCustomRules(entry.rules));
        const replay = entry.target && sanitizeReplay(entry.target.replay, findMode);
        if (entry.target && (!replay || replay.mode !== m.id)) throw new Error("race");
        start(m, savedRules, replay ? { ...entry.target, replay } : null, entry.seed, { ...entry, handling });
      }
      countdownEl.hidden = false;
      countdownEl.dataset.phase = "ready";
      $("countdown-label").textContent = t("저장된 판을 불러오는 중…");
    },
    applyAction(kind, value) {
      if (kind === "handling") applyRunHandling(sanitizeSettings({ handling: value }).handling);
      if (kind === "undo" && !undo.undo(game.state)) throw new Error("undo");
      // 퍼즐의 첫 수 보기는 판을 바꾸지 않는 표시라 다시 할 것이 없다(연습의 힌트만 단계가 남는다)
      if (kind === "hint" && !mode.puzzle) applyLessonHint();
    },
    applyInput(held, pressed) {
      advanceRun(held, pressed, restoredSteps++);
      if (game.state.over || sceneView.current?.ended) throw new Error("finished");
    },
    adopted(m) {
      if (m.trialCode) puzzleEditor.load(m.trialCode);
    },
    failed() {
      if (sceneView.current) sceneView.exit();
      replayView.stop();
      toMenu();
      countdownEl.hidden = true;
      showMenuNotice(t("저장된 판을 이어서 할 수 없어요."));
    },
    /** 되살린 뒤: 화면 시계를 새로 맞추고 카운트다운부터 */
    restored() {
      if (race) updateRaceProgress();
      if (sceneView.current?.split) sceneView.updateSplitProgress(game.state);
      renderer.clearEffects();
      acc = 0;
      last = performance.now();
      countdown = COUNTDOWN_FRAMES[settings.access.countdown] ?? READY_FRAMES;
      countdownEl.hidden = !countdown;
      $("countdown-label").textContent = t("준비");
      setScreen(countdown ? "countdown" : "play");
      $("pause-game").focus({ preventScroll: true });
      runs.save();
    },
  },
});

// ---- 표시 도우미 ----

const menuNotice = $("menu-notice");
const menuNoticeAfter = menuNotice.nextElementSibling;
const linkNoticeHost = document.querySelector(".home-main");
const showMenuNotice = text => {
  if (menuNotice.hasAttribute("data-link-error")) {
    menuNotice.removeAttribute("data-link-error");
    menuNoticeAfter?.before(menuNotice);
  }
  menuNotice.textContent = text;
};
const showLinkError = text => {
  linkNoticeHost?.prepend(menuNotice);
  menuNotice.setAttribute("data-link-error", "");
  menuNotice.textContent = text;
  // 이미 열려 있던 페이지에서는 새로고침이 이전 스크롤 위치를 복원할 수 있다.
  const reveal = () =>
    requestAnimationFrame(() => {
      if (menuNotice.hasAttribute("data-link-error")) menuNotice.scrollIntoView({ block: "nearest" });
    });
  if (document.readyState === "complete") reveal();
  else window.addEventListener("pageshow", reveal, { once: true });
};
/** 데이터 작업(백업·리플레이 파일) 결과: 설정이 열려 있으면 설정의 알림 칸, 아니면 첫 화면 알림 줄 */
const notifyData = text => {
  if (settingsUI.isOpen) settingsUI.notify(text);
  else showMenuNotice(text);
};

const showPanel = name => {
  if (
    name === "pause" &&
    (sceneView.current?.split || sceneView.current?.target || sceneView.current?.rescue) &&
    sceneView.current.ended
  )
    name = "sceneResult";
  for (const [key, el] of Object.entries(panels)) el.hidden = key !== name;
  // 결과 화면은 버튼이 아니라 패널 자체에 포커스를 둔다: 하드 드롭(Space)을 연타하다 끝났을 때
  // 그 입력이 "다시 하기"를 눌러 결과를 건너뛰지 않게. 다시 하기·메뉴는 단축키(R·Esc)나 클릭으로.
  // 첫 화면은 toMenu가 포커스를 정한다(마지막 모드·이어서 하기, 대화상자를 닫으면 연 버튼). 여기서 첫 버튼에 두면
  // 맨 위로 옮긴 처음 안내의 "안내 보기"가 포커스를 가져간다(5차 검수 U60)
  const target =
    name === "results" || name === "sceneResult"
      ? panels[name]
      : name && name !== "menu"
        ? /** @type {HTMLElement | null} */ (panels[name].querySelector("button:not(:disabled)"))
        : null;
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
const renderKeyHelp = () => {
  keyHelp.render();
  const rotate180 = /** @type {HTMLButtonElement} */ (document.querySelector('[data-touch="R180"]'));
  rotate180.disabled = (game?.rules ?? currentRules()).allow180 === false;
};

/** 프리셋 한 줄 설명(첫 화면 규칙 카드) */
const RULE_DESCRIPTIONS = {
  modern: t("요즘 표준: SRS 회전, 7-Bag, 홀드·하드 드롭·고스트, 넥스트 5개, T-spin 점수."),
  retro: t("옛날 가정용 게임 느낌: 벽차기·홀드·하드 드롭·고스트 없음, 닿으면 바로 고정, 조작감 고정."),
  arcade: t("아케이드 느낌: ARS 회전, 최근 4개를 피하는 생성기, 생성·줄 삭제 지연, 미리 회전(IRS)."),
};

const rulesTrial = {
  ...ENDLESS,
  id: "rules-trial",
  name: t("규칙 시험 플레이"),
  description: t("Endless에서 지금 규칙을 시험해요. 기록은 남지 않아요."),
  practice: true,
  noReplay: true,
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
  const desc = $("rule-desc");
  desc.removeAttribute("title");
  if (ruleChoice !== "custom") {
    desc.textContent = RULE_DESCRIPTIONS[ruleChoice];
    return;
  }
  const changes = ruleChanges(customBody);
  if (!changes.length) {
    desc.textContent = noRuleChanges();
    return;
  }
  desc.title = changes.join(" · ");
  desc.replaceChildren(
    ...changes
      .slice(0, 2)
      .map((change, index) =>
        el(
          "span",
          { class: "rule-desc-line" },
          el("span", { text: change }),
          ...(index === 1 && changes.length > 2 ? [el("span", { text: t("외 {n}개", { n: changes.length - 2 }) })] : [])
        )
      )
  );
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
  const custom = ruleChoice === "custom";
  const gravity = gravityLabel(ruleSet.gravity, t);
  const gravitySetting = ruleSet.gravityMode === "fixed" ? gravity : t("모드별 중력");
  const active = t("규칙 · {name}", { name: ruleSet.name });
  $("active-rules").textContent = custom ? `${active} · ${gravitySetting}` : active;
  const list = $("mode-list");
  list.replaceChildren(
    ...MODES.map(m => {
      const best = records.best(m, ruleSet);
      const rank = rankOf(m, best, ruleSet);
      const appliedGravity = custom
        ? m.gravityFor && ruleSet.gravityMode !== "fixed"
          ? t("모드별 중력")
          : gravity
        : null;
      const row = menuRow({
        "data-mode": m.id,
        "aria-description": appliedGravity,
        title: m.name,
        desc: m.description,
        meta: best
          ? t("최고 기록 {record}", { record: m.formatRecord(best) }) + (rank ? ` · ${rankLabel(rank)}` : "")
          : "",
        onClick: () => start(m),
      });
      if (appliedGravity) row.title = appliedGravity;
      return row;
    }),
    menuRow({
      "data-mode": "expedition",
      title: t("규칙 원정"),
      desc: t("홀드·회전·쓰레기 규칙을 익히는 3개 챕터"),
      meta: t("{n} / {total}단계 완료", {
        n: Object.keys(expeditionProgress.read()).length,
        total: EXPEDITION_STAGES.length,
      }),
      onClick: () => expeditionUI.open(),
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
  onWatch: replay => replayView.start(replay, "menu", "", true),
  onRace: raceFromCode,
});
/**
 * 대화상자를 닫은 뒤 연 버튼으로 포커스를 돌려준다. close 이벤트는 조금 늦게 오므로,
 * 그 사이 사용자가 다른 조작으로 옮겨 갔으면(포커스가 body가 아니면) 빼앗지 않는다.
 * @param {Element | null} target
 */
const returnFocus = target => {
  const active = document.activeElement;
  if (!active || active === document.body || active === document.documentElement)
    /** @type {HTMLElement | null} */ (target)?.focus();
};

$("daily").addEventListener("close", () => {
  if (screen === "menu") returnFocus(document.querySelector('[data-mode="daily"]'));
});
const formatSurvivalGoal = frames => formatTime(frames).split(".")[0];

const puzzleReview = createPuzzleReview();
let failedPuzzleMove = null;
let reviewPractice = false;
const puzzleGoalHud = createPuzzleGoalHud($("puzzle-goal-hud"));
let lastHud;
const updateHud = () => {
  const frame = game?.state.frame ?? 0;
  if (lastHud?.game === game && lastHud.frame === frame && lastHud.mode === mode && lastHud.screen === screen) return;
  lastHud = { game, frame, mode, screen };
  puzzleGoalHud.update(
    game,
    screen === "menu" || screen === "replay" ? null : mode.puzzle,
    settings.visual.effects === "full"
  );
  if (sceneView.current?.split && game) sceneView.updateSplitProgress(game.state);
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
  setText(hud.split, formatSplitComparison(delta));
  const ahead = delta === null ? undefined : String(delta < 0);
  if (hud.split.dataset.ahead !== ahead) {
    if (ahead === undefined) delete hud.split.dataset.ahead;
    else hud.split.dataset.ahead = ahead;
  }
};

// ---- 화면 흐름 ----

/** @param {number | null} delta */
const formatSplitComparison = delta =>
  delta === null ? formatDelta(delta) : t("{delta}초", { delta: formatDelta(delta) });

const lessonHud = document.querySelector(".stage-side");
if (lessonHud) {
  new ResizeObserver(() => {
    if (screen !== "play" || !hasHintControls(mode)) return;
    const height = Math.ceil(lessonHud.getBoundingClientRect().height);
    document.body.style.setProperty("--lesson-hud-h", `${height}px`);
  }).observe(lessonHud);
}

const setScreen = next => {
  screen = next;
  document.body.dataset.screen = next;
  keyboard.setEnabled(next === "play" || next === "countdown");
  touch.setEnabled(next === "play" || next === "countdown");
  applyTouch();
  document.body.classList.toggle("is-practice", Boolean(mode.practice && !isGuidedPractice()) && next !== "menu");
  document.body.classList.toggle("is-expedition", mode.expedition != null && next !== "menu");
  document.body.classList.toggle("is-trial", Boolean(mode.trialCode) && next !== "menu");
  document.body.classList.toggle(
    "is-trial-failed",
    next === "results" && Boolean(mode.trialCode) && Boolean(game?.state.over) && game?.state.over !== "clear"
  );
  document.body.classList.toggle("has-lesson-hints", hasHintControls(mode) && next !== "menu");
  document.body.classList.toggle("is-finesse-lesson", Boolean(mode.lesson) && next !== "menu");
  // 기록이 남는 판(기본 모드·오늘의 도전·CPU 대전): 일시정지 중에는 보드와 다음 피스를 가린다(css/game.css, 5차 검수 G4)
  document.body.classList.toggle("is-ranked", next !== "menu" && playCounts());
  const title = mode.versus ? versusTitle(mode.versus) : mode.name;
  const modeTitle = reviewPractice ? t("마지막 수 연습 · {name}", { name: title }) : title;
  $("session-title").textContent = next === "menu" ? "" : sceneView.current ? sceneView.title() : modeTitle;
  $("session-title").classList.remove("is-secret");
  $("mode-objective").textContent = next === "menu" || next === "replay" ? "" : modeObjective(mode);
};

const puzzleInstructions = {
  pc: "주어진 피스로 판 비우기",
  quad: "우물을 남기고 채운 뒤 마지막 I로 4줄 지우기",
  tuck: "소프트 드롭으로 내린 뒤 처마 아래로 밀어 넣어 2줄 지우기",
  combo: "피스마다 한 줄 이상 지워 콤보 끊지 않기",
  spin: "틈 근처까지 내린 뒤 돌려 끼워 넣어 2줄 지우기",
  mini: "T를 마지막에 돌려 넣어 T-spin Mini로 줄 지우기",
};

function modeObjective(m) {
  if (m.expedition != null) return `${m.description} ${t("추가 목표 · {goal}", { goal: m.bonus })}`;
  if (m.dailyPuzzle || m.practice) return m.description;
  if (m.puzzle?.custom) return customPuzzleDetails(m.puzzle.custom);
  if (!m.puzzle) return "";
  const instruction = puzzleInstructions[m.puzzle.kind];
  return instruction ? t(instruction) : t("T 하나로 {kind} 만들기", { kind: m.description });
}

/** @param {import("./modes/custom-puzzle.js").FullPuzzle} p */
function customPuzzleDetails(p) {
  const summary = ruleSummary(p);
  const checked =
    p.checked & CHECKED_TRIED
      ? t("만든 사람이 직접 풀어 봤어요")
      : p.checked & CHECKED_AUTO
        ? t("자동 확인으로 풀 수 있는 퍼즐")
        : "";
  return [summary, checked, p.desc].filter(Boolean).join(" · ");
}

/** @param {boolean} [initial] 처음 열 때 @param {boolean} [keepFocus] 포커스는 옮기지 않는다(대화상자를 닫고 다시 그릴 때) */
const toMenu = (initial = false, keepFocus = false) => {
  confirming = null;
  reviewPractice = false;
  game = null;
  race = null;
  racePanel.hidden = true;
  versus = null;
  versusPanel.hidden = true;
  document.body.classList.remove("is-versus");
  setScreen("menu");
  countdownEl.hidden = true;
  renderMenu();
  runs.renderContinue();
  /** @type {HTMLButtonElement} */ ($("watch-last")).disabled = !replays.last();
  showPanel("menu");
  // 이어 할 판이 있으면 Enter로 복원하고, 없으면 마지막 모드에 포커스를 둔다.
  const defaultMode = /** @type {HTMLElement | null} */ (panels.menu.querySelector(`[data-mode="${mode.id}"]`));
  // 처음 열 때는 포커스만 두고(Enter로 바로 시작) 테두리는 그리지 않는다 — "골라 둔 모드"처럼 보이지 않게.
  // 게임에서 돌아올 때는 키보드로 오가는 중일 수 있으니 브라우저가 정한 대로 보인다.
  if (!keepFocus)
    (runs.button.hidden ? defaultMode : runs.button)?.focus(
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
  restored = null,
  confirmed = false
) => {
  if (runs.restoring) {
    if (!restored) return;
  } else if (m !== rulesTrial && !confirmed && runs.replacesSaved()) {
    runs.confirmReplace(() => start(m, selectedRules, target, retrySeed, restored, true));
    return;
  }
  confirming = null;
  if (screen === "replay") replayView.stop();
  mode = m;
  puzzleReview.reset();
  failedPuzzleMove = null;
  reviewPractice = false;
  if (!runs.restoring && !m.practice && m.expedition == null && m.id !== "custom-puzzle") store.set("lastMode", m.id);
  rules = selectedRules;
  runPlayerName = restored?.name ?? records.playerName;
  const seed = target?.replay.seed ?? retrySeed ?? m.fixedSeed ?? (Math.random() * 2 ** 32) >>> 0;
  $("race-label").textContent = target?.friend ? t("{name}의 기록", { name: target.friend }) : t("내 최고 기록");
  race = target ? { target, player: createPlayer(target.replay, findMode) } : null;
  racePanel.hidden = !race;
  const legacyArsSpin = Boolean(restored && restored.arsSpinFacing !== true);
  game = createGame({
    rules,
    handling: toEngineHandling(restored?.handling ?? settings.handling),
    seed,
    mode: m,
    legacyArsSpin,
  });
  updateRaceProgress();
  // 대전: CPU도 같은 시드(같은 블록 순서)로 시작한다. 상대와 함께라야 재현되므로 리플레이는 남기지 않는다.
  if (m.versus) {
    const cpu = createGame({ rules, seed, mode: m, legacyArsSpin });
    versus = {
      cpu,
      bot: createBot({ game: cpu, rotation: ROTATIONS[rules.rotation], level: m.versus, seed }),
      recorder: createRecorder({ seed, mode: m, rules, handling: cpu.handling, legacyArsSpin }),
    };
    $("versus-name").textContent = versusTitle(m.versus);
  } else versus = null;
  versusPanel.hidden = !versus;
  document.body.classList.toggle("is-versus", Boolean(versus));
  recorder = m.noReplay ? null : createRecorder({ seed, mode: m, rules, handling: game.handling, legacyArsSpin });
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
  if (hasHintControls(m)) resetLessonHint();
  updateBackLabels();
  goTimer = 0;
  undo.reset();
  showPanel(null);
  fb.clearAction();
  renderer.clearEffects();
  splitPulse?.cancel();
  renderKeyHelp();
  setScreen("countdown");
  window.scrollTo(0, 0);
  countdownEl.hidden = false;
  countdownEl.dataset.phase = "ready";
  $("countdown-label").textContent = t("준비");
  // 카운트다운 "없음": 바로 시작
  if (runs.restoring) return;
  if (m !== rulesTrial) {
    runs.begin(seed, target);
    runs.save();
  }
  if (countdown <= 0) {
    countdownEl.hidden = true;
    setScreen("play");
    sfx.play("go");
  } else sfx.play("ready");
  say(t("{mode} 시작", { mode: mode.name }));
};

let pausedFrom = /** @type {"play" | "countdown"} */ ("play");

const pause = () => {
  if (runs.restoring) return;
  if (screen !== "play" && screen !== "countdown") return;
  pausedFrom = screen;
  setScreen("paused");
  showPanel("pause");
  $("resume-save-status").textContent = "";
  runs.save();
};

$("pause-game").addEventListener("click", pause);

const resume = () => {
  if (screen !== "paused" || sceneView.current?.ended) return;
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

/**
 * 판을 마치거나 그만둘 때 돌아갈 목록: 퍼즐·연습이면 그 목록(방금 한 단계에 포커스), 아니면 null(첫 화면).
 * 목록은 첫 화면 위에 열리므로, 목록을 닫으면 그대로 첫 화면이다.
 */
const backList = () => {
  if (mode.expedition != null) {
    const id = mode.id;
    return { label: t("규칙 원정 목록"), open: () => expeditionUI.open(id) };
  }
  if (sceneView.current) return null;
  if (mode === rulesTrial) return { label: t("규칙 편집"), open: rulesUI.returnFromTrial };
  if (mode.dailyPuzzle) {
    const { key } = mode.dailyPuzzle;
    return { label: t("오늘의 퍼즐"), open: () => dailyPuzzleUI.open(key) };
  }
  if (mode.packStage) {
    const { code, index } = mode.packStage;
    return { label: t("퍼즐 팩"), open: () => puzzlePacksUI.details(code, index) };
  }
  const number = mode.puzzle?.number;
  if (number) return { label: t("퍼즐 목록"), open: () => puzzleUI.open(number) };
  // 만든 퍼즐: 시험 플레이·내 퍼즐이면 내 퍼즐 목록, 받은 퍼즐이면 받은 퍼즐 목록
  if (mode.puzzle?.custom)
    return {
      label: t("퍼즐 목록"),
      open: () => puzzleUI.open(undefined, mode.trialCode || customs.findByCode(mode.puzzleCode) ? "mine" : "received"),
    };
  const group = mode.gestureLesson
    ? "gesture-training"
    : mode.intro
      ? "intro"
      : mode.lesson
        ? "finesse-lesson"
        : mode.downstack
          ? "downstack"
          : mode.buildLesson
            ? "build-training"
            : mode.battleLesson
              ? "battle-training"
              : null;
  const stageId = mode.id;
  if (group) return { label: t("연습 목록"), open: () => practiceUI.open(group, stageId) };
  if (mode.practice) return { label: t("연습 목록"), open: () => practiceUI.open(stageId.replace(/^practice-/, "")) };
  return null;
};

/** 결과·일시정지의 "첫 화면" 단추: 퍼즐·연습이면 "퍼즐 목록"·"연습 목록" */
const updateBackLabels = () => {
  const back = backList();
  /** @type {HTMLElement} */ (panels.results.querySelector('[data-action="menu"] .btn-label')).textContent =
    back?.label ?? t("첫 화면");
  if (!sceneView.current)
    /** @type {HTMLElement} */ (panels.pause.querySelector('[data-action="menu"] .btn-label')).textContent = back
      ? t("{list}으로", { list: back.label })
      : t("첫 화면으로");
};

/** 첫 화면으로 — 퍼즐·연습이면 그 목록을 위에 연다 */
const leaveToMenu = () => {
  const back = backList();
  if (mode === rulesTrial) mode = findMode(store.get("lastMode", null));
  toMenu(false, Boolean(back));
  // Esc로 왔으면 같은 키 입력이 방금 연 목록을 바로 닫는다(대화상자의 Esc 닫기) → 키 처리가 끝난 뒤에 연다
  if (back) setTimeout(back.open, 0);
};

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
  const back = backList();
  $("confirm-title").textContent = restart
    ? t("다시 시작할까요?")
    : back
      ? t("{list}으로 갈까요?", { list: back.label })
      : t("첫 화면으로 갈까요?");
  const ok = /** @type {HTMLElement} */ (panels.confirm.querySelector('[data-confirm="ok"]'));
  /** @type {HTMLElement} */ (ok.querySelector(".confirm-ok-icon")).replaceChildren(icon(restart ? "restart" : "menu"));
  /** @type {HTMLElement} */ (ok.querySelector(".confirm-ok-text")).textContent = restart
    ? t("다시 시작")
    : back
      ? t("{list}으로", { list: back.label })
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

/** 업적을 셀 수 있는 판: 메뉴의 실제 모드·오늘의 도전·CPU 대전(연습·퍼즐·장면 연습 제외) */
const playCounts = () => !sceneView.current && (MODES.includes(mode) || Boolean(mode.daily) || Boolean(mode.versus));

/** 업적 판정에 넘길 이번 판 정보 */
const achievementContext = (state, abandoned = false) => ({
  mode,
  state,
  // Custom 규칙 판은 플레이 업적(첫 줄·4줄 등)만 센다. 모드 업적·누적은 기본 규칙 판만(기록 비교) — 2차 평가 F22
  real: playCounts() && isRankedRules(rules),
  played: playCounts(),
  won: Boolean(mode.versus) && state.over === WIN,
  short: isShortGame(state),
  abandoned,
  puzzlesCleared: puzzleProgress.cleared(),
  puzzles: PUZZLES,
});

/**
 * 판을 중간에 그만둘 때(첫 화면으로·다시 하기): 그때까지 이룬 플레이 업적(첫 줄·4줄 등)은 남긴다.
 * 예전에는 끝까지 가야만 판정해서, 줄을 지우고 나가면 업적이 안 쌓였다. 누적 합계에는 더하지 않는다.
 */
const keepAbandonedAchievements = () => {
  if (!game || game.state.over || !playCounts()) return [];
  return achievements.evaluate(achievementContext(game.state, true));
};

const acceptConfirm = () => {
  const kind = confirming;
  if (!kind) return;
  confirming = null;
  const kept = keepAbandonedAchievements();
  if (kind === "restart") start(mode, rules, race?.target);
  else {
    runs.clear();
    if (sceneView.current) {
      sceneView.exit();
      replayView.stop();
    }
    leaveToMenu();
    if (kept.length) showMenuNotice(t("업적 달성 · {names}", { names: kept.map(a => a.name).join(", ") }));
  }
};

for (const btn of panels.confirm.querySelectorAll("[data-confirm]")) {
  btn.addEventListener("click", () => (btn.getAttribute("data-confirm") === "ok" ? acceptConfirm() : cancelConfirm()));
}

/**
 * 첫 화면에서 로고를 3초 안에 일곱 번(피스 일곱 종류) 누르면 숨은 테마가 열리고 그 테마로 바뀐다.
 * 이미 열렸으면 테마만 다시 바꿔 준다. 여섯 번까지는 아무 반응이 없다.
 */
let logoTapTimes = /** @type {number[]} */ ([]);
let secretTimer = 0;
const logoTaps = () => {
  const now = performance.now();
  logoTapTimes = [...logoTapTimes.filter(time => now - time < 3000), now];
  if (logoTapTimes.length < 7) return;
  logoTapTimes = [];
  const fresh = achievements.unlock("secret-sharp");
  settings = sanitizeSettings({ ...settings, visual: { ...settings.visual, theme: "sharp" } });
  saveSettings(store, settings);
  renderAchievementProgress();
  const message = fresh ? t("무언가 열렸어요") : t("샤프");
  // 화면 읽기용 알림 줄(첫 화면 아래)과 함께, 휴대폰에서도 바로 보이게 머리글에서 반응한다:
  // 로고 T가 한 바퀴 돌고 '#'이 강조색으로, 머리글 가운데에 한 줄, 진동(켜 둔 경우)
  showMenuNotice(message);
  const logo = $("go-home");
  const title = $("session-title");
  logo.classList.remove("is-found");
  void logo.offsetWidth; // 다시 찾았을 때도 애니메이션이 처음부터
  logo.classList.add("is-found");
  title.textContent = message;
  title.classList.add("is-secret");
  clearTimeout(secretTimer);
  secretTimer = setTimeout(() => {
    logo.classList.remove("is-found");
    title.classList.remove("is-secret");
    if (screen === "menu") title.textContent = "";
  }, 3000);
  if (settings.access.vibrate === "on") navigator.vibrate?.([20, 40, 20, 40, 60]);
  sfx.play("clear2");
};

/** 대화상자가 하나라도 열려 있으면 게임·메뉴 단축키는 그 대화상자에 맡긴다 */
const anyDialogOpen = () =>
  [
    settingsUI,
    rulesUI,
    recordsUI,
    statsUI,
    practiceUI,
    versusUI,
    dailyUI,
    dailyPuzzleUI,
    achievementsUI,
    helpUI,
    puzzleUI,
    shareUI,
  ].some(ui => ui.isOpen) ||
  puzzleReviewDialog.open ||
  askDialog.open;

/** 로고: 첫 화면으로. 게임 중이면 먼저 묻는다 */
$("go-home").addEventListener("click", () => {
  if (anyDialogOpen()) return;
  if (screen === "menu") {
    logoTaps();
    return window.scrollTo(0, 0);
  }
  if (sceneView.current) sceneView.exit();
  if (mode === rulesTrial) return leaveToMenu();
  if (inProgress()) return askConfirm("menu");
  if (screen === "replay") replayView.stop();
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
  // 퍼즐은 원래 피스 몇 개로 금방 끝난다 → "너무 일찍 끝난 판"이 아니다(4차 평가 F37)
  if (mode.puzzle) return false;
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
              replayView.start(replay, "results", "", true);
              replayView.seek(startFrame, true);
            },
          })
        );
      } else segment.textContent = label;
      const priorDelta = index === 0 ? 0 : rows[index - 1].delta;
      row.insertCell().textContent = formatTime(frames - startFrame);
      row.insertCell().textContent = formatSplitComparison(
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
      target = replayView.analyze(replay).finesseScene;
    }
    if (slowest || target) {
      practice.hidden = false;
      practice.querySelector(".btn-label").textContent = slowest
        ? t("추천 연습 · {from}–{to}줄", slowest)
        : t("추천 연습 · {piece} 피네스", { piece: target.piece });
      practice.onclick = () => {
        replayView.start(replay, "results", "", true);
        if (target) {
          replayView.seek(target.spawnFrame, true);
          sceneView.enter(null, target);
          return;
        }
        const index = mode.splits.indexOf(slowest.to);
        const endFrame = splits[index];
        replayView.seek(splits[index - 1] ?? 0, true);
        // 구간 경계에 등장 대기가 있으면 다음 피스를 먼저 보여 준다.
        if (replayView.player && !replayView.player.game.state.active) {
          while (!replayView.player.done && !replayView.player.game.state.active) replayView.player.step();
          replayView.updateBar();
        }
        sceneView.enter({ from: slowest.from, to: slowest.to, endFrame });
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
        t("같은 순서로 다시 하기")
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

/** 결과 표: [이름, 값] 줄들을 dt·dd로 @param {ReadonlyArray<ReadonlyArray<string>>} rows */
const renderResultStats = rows =>
  $("results-stats").replaceChildren(...rows.flatMap(([k, v]) => [el("dt", { text: k }), el("dd", { text: v })]));

const finish = () => {
  if (!game) return;
  if (mode === rulesTrial) return leaveToMenu();
  const state = game.state;
  failedPuzzleMove = mode.puzzle ? puzzleReview.failed(state, runs.journal?.entry) : null;
  runs.clear();
  setScreen("results");
  countdownEl.hidden = true;
  if (mode.id === "sprint40" && state.stats.pieces > 0)
    sprintHistory.add(rules.id, state.frame, state.over === "clear");
  if (state.over === "clear" && isGuidedPractice()) {
    practiceProgress.mark(mode.id, lessonHintState(state)?.usedHint);
  }

  if (state.over === "clear" && mode.expedition != null) {
    expeditionProgress.mark(mode.id, mode.earnsBonus(state));
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
  if (!reviewPractice && mode.puzzle?.number && state.over === "clear") puzzleProgress.markCleared(mode.puzzle.id);
  if (!reviewPractice && mode.dailyPuzzle && state.over === "clear") dailyPuzzleProgress.mark(mode.dailyPuzzle.key);
  const packStage = mode.packStage;
  const packSaved =
    !packStage || reviewPractice || state.over !== "clear" || puzzlePacks.markCleared(packStage.code, packStage.index);
  if (!reviewPractice && mode.trialCode && state.over === "clear") puzzleEditor.markCleared(mode.trialCode);
  // 받은 퍼즐: 풀었는지·가장 빠른 시간·첫 수 보기를 썼는지
  if (!reviewPractice && mode.puzzleCode && !mode.trialCode && !mode.dailyPuzzle && !mode.packStage)
    customs.recordReceived(mode.puzzleCode, {
      solved: state.over === "clear",
      hinted: Boolean(state.puzzle?.hinted),
      frames: state.frame,
    });
  // 업적: 이번 판에 처음 이룬 것(플레이 업적은 실제 모드·오늘의 도전·CPU 대전에서만)
  const freshAchievements = achievements.evaluate(achievementContext(state));
  // Custom 규칙 판은 업적이 쌓이지 않는다 → 결과에서 그렇다고 알려 준다(말없이 안 쌓여 고장처럼 보였다)
  $("results-achievements").textContent = freshAchievements.length
    ? t("업적 달성 · {names}", { names: freshAchievements.map(a => a.name).join(", ") })
    : playCounts() && !isRankedRules(rules)
      ? t("Custom 규칙 판은 플레이 업적만 쌓여요")
      : "";
  const nextPuzzle = /** @type {HTMLButtonElement} */ (panels.results.querySelector('[data-action="next-puzzle"]'));
  const hasNext = nextStage() || (mode.puzzle?.number && mode.puzzle.number < PUZZLES.length);
  nextPuzzle.hidden = reviewPractice || !(hasNext && state.over === "clear");
  lastReplay = recorder ? recorder.finish(state) : null;
  const survivalRetry = $("survival-retry-seed");
  survivalRetry.hidden = !survival || !lastReplay;
  const rescueButton = $("survival-rescue");
  rescueButton.hidden = !survival || !lastReplay || !state.stats.pieces;
  if (lastReplay && versus) lastReplay.cpu = versus.recorder.finish(versus.cpu.state);
  const watchButton = /** @type {HTMLButtonElement} */ ($("results-watch"));
  watchButton.disabled = !lastReplay && !failedPuzzleMove;
  watchButton.querySelector(".btn-label").textContent = failedPuzzleMove ? t("복기") : t("다시 보기");
  watchButton.title = failedPuzzleMove ? t("마지막 수 다시 보기") : "";
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
  $("results-main").textContent = reviewPractice ? t("마지막 수 연습") : summary.main;
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
    tooShort && !mode.trialCode && !mode.packStage && mode.expedition == null
      ? t("너무 일찍 끝난 판이라 공유하지 않고 마지막 판으로 남기지 않아요")
      : "";
  const pack = packStage && puzzlePacks.find(packStage.code);
  const packNote = !packSaved
    ? t("퍼즐 팩을 저장하지 못했어요.")
    : pack
      ? t("{n} / {total}단계 완료", { n: pack.cleared.length, total: pack.pack.puzzles.length })
      : "";
  $("race-result").textContent = [resultNote, packNote, shortNote].filter(Boolean).join(" · ");
  if (survival || mode.battleLesson) say(`${summary.title} ${summary.main}. ${resultNote}`);

  const seconds = state.frame / 60;
  if (mode.versus && versus) {
    const g = state.garbage;
    const cg = versus.cpu.state.garbage;
    const vrows = [
      [t("시간"), formatTime(state.frame)],
      [t("줄"), String(state.stats.lines)],
      [t("피스"), String(state.stats.pieces)],
      [t("초당 피스"), tooShort ? "—" : seconds ? (state.stats.pieces / seconds).toFixed(2) : "0.00"],
      [t("보낸 줄"), String(g.sent)],
      [t("막은 쓰레기"), String(g.blocked)],
      [t("받은 쓰레기"), String(g.received)],
      [t("CPU가 보낸 줄"), String(cg.sent)],
    ];
    const s = versusStats()[versusStatKey(mode.versus.id, mode.versus.style)];
    vrows.push([t("전적"), s ? t("{win}승 {loss}패", { win: s.win, loss: s.loss }) : "—"]);
    renderResultStats(vrows);
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
    [t("초당 피스"), tooShort ? "—" : seconds ? (state.stats.pieces / seconds).toFixed(2) : "0.00"],
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
    if (delta !== null) rows.push([t("최고 기록 대비"), formatSplitComparison(delta)]);
    if (state.over === "clear") rows.splice(0, 1);
  }
  if (mode.battleLesson) {
    rows.splice(0, rows.length, [t("받은 쓰레기"), String(state.garbage.received)]);
  }
  // 퍼즐: 점수·레벨·최고 기록·순위는 뜻이 없다 → 쓴 피스, 지운 줄, 깬 단계(4차 평가 F37)
  if (mode.puzzle) {
    rows.splice(
      0,
      rows.length,
      [t("시간"), formatTime(state.frame)],
      [t("쓴 피스"), `${state.stats.pieces} / ${mode.puzzle.pieces.length}`],
      [t("줄"), String(state.stats.lines)],
      mode.dailyPuzzle
        ? [t("날짜"), mode.dailyPuzzle.key]
        : [t("깬 단계"), mode.puzzle.number ? `${puzzleProgress.cleared().size} / ${PUZZLES.length}` : "—"]
    );
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
  renderResultStats(rows);
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
    if (!accentEnabled(settings.visual, "record")) splitPulse?.cancel();
    sfx.setVolume();
    saveSettings(store, settings);
    bindings = compileKeymap(settings.keymap);
    padBindings = compilePadmap(settings.padmap);
    applyTouch();
    applyScheme();
    if (game && screen !== "replay") {
      applyRunHandling(settings.handling);
      runs.journal?.action("handling", settings.handling);
      runs.save();
    }
    renderKeyHelp();
  },
  onPreviewSound: () => sfx.play("clear2"),
  onPreviewTheme: themeId => sfx.preview(soundSetFor(themeId), settings.volume),
  openedThemes: () => (achievements.unlocked()["secret-sharp"] ? ["sharp"] : []),
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
    // 첫 화면은 다시 그리되(언어·화면 색 등), 포커스는 연 버튼(머리글 설정)으로 돌려준다
    if (screen === "menu") {
      toMenu(false, true);
      returnFocus($("open-settings"));
    } else if (screen === "paused") showPanel("pause");
    else if (screen === "results") showPanel("results");
  },
});

/** 앱 안 확인 대화상자(브라우저 확인창 대신) */
const askDialog = /** @type {HTMLDialogElement} */ ($("ask"));
const ask = createAsk(askDialog);

const previewRuleImport = body => {
  const changes = ruleChanges(body);
  return ask({
    title: t("받은 규칙 미리보기"),
    message: changes.length ? t("Modern 기본값과 다른 설정") : noRuleChanges(),
    details: changes,
    okLabel: t("내 규칙에 저장"),
    okIcon: "folder",
  });
};

const rulesUI = createRulesUI({
  dialog: /** @type {HTMLDialogElement} */ ($("rules-editor")),
  getRules: () => customBody,
  onChange: body => {
    ruleSlots.update(body);
    customBody = ruleSlots.active().body;
  },
  // 편집기의 내 규칙 줄(이름·새 규칙·지우기)과 받은 코드: 바꾼 뒤 지금 고른 규칙을 다시 읽는다
  slots: {
    ...ruleSlots,
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
    renderKeyHelp();
    /** @type {HTMLElement | null} */ ($("edit-rules"))?.focus();
  },
  onTrial: () => start(rulesTrial, makeCustomRules(customBody)),
  previewImport: previewRuleImport,
});

$("active-rules").addEventListener("click", e => {
  e.preventDefault();
  /** @type {HTMLElement | null} */ ($("rule-tabs").querySelector('[aria-pressed="true"]'))?.focus();
});
$("edit-rules").addEventListener("click", () => rulesUI.open());

const hasLessonHints = m => Boolean(m.downstack || m.buildLesson);
/** 힌트 단추를 보이는 판: 파내기·빌드 연습, 퍼즐(첫 수 보기) */
const hasHintControls = m => hasLessonHints(m) || Boolean(m.puzzle);
const lessonHintState = state => state.downstack ?? state.buildLesson;
const isGuidedPractice = (m = mode) => m.lesson || hasLessonHints(m) || m.intro || m.battleLesson || m.gestureLesson;
const nextPracticeLesson = () =>
  mode.gestureLesson
    ? GESTURE_LESSONS[mode.gestureLesson]
    : mode.buildLesson
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
const nextStage = () => {
  if (mode.packStage) return packStageMode(mode.packStage.code, mode.packStage.index + 1);
  return mode.expedition != null ? EXPEDITION_STAGES[mode.expedition + 1] : nextPracticeLesson();
};
const downstackHint = $("downstack-hint");
// 이름만 바꾼다(단추 안의 단축키 표시는 그대로)
const hintLabel = /** @type {HTMLElement} */ (downstackHint.querySelector(".btn-label"));
const resetLessonHint = () => {
  cancelPuzzleHint();
  // "규칙대로" 떨어지는 만든 퍼즐은 손 빠르기에 따라 달라 첫 수를 찾을 수 없다(자리는 남기고 끈다)
  /** @type {HTMLButtonElement} */ (downstackHint).disabled = mode.puzzle?.gravity === "rules";
  hintLabel.textContent = mode.puzzle ? t("첫 수 보기") : t("힌트");
  $("downstack-status").textContent = "";
  if (game?.state.puzzle) game.state.puzzle.hintCells = [];
};

/**
 * 퍼즐 첫 수 보기: 지금 피스를 놓을 자리(점선 칸)와 누를 순서. 한 번 더 누르면 숨긴다.
 * 지금 판에서 더 풀 수 없으면(이미 다른 자리에 놓았으면) 다시 하라고 알려 준다.
 */
/** 퍼즐 풀이 탐색(첫 수 보기·퍼즐 만들기의 자동 확인)을 화면 밖에서 */
const solver = createSolver();
/** 찾는 중인 첫 수 탐색(Worker). 판이 바뀌거나 다시 누르면 취소한다 */
let puzzleHintSearch = /** @type {null | { cancel: () => void }} */ (null);
const cancelPuzzleHint = () => {
  puzzleHintSearch?.cancel();
  puzzleHintSearch = null;
};
const togglePuzzleHint = () => {
  const p = game.state.puzzle;
  if (p.hintCells?.length || puzzleHintSearch) return resetLessonHint();
  const { active, hold, holdUsed } = game.state;
  // 아직 나오지 않은 목록 피스: 지금까지 목록에서 나온 피스 = 놓은 것 + 움직이는 것 + 홀드 칸 - 처음 홀드 피스
  const drawn = p.placed + 1 + (hold ? 1 : 0) - (mode.puzzle.holdStart ? 1 : 0);
  const rest = mode.puzzle.pieces.slice(drawn);
  const asked = { game, placed: p.placed, active: { ...active }, hold };
  const search = solver.run({
    type: "first",
    kind: mode.puzzle.kind,
    count: p.need,
    lines: mode.puzzle.lines ?? 0,
    rotation: rules.rotation,
    board: game.state.board.cells.slice(),
    active: asked.active,
    combo: p.combo,
    total: p.lines ?? 0,
    hold,
    holdUsed,
    rest,
    opts: { ...(mode.puzzle.custom ? searchOptions(mode.puzzle.custom) : {}), legacyArsSpin: game.legacyArsSpin },
  });
  puzzleHintSearch = search;
  $("downstack-status").textContent = t("첫 수를 찾는 중…");
  hintLabel.textContent = t("찾기 멈추기");
  search.promise.then(move => {
    if (puzzleHintSearch !== search) return;
    puzzleHintSearch = null;
    const now = game?.state.active;
    // 찾는 사이에 피스를 움직였거나 놓았으면 그 판의 답이 아니다
    const same =
      game === asked.game &&
      game.state.puzzle?.placed === asked.placed &&
      now?.x === asked.active.x &&
      now?.y === asked.active.y &&
      now?.rot === asked.active.rot &&
      now?.type === asked.active.type &&
      now?.lastAction === asked.active.lastAction &&
      now?.kick === asked.active.kick &&
      now?.spinMoved === asked.active.spinMoved &&
      game.state.hold === asked.hold;
    if (move === undefined || !same) return resetLessonHint();
    hintLabel.textContent = t("첫 수 보기");
    if (move === SOLVER_UNAVAILABLE) {
      $("downstack-status").textContent = t("백그라운드 풀이기를 열 수 없어요. 잠시 후 다시 시도해 주세요.");
      return;
    }
    if (!move) {
      $("downstack-status").textContent = t("이 판에서는 더 풀 수 없어요. 다시 시작해 보세요");
      return;
    }
    if ("exhausted" in move) {
      $("downstack-status").textContent = t("피스가 많아 첫 수를 다 찾아보지 못했어요");
      return;
    }
    if (!("cells" in move)) return;
    game.state.puzzle.hintCells = move.cells;
    game.state.puzzle.hinted = true;
    const spinLast = ["mini", "tsd", "tst"].includes(mode.puzzle.kind);
    const steps = describeSteps(move.steps, spinLast);
    $("downstack-status").textContent = move.hold
      ? t("첫 수 · 홀드한 뒤 {steps}", { steps })
      : t("첫 수 · {steps}", { steps });
    hintLabel.textContent = t("힌트 숨기기");
  });
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
  hintLabel.textContent = t(["힌트", "자리 힌트", "힌트 숨기기"][lessonHintState(game.state).hintLevel]);
};
downstackHint.addEventListener("click", event => {
  if (!hasHintControls(mode) || screen !== "play" || !game?.state.active) return;
  if (mode.puzzle) togglePuzzleHint();
  else applyLessonHint();
  runs.journal?.action("hint");
  if (event.detail > 0) downstackHint.blur();
});
downstackRetry.addEventListener("click", () => {
  if (hasHintControls(mode) && screen === "play") start(mode, rules);
});

const practiceUI = createPracticeUI({
  dialog: /** @type {HTMLDialogElement} */ ($("practice")),
  onPick: drill => start(practiceMode(drill)),
  progress: practiceProgress,
  onStage: lesson => start(lesson, lesson.rules),
  isTouch: () => isTouchScreen(),
});
$("open-practice").addEventListener("click", () => practiceUI.open());

const expeditionUI = createExpeditionUI({
  dialog: /** @type {HTMLDialogElement} */ ($("expedition")),
  progress: expeditionProgress,
  onStage: stage => start(stage, stage.rules),
});
$("expedition").addEventListener("close", () => {
  if (screen === "menu") returnFocus(document.querySelector('[data-mode="expedition"]'));
});

// ---- 퍼즐 ----
const puzzleProgress = createPuzzleProgress(store);
const dailyPuzzleProgress = createDailyPuzzleProgress(store);
const dailyPuzzleDialog = /** @type {HTMLDialogElement} */ ($("daily-puzzle"));
const dailyPuzzleUI = createDailyPuzzleUI({
  dialog: dailyPuzzleDialog,
  solver,
  progress: dailyPuzzleProgress,
  getVisual: () => settings.visual,
  onPlay: day => {
    const m = dailyPuzzleMode(day.code, day);
    if (m) start(m, m.rules);
  },
});
/** @param {HTMLDialogElement} dialog @param {string[]} ids @param {() => void} open */
const bindPuzzleOpeners = (dialog, ids, open) => {
  const openers = ids.map(id => $(id));
  let opener = openers[0];
  for (const button of openers) {
    button.addEventListener("click", () => {
      opener = button;
      open();
    });
  }
  dialog.addEventListener("close", () => {
    if (!dialog.open && screen === "menu") returnFocus(opener.getClientRects().length ? opener : openers[0]);
  });
};
bindPuzzleOpeners(dailyPuzzleDialog, ["open-daily-puzzle", "quick-daily-puzzle"], () => dailyPuzzleUI.open());

const puzzleDialog = /** @type {HTMLDialogElement} */ ($("puzzles"));
const playCustomPuzzle = (code, trial = false) => {
  const puzzle = decodePuzzle(code);
  if (!puzzle) {
    showLinkError(t("링크의 퍼즐을 읽을 수 없었어요."));
    return;
  }
  const custom = customPuzzleMode(puzzle);
  start({ ...custom, puzzleCode: code, trialCode: trial ? code : null }, custom.rules);
};
/** 내 퍼즐·받은 퍼즐(이 기기) */
const customs = createCustomPuzzles(store);
const puzzlePacks = createPuzzlePacks(store);
const puzzlePacksDialog = /** @type {HTMLDialogElement} */ ($("puzzle-packs"));
const puzzlePacksUI = createPuzzlePacksUI({
  dialog: puzzlePacksDialog,
  packs: puzzlePacks,
  customs,
  onPlay(code, index) {
    const stage = packStageMode(code, index);
    if (stage) start(stage, stage.rules);
  },
});
bindPuzzleOpeners(puzzlePacksDialog, ["open-puzzle-packs"], puzzlePacksUI.open);
const puzzleEditor = createPuzzleEditor({
  dialog: puzzleDialog,
  comparisonDialog: /** @type {HTMLDialogElement} */ ($("puzzle-comparison")),
  getVisual: () => settings.visual,
  solver,
  customs,
  onTry: code => playCustomPuzzle(code, true),
});
const puzzleUI = createPuzzleUI({
  dialog: puzzleDialog,
  progress: puzzleProgress,
  customs,
  onPick: p => start(puzzleMode(p), MODERN),
  onCreate: () => puzzleEditor.openNew(),
  onEdit: id => puzzleEditor.openEntry(id),
  onPlayMade: id => puzzleEditor.playEntry(id),
  onDuplicate: id => puzzleEditor.openDuplicate(id),
  onPlayReceived: code => playCustomPuzzle(code),
  onCopyReceived: code => puzzleEditor.openCopy(code),
});
bindPuzzleOpeners(puzzleDialog, ["open-puzzles", "quick-puzzles"], () => puzzleUI.open());
puzzleDialog.addEventListener("close", () => {
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
  if (screen === "menu") returnFocus($("open-practice"));
});

const versusUI = createVersusUI({
  dialog: /** @type {HTMLDialogElement} */ ($("versus")),
  getStats: versusStats,
  onPick: (level, style) => start(versusMode(level, style)),
  getStyle: () => String(store.get("versus:style", "balanced")),
  setStyle: style => store.set("versus:style", style),
});
$("versus").addEventListener("close", () => {
  if (screen === "menu") returnFocus(document.querySelector('[data-mode="versus"]'));
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
  if (screen === "menu") returnFocus($("open-achievements"));
});

const recordsUI = createRecordsUI({
  dialog: /** @type {HTMLDialogElement} */ ($("records")),
  modes: RECORD_MODES,
  records,
  sprintHistory,
  replayFor: (key, entry) => replays.forEntry(key, entry),
  onWatch: replay => replayView.start(replay, "menu", "", true),
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
  if (screen === "menu") returnFocus($("open-records"));
});

/** @param {string} action @param {string} [code] 누른 키 @param {"key" | "touch"} [source] */
const handleSystem = (action, code = "", source = "key") => {
  if (runs.restoring) return;
  if (anyDialogOpen()) return;
  if (sceneView.current) {
    if (action === "restart") sceneView.reset();
    else if (action === "pause" && code !== "Escape") {
      if (screen === "paused") resume();
      else pause();
    }
    return;
  }
  if (screen === "replay") {
    if (action === "restart") replayView.restart();
    else if (action === "pause" && code === "Escape") replayView.stop();
    else if (action === "pause" && replayView.player && !replayView.player.done) replayView.togglePause();
    return;
  }
  // 묻는 중: R은 한 번 더 누르면 다시 시작, Esc는 취소
  if (confirming) {
    if (action === "pause") cancelConfirm();
    else if (action === "restart" && confirming === "restart") acceptConfirm();
    return;
  }
  // 진행 중인 판은 묻고, 끝난 판(결과 화면)은 바로 다시 시작.
  // 설정 "다시 시작 키: 한 번에"면 키보드·게임패드의 R은 묻지 않는다(5차 검수 G1) — 터치 버튼은 잘못 누르기 쉬워 늘 묻는다
  if (action === "restart" && inProgress()) {
    if (settings.access.restart !== "instant" || source === "touch") return askConfirm("restart");
    keepAbandonedAchievements();
    return start(mode, rules, race?.target);
  }
  if (action === "restart" && screen === "results") return start(mode, rules, race?.target);
  if (action === "undo") return undoPiece();
  // 힌트(퍼즐 첫 수 보기·파내기·빌드 연습)와 결과 화면의 다음 단계
  if (action === "hint") {
    if (screen === "play" && hasHintControls(mode)) downstackHint.click();
    return;
  }
  if (action === "next") {
    const next = /** @type {HTMLButtonElement} */ (panels.results.querySelector('[data-action="next-puzzle"]'));
    if (screen === "results" && !next.hidden) next.click();
    return;
  }
  if (action !== "pause") return;
  if (screen === "play" || screen === "countdown") pause();
  else if (screen === "paused") resume();
  else if (screen === "results") leaveToMenu();
};

const keyboard = createKeyboard({ getBindings: () => bindings, onSystem: handleSystem });
const touch = createTouch({
  root: $("touchpad"),
  onSystem: action => handleSystem(action, "", "touch"),
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
const gestureTrainingOn = () => screen !== "menu" && screen !== "replay" && mode.gestureLesson && isTouchScreen();
const gesturesOn = () =>
  gestureTrainingOn() || (settings.touchMode === "gestures" && touchVisible(settings.touch, isTouchScreen()));

const undo = createUndo();
/**
 * 한 피스 되돌리기를 쓰는 판: 자유 연습, 그리고 내 퍼즐 시험 플레이(퍼즐 다시 보기 P10 — 만든 사람이 "이 수 대신 저 수"를 비교).
 * 받은 퍼즐·기본 퍼즐 풀이에는 쓰지 않는다. 만든 퍼즐은 리플레이를 남기지 않아(noReplay) 기록이 어긋날 일이 없다
 */
const canUndoPieces = () => Boolean((mode.practice && !isGuidedPractice()) || mode.trialCode);
/** 내 퍼즐 시험이 실패로 끝나 결과 화면에 있다(퍼즐은 틀린 수에서 바로 끝나므로, 되돌리기는 여기서 가장 쓸모 있다) */
const trialFailed = () =>
  screen === "results" && Boolean(mode.trialCode) && Boolean(game?.state.over) && game?.state.over !== "clear";

// ---- 키 입력 표시 ----
const inputDisplay = createInputDisplay({ root: $("input-display"), isOn: () => settings.visual.inputs === "on" });

/** 바로 앞 피스로 되돌린다(연습·내 퍼즐 시험). 시험이 실패로 끝났으면 그 수를 되돌려 판으로 돌아간다 */
const undoPiece = () => {
  const fromFailure = trialFailed();
  if (!game || !canUndoPieces() || (screen !== "play" && screen !== "paused" && !fromFailure)) return;
  if (!undo.undo(game.state)) {
    say(t("더 되돌릴 수 없어요"));
    return;
  }
  if (fromFailure) {
    showPanel(null);
    setScreen("play");
  }
  runs.journal?.action("undo");
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
  if (anyDialogOpen()) return;
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
  allows180: () => (game?.rules ?? currentRules()).allow180 !== false,
  getSettings: () => (gestureTrainingOn() ? { ...settings, touchMode: "gestures" } : settings),
  isTouch: () => Boolean(gestureTrainingOn()) || touchVisible(settings.touch, isTouchScreen()),
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

const puzzleReviewDialog = /** @type {HTMLDialogElement} */ ($("puzzle-review"));
const openPuzzleReview = () => {
  if (screen !== "results" || !mode.puzzle || !failedPuzzleMove) return;
  const review = failedPuzzleMove;
  const failedGame = game;
  showPuzzleReview({
    dialog: puzzleReviewDialog,
    review,
    reason: reviewReason(mode.puzzle, review),
    visual: settings.visual,
    onReplay: lastReplay
      ? () => {
          puzzleReviewDialog.close();
          replayView.start(lastReplay, "results", "", true);
        }
      : null,
    onPractice: async () => {
      const practice = await reconstructPuzzleReview(review, mode, rules);
      if (!puzzleReviewDialog.open || game !== failedGame) return;
      puzzleReviewDialog.close();
      game = practice.game;
      finesse = createFinesseTracker(game, ROTATIONS[rules.rotation]);
      reviewPractice = true;
      recorder = null;
      undo.reset();
      puzzleReview.reset();
      runs.beginPractice(practice.entry);
      applyRunHandling(settings.handling);
      runs.journal.action("handling", settings.handling);
      resetLessonHint();
      renderer.clearEffects();
      acc = 0;
      showPanel(null);
      setScreen("play");
      say(t("마지막 수 연습"));
    },
  });
};
puzzleReviewDialog.addEventListener("close", () => {
  if (screen === "results") $("results-watch").focus({ preventScroll: true });
});

for (const btn of document.querySelectorAll("[data-action]")) {
  btn.addEventListener("click", () => {
    const action = btn.getAttribute("data-action");
    if (action === "scene-retry" || (sceneView.current && action === "retry")) return sceneView.reset();
    if (action === "scene-exit" || (sceneView.current && action === "menu")) return sceneView.exit();
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
    if (action === "next-puzzle" && !reviewPractice && screen === "results" && game?.state.over === "clear") {
      const next = nextStage();
      if (next) return start(next, next.rules);
      if (mode.puzzle?.number && mode.puzzle.number < PUZZLES.length)
        return start(puzzleMode(PUZZLES[mode.puzzle.number]), MODERN);
    }
    if (action === "menu") {
      if (inProgress() && mode !== rulesTrial) askConfirm("menu");
      else leaveToMenu();
    }
    if (action === "watch") {
      if (failedPuzzleMove) openPuzzleReview();
      else if (lastReplay) replayView.start(lastReplay, "results", "", true);
    }
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
  if (screen === "paused") runs.save();
  else pause();
});
window.addEventListener("pagehide", () => runs.save());
window.addEventListener("storage", () => {
  if (screen === "menu") runs.renderContinue();
});

// ---- 리플레이: 녹화와 재생 화면(재생 화면은 js/app/replay-player.js) ----

const replays = createReplayStore(store, findMode);
/** @type {ReturnType<typeof createRecorder> | null} */
let recorder = null;
/** 방금 끝난 판의 리플레이 */
let lastReplay = null;

/** 리플레이 재생기·장면 연습 등 떼어 낸 화면과 함께 쓰는 판 상태 */
const session = {
  get game() {
    return game;
  },
  set game(value) {
    game = value;
  },
  get mode() {
    return mode;
  },
  set mode(value) {
    mode = value;
  },
  get rules() {
    return rules;
  },
  set rules(value) {
    rules = value;
  },
  get screen() {
    return screen;
  },
  get versus() {
    return versus;
  },
  /** 게임 시작 "GO" 표시 남은 시간 */
  get goTimer() {
    return goTimer;
  },
  set goTimer(value) {
    goTimer = value;
  },
  /** 이어서 하기로 판을 되살리는 중 */
  get restoring() {
    return runs.restoring;
  },
  /** 쌓인 프레임 시간을 비운다(화면이 바뀐 뒤 밀린 프레임을 한꺼번에 돌리지 않게) */
  resetClock() {
    acc = 0;
  },
};

/** 리플레이 재생 화면(js/app/replay-player.js) */
const replayView = createReplayPlayer({
  session,
  findMode,
  panels,
  renderer,
  cpuRenderer: replayCpuRenderer,
  fb,
  sfx,
  inputDisplay,
  versusPanel,
  countdownEl,
  setText,
  setScreen,
  showPanel,
  showModeHud,
  toMenu,
  hooks: {
    canRace: replay => canRace(replay),
    onRace: replay => raceReplay(replay),
    onShare: (replay, title) => shareUI.open(replay, title),
    onPractice: () => sceneView.enter(),
    onMakePuzzle: state => puzzleEditor.openScene(sceneToPuzzle(state)),
  },
});

/** 장면 연습(js/app/scene-practice.js) */
const sceneView = createScenePractice({
  session,
  replayView,
  findMode,
  panels,
  countdownEl,
  renderer,
  fb,
  sfx,
  inputDisplay,
  input: { keyboard, touch, gestures },
  getSettings: () => settings,
  getLastReplay: () => lastReplay,
  journal: { begin: runs.begin, save: () => runs.save(), clear: runs.clear },
  replacesSavedRun: runs.replacesSaved,
  confirmReplaceRun: runs.confirmReplace,
  showPanel,
  setScreen,
  showModeHud,
  updateBackLabels,
  feedback,
  pause,
});

// ---- 리플레이 파일·단축키 ----
// 리플레이·장면 연습 중 단축키: 장면 연습은 Esc로 리플레이로 돌아가고, 리플레이는 재생기가 처리한다
// (R 처음부터·Esc 닫기는 시스템 키로도 처리한다)
window.addEventListener("keydown", e => {
  if ((screen !== "replay" && !sceneView.current) || anyDialogOpen()) return;
  if (sceneView.current) {
    if (!e.repeat && e.code === "Escape") sceneView.exit();
    return;
  }
  replayView.handleKey(e);
});

/** JSON 값을 파일로 내려받게 한다 */
const exportReplay = replay => {
  const stamp = (replay.date || "").replace(/[-:]/g, "").slice(0, 15);
  downloadJson(replay, `tetri-sharp-${replay.mode}-${stamp || "replay"}.json`);
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
  replayView.start(replay, "menu", note);
  return true;
};

$("watch-last").addEventListener("click", () => {
  const replay = replays.last();
  if (replay) replayView.start(replay, "menu", "", true);
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
  confirmImport: message =>
    ask({ title: t("백업을 불러올까요?"), message: message.split("\n"), okLabel: t("불러오기"), okIcon: "folder" }),
  notify: notifyData,
  onRestored: reloadFromStore,
});

// ---- 루프 ----

const applyRunHandling = handling => {
  game.setHandling(toEngineHandling(handling));
  if (!sceneView.current) recorder?.handlingChanged(game.handling);
};

const advanceRun = (held, pressed, restoredStep = null) => {
  const reconstructing = restoredStep !== null;
  if (sceneView.current) return sceneView.step(held, pressed, reconstructing);
  if (canUndoPieces()) undo.track(game.state);
  const puzzleStep = restoredStep ?? (runs.journal ? runs.journal.entry.steps - 1 : null);
  const trackPuzzle = mode.puzzle && puzzleStep !== null;
  if (trackPuzzle) puzzleReview.track(game.state, puzzleStep);
  recorder?.input(held, pressed);
  const hadActive = Boolean(game.state.active);
  const events = game.step({ held, pressed });
  if (versus) {
    const cpuInput = versus.bot.input();
    versus.recorder.input(cpuInput.held, cpuInput.pressed);
    versus.cpu.step(cpuInput);
    settleBattleFrame(game, versus.cpu, events);
  }
  if (trackPuzzle) puzzleReview.finish(game.state, events);
  if (hasHintControls(mode) && events.some(event => event.type === "lock")) resetLessonHint();
  const extra = finesse?.frame(held, pressed, hadActive, events) ?? 0;
  if (!reconstructing && extra > 0 && mode.finesse) announceText([t("피네스 +{n}", { n: extra })]);
  if (mode.splits) {
    const previous = splits;
    splits = advanceSplits(mode.splits, splits, game.state.stats.lines, game.state.frame);
    if (!reconstructing && accentEnabled(settings.visual, "record") && tookSplitLead(previous, splits, pbSplits)) {
      splitPulse?.cancel();
      splitPulse = hud.split.parentElement.animate(
        [
          { outline: "var(--border-w) solid var(--accent)", outlineOffset: "calc(-1 * var(--border-w))" },
          { outline: "var(--border-w) solid transparent", outlineOffset: "calc(-1 * var(--border-w))" },
        ],
        { id: "split-lead", duration: 420, easing: "ease-out" }
      );
    }
  }
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
  if (screen === "replay") return replayView.tick();
  if (screen !== "play" || !game) return;
  if (goTimer > 0 && --goTimer === 0) countdownEl.hidden = true;
  const modeMask = sceneView.current?.target ? ~(BTN.HOLD | BTN.SOFT) : mode.lesson ? ~BTN.SOFT : -1;
  const allowed = rules.allow180 === false ? modeMask & ~BTN.R180 : modeMask;
  const buttonHeld = keyboard.held | pad.held | touch.held;
  const buttonPressed = keyboard.takePressed() | touch.takePressed();
  const training = gestureTrainingOn();
  const held = (gestures.held | (training ? 0 : buttonHeld)) & allowed;
  const pressed = (gestures.takePressed() | (training ? 0 : buttonPressed)) & allowed;
  runs.journal?.input(held, pressed);
  advanceRun(held, pressed);
  runs.save(false);
};

let padCount = 0;
const loop = now => {
  if (runs.restoring) {
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
  if (screen !== "play" && screen !== "countdown" && !(screen === "replay" && !replayView.paused)) acc = 0;
  while (acc >= FRAME_MS) {
    tick();
    acc -= FRAME_MS;
  }
  renderer.draw(game);
  if (screen === "replay" && replayView.player?.cpu) replayCpuRenderer.draw(replayView.player.cpu);
  if (race && !sceneView.current && screen !== "replay" && raceBoardVisible.matches)
    raceRenderer.draw(race.player.game);
  if (versus && screen !== "replay" && raceBoardVisible.matches) cpuRenderer.draw(versus.cpu);
  updateHud();
  inputDisplay.paint();
  requestAnimationFrame(loop);
};

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
    showLinkError(t("링크의 리플레이를 읽을 수 없었어요."));
    return;
  }
  const check = verifyReplay(replay, findMode);
  const from = replay.name ? t("{name}의 리플레이", { name: replay.name }) : t("받은 리플레이");
  replayView.start(
    replay,
    "menu",
    check.ok ? from : t("저장된 결과와 재생 결과가 달라요. 다른 버전의 파일일 수 있어요.")
  );
};

/**
 * 결과 링크(#daily=…)로 열었으면 오늘의 도전 창을 그 코드로 연다. 주소의 해시는 지운다.
 * 읽을 수 없는 코드면 다른 링크처럼 바로 알린다 — 예전에는 "받은 결과가 있어요"라고 한 뒤 겨루기를 눌러야 실패를 알았다(5차 검수 F40)
 */
const importDailyFromLink = async () => {
  const pasted = takeLinkHash("daily");
  if (!pasted) return;
  const raw = await decodeReplayCode(pasted);
  if (!(raw && sanitizeReplay(raw, findMode))) {
    showLinkError(t("링크의 결과 코드를 읽을 수 없었어요."));
    return;
  }
  dailyUI.open({
    pasted,
    message: t("받은 결과가 있어요. 겨루기를 누르면 같은 블록 순서로 함께 달려요"),
  });
};

/** 공유 링크의 규칙을 먼저 보여 주고 확인한 뒤 내 규칙에 저장한다. */
const importRulesFromLink = async hash => {
  const body = decodeRules(hash);
  if (!body) {
    showLinkError(t("링크의 규칙 코드를 읽을 수 없었어요."));
    return;
  }
  if (!(await previewRuleImport(body))) return;
  // 지금 규칙을 덮어쓰지 않고 내 규칙에 새 칸으로
  if (!ruleSlots.add(t("받은 규칙"), body)) {
    showLinkError(t("내 규칙이 가득 찼어요({n}개). 하나를 지우고 링크를 다시 열어 주세요", { n: MAX_RULE_SLOTS }));
    return;
  }
  customBody = ruleSlots.active().body;
  ruleChoice = "custom";
  store.set("lastRules", "custom");
  showMenuNotice(t("링크로 받은 규칙을 내 규칙에 새로 넣었어요"));
  renderMenu();
  renderKeyHelp();
  $("rule-slot").focus();
};

document.documentElement.lang = lang;
translateDom(document.documentElement);
hydrateIcons();
applyTouch();
renderKeyHelp();
toMenu(true);
const rulesHash = takeLinkHash("rules");
if (rulesHash) importRulesFromLink(rulesHash);
const packHash = takeLinkHash("pack");
const puzzleHash = takeLinkHash("puzzle");
if (packHash) {
  const code = new URLSearchParams(packHash.slice(1)).get("pack");
  if (!decodePack(code)) showLinkError(t("링크의 퍼즐 팩을 읽을 수 없었어요."));
  else {
    const entry = puzzlePacks.add(code);
    if (entry) puzzlePacksUI.details(entry.code);
    else
      showLinkError(
        puzzlePacks.read().length >= MAX_PACKS
          ? t("퍼즐 팩은 {n}개까지 저장할 수 있어요.", { n: MAX_PACKS })
          : t("퍼즐 팩을 저장하지 못했어요.")
      );
  }
} else if (puzzleHash) {
  // 링크로 받은 퍼즐은 받은 퍼즐 목록에 남긴다(내가 만든 퍼즐이면 남기지 않는다)
  const code = new URLSearchParams(puzzleHash.slice(1)).get("puzzle");
  if (code && decodePuzzle(code)) customs.receive(code);
  playCustomPuzzle(code);
} else {
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

// 이미 열려 있는 앱에서 공유 링크(#pack= · #puzzle= · #replay= · #daily= · #rules=)를 열면 주소의 해시만 바뀌고 페이지는 그대로다.
// 처음 열 때와 같은 흐름(진행 중인 판 저장·묻기, 받은 퍼즐 남기기 등)을 타도록 다시 불러온다.
// 진행 중인 판은 이어서 하기로 저장돼 있고, 만들던 퍼즐은 내 퍼즐에 저장돼 있다.
window.addEventListener("hashchange", () => {
  if (/[#&](pack|puzzle|replay|daily|rules)=/.test(location.hash)) location.reload();
});

// 브라우저 테스트가 "앱이 끝까지 떴는지" 확인하는 표시.
document.documentElement.dataset.ready = "1";
