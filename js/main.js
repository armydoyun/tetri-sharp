// 진입점: 화면 흐름(메뉴 → 카운트다운 → 플레이 → 결과), 게임 루프, 입력, 설정, 기록을 연결한다.
// 로직은 고정 60Hz로 진행하고 화면은 모니터 주사율대로 그린다.
import { createGame } from "./core/engine.js";
import { createRenderer } from "./render/canvas.js";
import { createKeyboard } from "./input/keyboard.js";
import { createTouch, touchVisible } from "./input/touch.js";
import { compilePadmap, createGamepad } from "./input/gamepad.js";
import { compileKeymap } from "./input/keymap.js";
import { MODES, RACE_MODES, findMode as findBaseMode } from "./modes/index.js";
import { dailyMode, dateKey, findDaily } from "./modes/daily.js";
import { decodeReplayCode, encodeReplayCode, replayLink } from "./replay/share.js";
import { createDailyUI } from "./ui/daily.js";
import { formatScore, formatTime } from "./modes/format.js";
import { createStore } from "./storage/store.js";
import { loadSettings, sanitizeSettings, saveSettings, toEngineHandling } from "./storage/settings.js";
import { createRecords } from "./storage/records.js";
import { createSettingsUI } from "./ui/settings.js";
import { createRulesUI } from "./ui/rules.js";
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
import { recordKey } from "./storage/records.js";
import { MODERN, PRESETS, PRESET_LIST } from "./rules/presets.js";
import { makeCustomRules, sanitizeRuleBody } from "./rules/sanitize.js";
import { decodeRules } from "./rules/share.js";
import { createSfx } from "./audio/sfx.js";
import { createFinesseTracker } from "./modes/finesse.js";
import { analyzeReplay } from "./replay/analyze.js";
import { ROTATIONS } from "./rules/rotation/index.js";
import { WIN, exchangeGarbage, versusMode } from "./modes/versus.js";
import { createBot } from "./ai/bot.js";
import { createGestures } from "./input/gestures.js";
import { createUndo } from "./modes/undo.js";
import { createHelpUI } from "./ui/help.js";
import { PUZZLES, createPuzzleProgress, findPuzzle, puzzleMode } from "./modes/puzzles.js";
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
const GO_FRAMES = 20; // "GO!" — 이 동안에는 이미 플레이 중

const $ = id => /** @type {HTMLElement} */ (document.getElementById(id));
const canvas = /** @type {HTMLCanvasElement} */ ($("board"));
const panels = { menu: $("menu"), pause: $("pause"), confirm: $("confirm"), results: $("results") };
const countdownEl = $("countdown");
const hud = {
  timeLabel: $("hud-time-label"),
  time: $("hud-time"),
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
};
applyScheme();

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
  getVisual: () => ({ ...settings.visual, effects: "off" }),
});
let race = null;

// ---- CPU 대전: 상대 엔진 + CPU 입력 ----
const versusPanel = $("versus-panel");
const cpuRenderer = createRenderer(/** @type {HTMLCanvasElement} */ ($("cpu-board")), {
  compact: true,
  getVisual: () => ({ ...settings.visual, effects: "off" }),
});
/** @type {null | { cpu: ReturnType<typeof createGame>, bot: ReturnType<typeof createBot> }} */
let versus = null;
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
let customBody = sanitizeRuleBody(store.get("customRules", MODERN));
/** 지금 고른 규칙 */
const currentRules = () => (ruleChoice === "custom" ? makeCustomRules(customBody) : PRESETS[ruleChoice]);
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

// ---- 표시 도우미 ----

const showPanel = name => {
  for (const [key, el] of Object.entries(panels)) el.hidden = key !== name;
  // 결과 화면은 버튼이 아니라 패널 자체에 포커스를 둔다: 하드 드롭(Space)을 연타하다 끝났을 때
  // 그 입력이 "다시 하기"를 눌러 결과를 건너뛰지 않게. 다시 하기·메뉴는 단축키(R·Esc)나 클릭으로.
  const target =
    name === "results"
      ? panels.results
      : name && /** @type {HTMLElement | null} */ (panels[name].querySelector("button"));
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

const renderRuleTabs = () => {
  const tabs = $("rule-tabs");
  tabs.replaceChildren(
    ...RULE_CHOICES.map(id => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "rule-tab";
      b.dataset.rules = id;
      b.textContent = id === "custom" ? "Custom" : PRESETS[id].name;
      b.setAttribute("aria-pressed", String(id === ruleChoice));
      b.addEventListener("click", () => {
        ruleChoice = id;
        store.set("lastRules", id);
        renderMenu();
        renderKeyHelp();
        /** @type {HTMLElement | null} */ (tabs.querySelector(`[data-rules="${id}"]`))?.focus();
      });
      return b;
    })
  );
  // 편집 버튼은 늘 같은 자리에 있다. Custom이 아닐 때는 비활성(원칙 2) — 이유는 설명 줄에.
  /** @type {HTMLButtonElement} */ ($("edit-rules")).disabled = ruleChoice !== "custom";
  $("rule-desc").textContent =
    ruleChoice === "custom"
      ? t('직접 조합한 규칙이에요. "편집"으로 바꿀 수 있고, 조합마다 기록이 따로 쌓여요 (기록표 {id}).', {
          id: makeCustomRules(customBody).id,
        })
      : `${RULE_DESCRIPTIONS[ruleChoice]} ${t("바꾸고 싶으면 Custom을 골라 편집하세요.")}`;
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

const updateRaceProgress = () => {
  if (!race || !game) return;
  const p = mode.race.progress(race.player.game.state);
  raceProgress.max = p.max;
  raceProgress.value = p.value;
  raceLabel.textContent = race.player.done ? mode.formatRecord(race.target.best) : p.text;
  const own = mode.race.progress(game.state);
  raceOwnProgress.max = own.max;
  raceOwnProgress.value = own.value;
  $("race-own-label").textContent = own.text;
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

const renderRaceModes = ruleSet => {
  $("race-modes").replaceChildren(
    ...RACE_MODES.map(m => {
      const target = raceTargetFor(m, ruleSet);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tool-row race-mode";
      btn.dataset.race = m.id;
      btn.disabled = !target;
      const name = document.createElement("strong");
      name.textContent = m.name;
      const info = document.createElement("small");
      info.textContent = target ? m.formatRecord(target.best) : t("끝까지 간 리플레이 필요");
      const body = document.createElement("span");
      body.className = "race-mode-text";
      body.append(name, info);
      btn.append(body, icon("chevron-right"));
      btn.addEventListener("click", () => startRace(m));
      return btn;
    })
  );
};

const renderMenu = () => {
  renderRuleTabs();
  renderPuzzleProgress();
  const ruleSet = currentRules();
  renderRaceModes(ruleSet);
  $("active-rules").textContent = t("규칙 · {name}", { name: ruleSet.name });
  const list = $("mode-list");
  list.replaceChildren(
    ...MODES.map(m => {
      const best = records.best(m, ruleSet);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "menu-row";
      btn.dataset.mode = m.id;
      const text = document.createElement("span");
      text.className = "menu-text";
      const name = document.createElement("strong");
      name.textContent = m.name;
      const desc = document.createElement("small");
      desc.textContent = m.description;
      text.append(name, desc);
      const pb = document.createElement("span");
      pb.className = "mode-best num";
      pb.textContent = best ? t("최고 기록 {record}", { record: m.formatRecord(best) }) : "";
      btn.append(text, pb, icon("chevron-right"));
      btn.addEventListener("click", () => start(m));
      return btn;
    }),
    versusRow(),
    dailyRow()
  );
};

/** 첫 화면 모드 목록 끝의 CPU 대전 줄: 누르면 난이도를 고른다 */
const versusRow = () => {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "menu-row";
  btn.dataset.mode = "versus";
  const text = document.createElement("span");
  text.className = "menu-text";
  const name = document.createElement("strong");
  name.textContent = t("CPU 대전");
  const desc = document.createElement("small");
  desc.textContent = t("CPU와 쓰레기 줄을 주고받기 · 먼저 막히면 패배");
  text.append(name, desc);
  const wins = Object.values(versusStats()).reduce((sum, s) => sum + (s?.win | 0), 0);
  const pb = document.createElement("span");
  pb.className = "mode-best num";
  pb.textContent = wins ? t("{n}승", { n: wins }) : "";
  btn.append(text, pb, icon("chevron-right"));
  btn.addEventListener("click", () => versusUI.open());
  return btn;
};

// ---- 오늘의 도전 ----

const today = () => {
  const key = dateKey();
  const m = dailyMode(key);
  return { key, mode: m, best: records.best(m, MODERN), replay: replays.best(recordKey(m, MODERN)) };
};

/** 첫 화면 모드 목록 끝의 오늘의 도전 줄 */
const dailyRow = () => {
  const { key, best, mode: m } = today();
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "menu-row";
  btn.dataset.mode = "daily";
  const text = document.createElement("span");
  text.className = "menu-text";
  const name = document.createElement("strong");
  name.textContent = t("오늘의 도전");
  const desc = document.createElement("small");
  desc.textContent = `${key} · ${t("모두 같은 블록 순서로 40줄 · 결과를 공유해 겨루기")}`;
  text.append(name, desc);
  const pb = document.createElement("span");
  pb.className = "mode-best num";
  pb.textContent = best ? t("최고 기록 {record}", { record: m.formatRecord(best) }) : "";
  btn.append(text, pb, icon("chevron-right"));
  btn.addEventListener("click", () => dailyUI.open());
  return btn;
};

/** 받은 코드로 겨루기. 문제가 있으면 알림 문구를 돌려준다 */
const raceFromCode = async text => {
  const raw = await decodeReplayCode(text);
  const replay = raw && sanitizeReplay(raw, findMode);
  if (!replay) return t("읽을 수 없는 코드예요");
  const m = findDaily(replay.mode);
  if (!m || replay.rules.id !== MODERN.id || replay.result.over !== "clear")
    return t("오늘의 도전을 끝까지 간 결과 코드만 겨룰 수 있어요");
  let targetSplits = [];
  const verified = verifyReplay(replay, findMode, state => {
    targetSplits = advanceSplits(m.splits, targetSplits, state.stats.lines, state.frame);
  });
  if (!verified.ok) return t("이 코드는 결과를 다시 만들 수 없어요. 다른 버전일 수 있어요");
  const r = replay.result;
  const best = { frames: r.frames, lines: r.lines, pieces: r.pieces, score: r.score };
  start(m, MODERN, { replay, best, splits: targetSplits, friend: replay.name || t("상대") });
  return null;
};

const dailyUI = createDailyUI({
  dialog: /** @type {HTMLDialogElement} */ ($("daily")),
  getToday: today,
  makeCode: replay => encodeReplayCode(replay, records.playerName),
  makeLink: code => replayLink(code, location.href),
  formatRecord: e => today().mode.formatRecord(e),
  onStart: () => start(today().mode, MODERN),
  onRace: raceFromCode,
});
$("daily").addEventListener("close", () => {
  if (screen === "menu") /** @type {HTMLElement | null} */ (document.querySelector('[data-mode="daily"]'))?.focus();
});
const updateHud = () => {
  const frame = game?.state.frame ?? 0;
  const stats = game?.state.stats ?? { pieces: 0, lines: 0 };
  const lines = game ? mode.hudLines(game.state) : { label: t("줄"), value: "0" };
  const time = game ? mode.hudTime(game.state) : { label: t("시간"), frames: 0 };
  hud.timeLabel.textContent = time.label;
  hud.time.textContent = formatTime(time.frames);
  hud.score.textContent = formatScore(game?.state.score ?? 0);
  hud.level.textContent = game ? (mode.hudLevel?.(game.state) ?? String(game.state.level)) : "1";
  hud.linesLabel.textContent = lines.label;
  hud.lines.textContent = lines.value;
  hud.pieces.textContent = String(stats.pieces);
  hud.attack.textContent = String(game?.state.garbage?.sent ?? 0);
  if (versus) {
    $("versus-cpu-sent").textContent = String(versus.cpu.state.garbage.sent);
    $("versus-cpu-incoming").textContent = String(versus.cpu.state.garbage.pending);
  }
  const practice = game?.state.practice;
  hud.streak.textContent = practice ? `${practice.streak} / ${practice.bestStreak}` : "0 / 0";
  const fin = game?.state.finesse;
  hud.finesse.textContent = fin ? `${fin.faults} / ${fin.judged}` : "0 / 0";
  hud.pps.textContent = frame ? (stats.pieces / (frame / 60)).toFixed(2) : "0.00";
  const delta = game && mode.splits ? splitDelta(splits, pbSplits) : null;
  hud.split.textContent = formatDelta(delta);
  if (delta === null) delete hud.split.dataset.ahead;
  else hud.split.dataset.ahead = String(delta < 0);
};

// ---- 화면 흐름 ----

const setScreen = next => {
  screen = next;
  document.body.dataset.screen = next;
  keyboard.setEnabled(next === "play" || next === "countdown");
  touch.setEnabled(next === "play" || next === "countdown");
  gestures.setEnabled((next === "play" || next === "countdown") && gesturesOn());
  document.body.classList.toggle("is-practice", Boolean(mode.practice) && next !== "menu");
  $("session-title").textContent = next === "menu" ? "" : mode.name;
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
  /** @type {HTMLButtonElement} */ ($("watch-last")).disabled = !replays.last();
  showPanel("menu");
  // 마지막으로 한 모드에 포커스를 둔다 → Enter로 바로 시작.
  /** @type {HTMLElement | null} */ (panels.menu.querySelector(`[data-mode="${mode.id}"]`))?.focus({
    preventScroll: initial,
  });
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
  retrySeed = /** @type {number | undefined} */ (undefined)
) => {
  confirming = null;
  if (screen === "replay") stopReplay();
  mode = m;
  if (!m.practice) store.set("lastMode", m.id);
  rules = selectedRules;
  runPlayerName = records.playerName;
  const seed = target?.replay.seed ?? retrySeed ?? m.fixedSeed ?? (Math.random() * 2 ** 32) >>> 0;
  $("race-label").textContent = target?.friend ? t("{name}의 기록", { name: target.friend }) : t("내 최고 기록");
  race = target ? { target, player: createPlayer(target.replay, findMode) } : null;
  racePanel.hidden = !race;
  game = createGame({ rules, handling: toEngineHandling(settings.handling), seed, mode: m });
  updateRaceProgress();
  // 대전: CPU도 같은 시드(같은 블록 순서)로 시작한다. 상대와 함께라야 재현되므로 리플레이는 남기지 않는다.
  if (m.versus) {
    const cpu = createGame({ rules, seed, mode: m });
    versus = { cpu, bot: createBot({ game: cpu, rotation: ROTATIONS[rules.rotation], level: m.versus, seed }) };
    $("versus-name").textContent = t("CPU · {level}", { level: m.versus.name });
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
  acc = 0;
  countdown = COUNTDOWN_FRAMES[settings.access.countdown] ?? READY_FRAMES;
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
  if (countdown <= 0) {
    countdownEl.hidden = true;
    setScreen("play");
    sfx.play("go");
  } else sfx.play("ready");
  say(t("{mode} 시작", { mode: mode.name }));
};

let pausedFrom = /** @type {"play" | "countdown"} */ ("play");

const pause = () => {
  if (screen !== "play" && screen !== "countdown") return;
  pausedFrom = screen;
  setScreen("paused");
  showPanel("pause");
};

$("pause-game").addEventListener("click", pause);

const resume = () => {
  if (screen !== "paused") return;
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
  else toMenu();
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
    helpUI.isOpen ||
    puzzleUI.isOpen ||
    shareUI.isOpen
  )
    return;
  if (screen === "menu") return window.scrollTo(0, 0);
  if (inProgress()) return askConfirm("menu");
  if (screen === "replay") stopReplay();
  toMenu();
});

const renderResultSplits = () => {
  const details = /** @type {HTMLDetailsElement} */ ($("results-splits"));
  details.hidden = !mode.splits;
  details.open = false;
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
        const button = document.createElement("button");
        button.type = "button";
        button.className = "btn btn-small";
        button.textContent = label;
        button.setAttribute("aria-label", t("{segment} 구간 다시 보기", { segment: label }));
        button.addEventListener("click", () => {
          startReplay(replay, "results");
          seekReplay(startFrame, true);
        });
        segment.append(button);
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
  details.querySelector("summary").textContent = slowest
    ? t("구간 기록 · {from}–{to}줄 {delta}초", {
        from: slowest.from,
        to: slowest.to,
        delta: formatDelta(slowest.lost / 60),
      })
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

const finish = () => {
  if (!game) return;
  const state = game.state;
  setScreen("results");
  countdownEl.hidden = true;

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

  if (mode.versus) addVersusResult(mode.versus.id, state.over === WIN);
  // 퍼즐: 깬 단계를 남기고, 깼으면 "다음 단계"를 보인다(마지막 단계면 다시 하기만)
  if (mode.puzzle && state.over === "clear") puzzleProgress.markCleared(mode.puzzle.number);
  const nextPuzzle = /** @type {HTMLButtonElement} */ (panels.results.querySelector('[data-action="next-puzzle"]'));
  nextPuzzle.hidden = !(mode.puzzle && state.over === "clear" && mode.puzzle.number < PUZZLES.length);
  lastReplay = recorder ? recorder.finish(state) : null;
  for (const b of /** @type {NodeListOf<HTMLButtonElement>} */ (
    panels.results.querySelectorAll('[data-action="watch"], [data-action="export"]')
  ))
    b.disabled = !lastReplay;
  if (lastReplay) {
    replays.saveLast(lastReplay);
    if (outcome && outcome.rank < MAX_RANKED)
      replays.saveRanked(recordKey(mode, rules), lastReplay, records.list(mode, rules));
  }
  recorder = null;

  $("results-mode").textContent = `${mode.name} · ${rules.name}`;
  const summary = mode.summary(state);
  $("results-title").textContent = summary.title;
  $("results-main").textContent = summary.main;
  say(`${summary.title} ${summary.main}`);
  fb.clearAction();
  countdownEl.hidden = true;
  $("results-badge").classList.toggle("is-invisible", !outcome?.isBest);

  $("race-result").textContent = race ? raceResultText(state, race.target.best, race.target.friend) : "";

  const seconds = state.frame / 60;
  if (mode.versus && versus) {
    const g = state.garbage;
    const cg = versus.cpu.state.garbage;
    const vrows = [
      [t("시간"), formatTime(state.frame)],
      [t("줄"), String(state.stats.lines)],
      [t("피스"), String(state.stats.pieces)],
      ["PPS", seconds ? (state.stats.pieces / seconds).toFixed(2) : "0.00"],
      [t("보낸 줄"), String(g.sent)],
      [t("막은 쓰레기"), String(g.blocked)],
      [t("받은 쓰레기"), String(g.received)],
      [t("CPU가 보낸 줄"), String(cg.sent)],
    ];
    const s = versusStats()[mode.versus.id];
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
    ["PPS", seconds ? (state.stats.pieces / seconds).toFixed(2) : "0.00"],
    [t("최고 기록"), best ? mode.formatRecord(best) : "—"],
  ];
  // 순위 줄은 늘 둔다(없으면 —) → 결과 화면 높이가 판마다 같다.
  rows.push([t("순위"), outcome && outcome.rank < 10 ? t("{n}위", { n: outcome.rank + 1 }) : "—"]);
  if (mode.splits) {
    const delta = splitDelta(splits, resultPbSplits);
    if (delta !== null) rows.push([t("PB 대비"), formatDelta(delta)]);
    if (state.over === "clear") rows.splice(0, 1);
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
      game.setHandling(toEngineHandling(settings.handling));
      recorder?.handlingChanged(game.handling);
    }
    renderKeyHelp();
  },
  onPreviewSound: () => sfx.play("clear2"),
  // 모드 이름처럼 시작할 때 만든 글자까지 바꾸려면 다시 불러오는 게 가장 확실하다.
  onLanguage: () => location.reload(),
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
    customBody = sanitizeRuleBody(body);
    store.set("customRules", customBody);
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

const practiceUI = createPracticeUI({
  dialog: /** @type {HTMLDialogElement} */ ($("practice")),
  onPick: drill => start(practiceMode(drill)),
});
$("open-practice").addEventListener("click", () => practiceUI.open());

// ---- 퍼즐 ----
const puzzleProgress = createPuzzleProgress(store);
const puzzleUI = createPuzzleUI({
  dialog: /** @type {HTMLDialogElement} */ ($("puzzles")),
  progress: puzzleProgress,
  onPick: p => start(puzzleMode(p), MODERN),
});
$("open-puzzles").addEventListener("click", () => puzzleUI.open());
$("puzzles").addEventListener("close", () => {
  if (screen === "menu") /** @type {HTMLElement | null} */ ($("open-puzzles"))?.focus();
});
/** 첫 화면 "퍼즐" 줄의 진행도 */
const renderPuzzleProgress = () => {
  $("puzzle-progress").textContent = `${puzzleProgress.cleared().size} / ${PUZZLES.length}`;
};
$("practice").addEventListener("close", () => {
  if (screen === "menu") /** @type {HTMLElement | null} */ ($("open-practice"))?.focus();
});

const versusUI = createVersusUI({
  dialog: /** @type {HTMLDialogElement} */ ($("versus")),
  getStats: versusStats,
  onPick: level => start(versusMode(level)),
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

const recordsUI = createRecordsUI({
  dialog: /** @type {HTMLDialogElement} */ ($("records")),
  modes: MODES,
  records,
  replayFor: (key, entry) => replays.forEntry(key, entry),
  onWatch: replay => startReplay(replay, "menu"),
});
$("open-records").addEventListener("click", () => recordsUI.open({ modeId: mode.id, rulesId: currentRules().id }));
$("records").addEventListener("close", () => {
  if (screen === "menu") /** @type {HTMLElement | null} */ ($("open-records"))?.focus();
});

const handleSystem = (action, code = "") => {
  if (
    settingsUI.isOpen ||
    rulesUI.isOpen ||
    recordsUI.isOpen ||
    statsUI.isOpen ||
    practiceUI.isOpen ||
    versusUI.isOpen ||
    dailyUI.isOpen ||
    helpUI.isOpen ||
    puzzleUI.isOpen ||
    shareUI.isOpen
  )
    return;
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
  if (!game || !mode.practice || (screen !== "play" && screen !== "paused")) return;
  if (!undo.undo(game.state)) {
    say(t("더 되돌릴 수 없어요"));
    return;
  }
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
  helpUI.open();
});
$("welcome-close").addEventListener("click", dismissWelcome);
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
    if (action === "resume") resume();
    if (action === "retry") {
      if (inProgress()) askConfirm("restart");
      else start(mode, rules, race?.target);
    }
    if (action === "retry-seed" && mode.splits && lastReplay) start(mode, rules, null, lastReplay.seed);
    if (action === "race-best" && mode.splits) startRace(mode, rules);
    if (action === "next-puzzle" && mode.puzzle) {
      const next = PUZZLES[mode.puzzle.number] ?? puzzleProgress.next();
      start(puzzleMode(next), MODERN);
    }
    if (action === "menu") {
      if (inProgress()) askConfirm("menu");
      else toMenu();
    }
    if (action === "watch" && lastReplay) startReplay(lastReplay);
    if (action === "stats" && game)
      statsUI.open(game.state, `${mode.name} · ${rules.name}`, !!mode.splits && splits.length > 0);
    if (action === "export" && lastReplay) shareUI.open(lastReplay, `${mode.name} · ${rules.name}`);
  });
}

// 창이 포커스를 잃으면 keyup을 못 받는다 → 자동 일시정지.
window.addEventListener("blur", pause);
document.addEventListener("visibilitychange", () => document.hidden && pause());

// ---- 리플레이 ----

const replays = createReplayStore(store, findMode);
/** @type {ReturnType<typeof createRecorder> | null} */
let recorder = null;
/** 방금 끝난 판의 리플레이 */
let lastReplay = null;
/** @type {ReturnType<typeof createPlayer> | null} */
let player = null;
let playing = null;
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
const replayStep = /** @type {HTMLButtonElement} */ (replayBar.querySelector('[data-replay="step"]'));
const replayToggle = /** @type {HTMLButtonElement} */ (replayBar.querySelector('[data-replay="toggle"]'));

const replayLength = () => playing?.result?.frames || analysis?.length || 0;

const updateReplayProgress = () => {
  const frame = player?.frame ?? 0;
  const length = replayLength();
  replayProgress.max = String(length || 1);
  replayProgress.value = String(Math.min(frame, length || 1));
  replayProgress.style.setProperty("--fill", `${length ? (Math.min(frame, length) / length) * 100 : 0}%`);
  replayTime.textContent = length ? `${formatTime(frame)} / ${formatTime(length)}` : formatTime(frame);
};

const MARK_LABELS = {
  finesse: m => t("피네스 실수 +{n} · {piece}", { n: m.value, piece: m.label }),
  slow: m => t("오래 고민한 피스 · {s}초", { s: (m.value / 60).toFixed(1) }),
  highlight: m => m.label,
};

/** 가까운 표시를 묶어 클릭 영역이 겹치지 않게 한다. */
const renderTimelineMarks = () => {
  const length = replayLength();
  const width = replayMarkers.clientWidth;
  const groups = [];
  const marks = analysis?.markers ?? [];
  if (!length || !width) return;
  for (const [index, mark] of marks.entries()) {
    const x = (mark.frame / length) * width;
    const last = groups.at(-1);
    if (last && x - last.x < 18) last.count++;
    else groups.push({ x, index, count: 1 });
  }
  replayMarkers.replaceChildren(
    ...groups.map(({ x, index, count }) => {
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
      return b;
    })
  );
};

new ResizeObserver(() => {
  if (screen === "replay") renderTimelineMarks();
}).observe(replayMarkers);

const renderMarkers = () => {
  renderTimelineMarks();
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
  const to = Math.max(0, Math.min(Math.round(target), replayLength() || target));
  if (to < player.frame) {
    player = createPlayer(playing, findMode);
    game = player.game;
  }
  while (player.frame < to && !player.done) player.step();
  if (pause) replayPaused = true;
  renderer.clearEffects();
  fb.clearAction();
  updateReplayBar();
};

const seekMark = index => {
  const mark = analysis?.markers[index];
  if (!mark) return;
  seekReplay(mark.frame - 30, true);
  selectedMark = index;
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
  seekMark(next);
};

replayProgress.addEventListener("input", () => seekReplay(Number(replayProgress.value), true));
const menuNotice = $("menu-notice");

const updateReplayBar = () => {
  /** @type {HTMLElement} */ (replayBar.querySelector(".replay-toggle-icon")).replaceChildren(
    icon(replayPaused ? "play" : "pause")
  );
  /** @type {HTMLElement} */ (replayBar.querySelector(".replay-toggle-text")).textContent = replayPaused
    ? t("재생")
    : t("일시정지");
  /** @type {HTMLElement} */ (replayBar.querySelector(".replay-speed")).textContent = `${replaySpeed}x`;
  replayStatus.textContent = player?.done ? t("끝") : "";
  replayStep.disabled = !player || player.done;
  replayToggle.disabled = replayStep.disabled;
  for (const b of /** @type {NodeListOf<HTMLButtonElement>} */ (
    replayBar.querySelectorAll('[data-replay="back"], [data-replay="step-back"]')
  ))
    b.disabled = !player || player.frame === 0;
  updateReplayProgress();
};

const startReplay = (replay, returnTo = screen, note = "") => {
  const entering = screen !== "replay";
  const focus = document.activeElement;
  if (entering) replayReturn = { screen: returnTo, game, mode, rules, focus: document.activeElement };
  selectedMark = -1;
  playing = replay;
  player = createPlayer(replay, findMode);
  game = player.game;
  mode = player.mode;
  rules = replay.rules;
  replayPaused = false;
  if (analysis?.for !== replay) analysis = { ...analyzeReplay(replay, findMode), for: replay };
  acc = 0;
  renderer.clearEffects();
  fb.clearAction();
  countdownEl.hidden = true;
  showPanel(null);
  setScreen("replay");
  showModeHud(mode, true);
  replayBar.hidden = false;
  replayNote.textContent = note;
  $("replay-title").textContent = `${mode.name} · ${rules.name}`;
  renderMarkers();
  /** @type {HTMLButtonElement} */ (replayBar.querySelector('[data-replay="race"]')).hidden = !canRace(replay);
  updateReplayBar();
  if (!entering && focus instanceof HTMLElement && replayBar.contains(focus)) focus.focus({ preventScroll: true });
  else replayToggle.focus({ preventScroll: true });
};

const restartReplay = () => playing && startReplay(playing, screen, replayNote.textContent);

const stopReplay = () => {
  if (screen !== "replay") return;
  player = null;
  playing = null;
  replayBar.hidden = true;
  renderer.clearEffects();
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

const advanceReplay = count => {
  if (!player || player.done) return;
  selectedMark = -1;
  for (let i = 0; i < count && !player.done; i++) {
    const events = player.step();
    inputDisplay.show(player.input.held, player.input.pressed);
    for (const e of events) announce(e);
    renderer.addEvents(events);
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
  btn.addEventListener("click", () => {
    const action = btn.getAttribute("data-replay");
    if (action === "toggle") replayPaused = !replayPaused;
    if (action === "speed") replaySpeed = SPEEDS[(SPEEDS.indexOf(replaySpeed) + 1) % SPEEDS.length];
    if (action === "step") {
      replayPaused = true;
      advanceReplay(1);
    }
    if (action === "step-back") return seekReplay((player?.frame ?? 0) - 1, true);
    if (action === "back") return seekReplay((player?.frame ?? 0) - 300);
    if (action === "ahead") return seekReplay((player?.frame ?? 0) + 300);
    if (action === "prev-mark") return jumpMark(-1);
    if (action === "next-mark") return jumpMark(1);
    if (action === "share" && playing) return shareUI.open(playing, `${mode.name} · ${rules.name}`);
    if (action === "race" && playing) return raceReplay(playing);
    if (action === "restart") return restartReplay();
    if (action === "exit") return stopReplay();
    updateReplayBar();
  });
}

// 리플레이 중 단축키: Space 일시정지, 1·2·4 속도 (Esc 닫기, R 처음부터는 시스템 키로 처리)
window.addEventListener("keydown", e => {
  if (
    screen !== "replay" ||
    settingsUI.isOpen ||
    rulesUI.isOpen ||
    recordsUI.isOpen ||
    statsUI.isOpen ||
    practiceUI.isOpen ||
    versusUI.isOpen ||
    dailyUI.isOpen ||
    helpUI.isOpen ||
    puzzleUI.isOpen ||
    shareUI.isOpen ||
    e.repeat
  )
    return;
  const inBar = replayBar.contains(document.activeElement);
  if (e.code === "Escape") return stopReplay();
  if (e.code === "Space" && !inBar) replayPaused = !replayPaused;
  else if (["Digit1", "Digit2", "Digit4"].includes(e.code)) replaySpeed = Number(e.code.slice(5));
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
    $("replay-import-notice").textContent = t("읽을 수 없는 리플레이 파일이에요.");
    return false;
  }
  const check = verifyReplay(replay, findMode);
  $("replay-import-notice").textContent = "";
  showMenuNotice("");
  const note = check.ok ? "" : t("저장된 결과와 재생 결과가 달라요. 다른 버전의 파일일 수 있어요.");
  startReplay(replay, "menu", note);
  return true;
};

$("watch-last").addEventListener("click", () => {
  const replay = replays.last();
  if (replay) startReplay(replay, "menu");
});
const fileInput = /** @type {HTMLInputElement} */ ($("replay-file"));
$("open-replay").addEventListener("click", () => fileInput.click());
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
    if (request === replayFileRequest && screen === "menu")
      $("replay-import-notice").textContent = t("파일을 읽지 못했어요. 다시 선택해 주세요.");
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
  customBody = sanitizeRuleBody(store.get("customRules", MODERN) ?? MODERN);
  const last = store.get("lastRules", null);
  ruleChoice = RULE_CHOICES.includes(last) ? last : "modern";
  mode = findMode(store.get("lastMode", null));
  lastReplay = null;
  applyTouch();
  renderKeyHelp();
  toMenu();
};

setupBackup({
  store,
  findMode,
  exportButton: $("export-backup"),
  importButton: $("import-backup"),
  fileInput: /** @type {HTMLInputElement} */ ($("backup-file")),
  canImport: () => screen === "menu",
  confirmImport: message => window.confirm(message),
  notify: text => showMenuNotice(text),
  onRestored: reloadFromStore,
});

// ---- 루프 ----

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
  const held = keyboard.held | pad.held | touch.held | gestures.held;
  const pressed = keyboard.takePressed() | touch.takePressed() | gestures.takePressed();
  if (mode.practice) undo.track(game.state);
  inputDisplay.show(held, pressed);
  recorder?.input(held, pressed);
  const hadActive = Boolean(game.state.active);
  const events = game.step({ held, pressed });
  if (versus) {
    versus.cpu.step(versus.bot.input());
    exchangeGarbage(game, versus.cpu);
    // CPU가 먼저 막히면 내가 이긴다(같은 프레임에 둘 다 막히면 진다).
    if (versus.cpu.state.over && !game.state.over) events.push(...game.finishAs(WIN));
  }
  const extra = finesse?.frame(held, pressed, hadActive, events) ?? 0;
  if (extra > 0 && mode.finesse) announceText([t("피네스 +{n}", { n: extra })]);
  if (mode.splits) splits = advanceSplits(mode.splits, splits, game.state.stats.lines, game.state.frame);
  if (race) {
    if (!race.player.done) race.player.step();
    updateRaceProgress();
  }
  for (const e of events) announce(e);
  renderer.addEvents(events);
  sfx.events(events);
  feedback(events);
  if (events.some(e => e.type === "gameOver" || e.type === "finish")) finish();
};

let padCount = 0;
const loop = now => {
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
  if (race && screen !== "replay" && raceBoardVisible.matches) raceRenderer.draw(race.player.game);
  if (versus && raceBoardVisible.matches) cpuRenderer.draw(versus.cpu);
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
  customBody = body;
  store.set("customRules", customBody);
  ruleChoice = "custom";
  store.set("lastRules", "custom");
  showMenuNotice(t("링크로 받은 규칙을 Custom에 불러왔어요 · 기록표 {id}", { id: makeCustomRules(body).id }));
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
importDailyFromLink();
importReplayFromLink();
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
