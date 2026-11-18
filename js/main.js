// 진입점: 화면 흐름(메뉴 → 카운트다운 → 플레이 → 결과), 게임 루프, 입력, 설정, 기록을 연결한다.
// 로직은 고정 60Hz로 진행하고 화면은 모니터 주사율대로 그린다.
import { createGame } from "./core/engine.js";
import { createRenderer } from "./render/canvas.js";
import { createKeyboard } from "./input/keyboard.js";
import { createTouch, touchVisible } from "./input/touch.js";
import { PAD_ICONS, compilePadmap, createGamepad, padButtonName } from "./input/gamepad.js";
import { ACTIONS, compileKeymap } from "./input/keymap.js";
import { MODES, RACE_MODES, findMode as findBaseMode } from "./modes/index.js";
import { dailyMode, dateKey, findDaily } from "./modes/daily.js";
import { decodeReplayCode, encodeReplayCode, replayLink } from "./replay/share.js";
import { createDailyUI } from "./ui/daily.js";
import { formatScore, formatTime } from "./modes/format.js";
import { clearName } from "./rules/scoring/guideline.js";
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
import { createBackup, parseBackup, restoreBackup } from "./storage/backup.js";
import { createFinesseTracker } from "./modes/finesse.js";
import { ROTATIONS } from "./rules/rotation/index.js";
import { WIN, exchangeGarbage, versusMode } from "./modes/versus.js";
import { createBot } from "./ai/bot.js";
import { createVersusUI } from "./ui/versus.js";
import { lang, t, translateDom } from "./i18n/index.js";

const FRAME_MS = 1000 / 60;
const MAX_CATCH_UP_MS = 250; // 시간이 크게 튀면(탭 복귀 등) 한꺼번에 따라잡지 않는다.
const READY_FRAMES = 40; // "READY"
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
};
applyScheme();

const renderer = createRenderer(canvas, { getVisual: () => settings.visual });
const sfx = createSfx({ getVolume: () => settings.volume });
const racePanel = $("race-panel");
const raceProgress = /** @type {HTMLProgressElement} */ ($("race-progress"));
const raceLabel = $("race-progress-label");
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
const findMode = id => findDaily(id) ?? findBaseMode(id);
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

const keysOf = id => settings.keymap[id] ?? [];

/** @type {ReturnType<typeof createGamepad> | null} 아래에서 만든 뒤 채운다 */
let padRef = null;
/** 게임패드 버튼 키캡(십자키는 화살표 아이콘) */
const padCap = i => {
  const kbd = document.createElement("kbd");
  kbd.className = "keycap";
  if (PAD_ICONS[i]) kbd.append(icon(PAD_ICONS[i], { label: padButtonName(i) }));
  else kbd.textContent = padButtonName(i);
  return kbd;
};

/** 안내 한 칸: 동작 이름 + 키캡들 */
const helpItem = (label, caps) => {
  const span = document.createElement("span");
  const name = document.createElement("span");
  name.className = "keys-label";
  name.textContent = label;
  span.append(name, ...caps);
  return span;
};

const textCap = text => {
  const kbd = document.createElement("kbd");
  kbd.className = "keycap";
  kbd.textContent = text;
  return kbd;
};

/** 키 안내. 지금 규칙에서 쓸 수 없는 동작(하드 드롭·홀드가 꺼진 규칙 등)은 뺀다. 키 이름은 키캡(화살표는 SVG). */
const renderKeyHelp = () => {
  const r = game?.rules ?? currentRules();
  const unavailable = new Set([...(r.hardDrop ? [] : ["HARD"]), ...(r.hold.enabled ? [] : ["HOLD"])]);
  const items = [icon("keyboard", { label: t("키보드") })];
  for (const a of ACTIONS) {
    if (unavailable.has(a.id) || !keysOf(a.id).length) continue;
    items.push(helpItem(a.label, keysOf(a.id).map(keycap)));
  }
  items.push(helpItem(t("메뉴·일시정지"), [textCap("Esc")]));
  if (padRef?.connected) {
    const br = document.createElement("span");
    br.className = "keys-break";
    items.push(br, icon("gamepad", { label: t("게임패드") }));
    for (const a of ACTIONS) {
      const buttons = settings.padmap[a.id] ?? [];
      if (unavailable.has(a.id) || !buttons.length) continue;
      items.push(helpItem(a.label, buttons.map(padCap)));
    }
  }
  $("key-help").replaceChildren(...items);
  // 버튼 안 단축키 표시는 첫 번째 키만
  for (const kbd of document.querySelectorAll("kbd[data-key]")) {
    const first = keysOf(kbd.getAttribute("data-key"))[0];
    kbd.replaceChildren(...(first ? [keycap(first)] : []));
  }
};

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
  if (!race) return;
  const p = mode.race.progress(race.player.game.state);
  raceProgress.max = p.max;
  raceProgress.value = p.value;
  raceLabel.textContent = race.player.done ? mode.formatRecord(race.target.best) : p.text;
};

const startRace = m => {
  const selected = currentRules();
  const target = raceTargetFor(m, selected);
  if (!target) return;
  let targetSplits = [];
  const verified = verifyReplay(target.replay, findMode, state => {
    if (m.splits) targetSplits = advanceSplits(m.splits, targetSplits, state.stats.lines, state.frame);
  });
  if (!verified.ok || verified.actual.over !== m.race.finish) {
    showMenuNotice(t("이 최고 기록은 현재 버전에서 재현할 수 없어요. 새 최고 기록이 필요해요."));
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
  const ruleSet = currentRules();
  renderRaceModes(ruleSet);
  const list = $("mode-list");
  list.replaceChildren(
    ...MODES.map((m, i) => {
      const best = records.best(m, ruleSet);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "menu-row";
      btn.dataset.mode = m.id;
      const index = document.createElement("span");
      index.className = "menu-index num";
      index.textContent = String(i + 1).padStart(2, "0");
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
      btn.append(index, text, pb, icon("chevron-right"));
      btn.addEventListener("click", () => start(m));
      return btn;
    }),
    versusRow(MODES.length + 1),
    dailyRow(MODES.length + 2)
  );
};

/** 첫 화면 모드 목록 끝의 CPU 대전 줄: 누르면 난이도를 고른다 */
const versusRow = n => {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "menu-row";
  btn.dataset.mode = "versus";
  const index = document.createElement("span");
  index.className = "menu-index num";
  index.textContent = String(n).padStart(2, "0");
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
  btn.append(index, text, pb, icon("chevron-right"));
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
const dailyRow = n => {
  const { key, best, mode: m } = today();
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "menu-row";
  btn.dataset.mode = "daily";
  const index = document.createElement("span");
  index.className = "menu-index num";
  index.textContent = String(n).padStart(2, "0");
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
  btn.append(index, text, pb, icon("chevron-right"));
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
  $("session-title").textContent = next === "menu" ? "" : mode.name;
};

const toMenu = (initial = false) => {
  confirming = null;
  game = null;
  race = null;
  racePanel.hidden = true;
  versus = null;
  versusPanel.hidden = true;
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
    cell.classList.toggle("is-off", !items.includes(item) || (replay && item === "split"));
  }
};

const start = (m, selectedRules = currentRules(), target = null) => {
  confirming = null;
  if (screen === "replay") stopReplay();
  mode = m;
  if (!m.practice) store.set("lastMode", m.id);
  rules = selectedRules;
  runPlayerName = records.playerName;
  const seed = target?.replay.seed ?? m.fixedSeed ?? (Math.random() * 2 ** 32) >>> 0;
  $("race-label").textContent = target?.friend ? t("{name}의 기록", { name: target.friend }) : t("내 최고 기록");
  race = target ? { target, player: createPlayer(target.replay, findMode) } : null;
  racePanel.hidden = !race;
  updateRaceProgress();
  game = createGame({ rules, handling: toEngineHandling(settings.handling), seed, mode: m });
  // 대전: CPU도 같은 시드(같은 블록 순서)로 시작한다. 상대와 함께라야 재현되므로 리플레이는 남기지 않는다.
  if (m.versus) {
    const cpu = createGame({ rules, seed, mode: m });
    versus = { cpu, bot: createBot({ game: cpu, rotation: ROTATIONS[rules.rotation], level: m.versus, seed }) };
    $("versus-name").textContent = t("CPU · {level}", { level: m.versus.name });
  } else versus = null;
  versusPanel.hidden = !versus;
  recorder = m.noReplay ? null : createRecorder({ seed, mode: m, rules, handling: game.handling });
  finesse = createFinesseTracker(game, ROTATIONS[rules.rotation]);
  splits = [];
  showModeHud(m);
  pbSplits = target?.splits ?? records.best(m, rules)?.splits;
  acc = 0;
  countdown = READY_FRAMES;
  goTimer = 0;
  showPanel(null);
  actionEl.classList.remove("is-shown");
  renderer.clearEffects();
  renderKeyHelp();
  setScreen("countdown");
  window.scrollTo(0, 0);
  countdownEl.hidden = false;
  countdownEl.dataset.phase = "ready";
  $("countdown-label").textContent = "READY";
  sfx.play("ready");
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
/** 게임이 진행 중(끝나지 않음)이라 버리면 잃는 게 있는가 */
const inProgress = () => screen === "play" || screen === "countdown" || screen === "paused";

const askConfirm = kind => {
  if (!inProgress()) return;
  pause();
  confirming = kind;
  const restart = kind === "restart";
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
  showPanel("pause");
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
    dailyUI.isOpen
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

  const { rows, slowest } = analyzeSplits(mode.splits, splits, pbSplits);
  $("results-split-rows").replaceChildren(
    ...rows.map(({ to, frames, delta }) => {
      const row = document.createElement("tr");
      for (const value of [
        t("{n}줄", { n: to }),
        formatTime(frames),
        formatDelta(delta === null ? null : delta / 60),
      ]) {
        row.insertCell().textContent = value;
      }
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
        ? t("같은 규칙의 최고 기록이 쌓이면 비교할 수 있어요.")
        : t("완료한 비교 구간에서 잃은 시간이 없어요.");
  $("results-split-note").textContent = note;
  details.querySelector("summary").textContent = slowest
    ? t("구간 기록 · {from}–{to}줄 확인", { from: slowest.from, to: slowest.to })
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
  lastReplay = recorder ? recorder.finish(state) : null;
  /** @type {HTMLButtonElement} */ for (const b of panels.results.querySelectorAll(
    '[data-action="watch"], [data-action="export"]'
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
  if (mode.splits) rows.push([t("PB 대비"), formatDelta(splitDelta(splits, pbSplits))]);
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

// ---- 액션 표시 (T-SPIN DOUBLE, B2B, 콤보, 퍼펙트 클리어, 레벨업) ----

const actionEl = $("action");
const announce = e => {
  /** @type {string[]} */
  let lines = [];
  if (e.type === "lock") {
    const name = clearName(e);
    const showName = e.tspin !== "none" || e.lines >= 4;
    if (e.perfect) lines.push("PERFECT CLEAR");
    if (e.b2b) lines.push("BACK-TO-BACK");
    if (showName && name) lines.push(name);
    if (e.combo >= 1) lines.push(`${e.combo} COMBO`);
    if (lines.length && e.points) lines.push(`+${formatScore(e.points)}`);
  } else if (e.type === "practice" && !e.reset) {
    lines = [e.success ? t("성공") : t("다시")];
  } else if (e.type === "levelUp") {
    lines = [`LEVEL ${e.level}`];
  }
  announceText(lines);
};

/** 보드 위에 큰 글씨로 잠깐 띄운다 */
const announceText = lines => {
  if (!lines.length) return;
  actionEl.replaceChildren(
    ...lines.map((text, i) => {
      const div = document.createElement("div");
      div.textContent = text;
      if (i === 0) div.className = "action-main";
      return div;
    })
  );
  // 애니메이션을 처음부터 다시 돌린다.
  actionEl.classList.remove("is-shown");
  void actionEl.offsetWidth;
  actionEl.classList.add("is-shown");
};

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

$("edit-rules").addEventListener("click", () => rulesUI.open());

const practiceUI = createPracticeUI({
  dialog: /** @type {HTMLDialogElement} */ ($("practice")),
  onPick: drill => start(practiceMode(drill)),
});
$("open-practice").addEventListener("click", () => practiceUI.open());
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
  if (screen === "results")
    /** @type {HTMLElement | null} */ (document.querySelector('[data-action="stats"]'))?.focus();
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

const handleSystem = action => {
  if (
    settingsUI.isOpen ||
    rulesUI.isOpen ||
    recordsUI.isOpen ||
    statsUI.isOpen ||
    practiceUI.isOpen ||
    versusUI.isOpen ||
    dailyUI.isOpen
  )
    return;
  if (screen === "replay") {
    if (action === "restart") restartReplay();
    else stopReplay();
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
  if (action !== "pause") return;
  if (screen === "play" || screen === "countdown") pause();
  else if (screen === "paused") resume();
  else if (screen === "results") toMenu();
};

const keyboard = createKeyboard({ getBindings: () => bindings, onSystem: handleSystem });
const touch = createTouch({ root: $("touchpad"), onSystem: handleSystem });

/** 터치 버튼 보이기: 설정 + 기기(굵은 포인터). 설정을 바꿀 때만 바뀐다(원칙 2). */
// 터치 화면 판정: 굵은 포인터이거나, 마우스 올리기가 없는 화면에서 터치를 지원할 때(iPhone 등)
const coarse = typeof matchMedia === "function" ? matchMedia("(pointer: coarse)") : null;
const noHover = typeof matchMedia === "function" ? matchMedia("(hover: none)") : null;
const isTouchScreen = () =>
  Boolean(coarse?.matches) || (Boolean(noHover?.matches) && (navigator.maxTouchPoints ?? 0) > 0);
const applyTouch = () => document.body.classList.toggle("touch-on", touchVisible(settings.touch, isTouchScreen()));
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
    dailyUI.isOpen
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

$("open-settings").addEventListener("click", () => {
  pause();
  settingsUI.open();
});

for (const btn of document.querySelectorAll("[data-action]")) {
  btn.addEventListener("click", () => {
    const action = btn.getAttribute("data-action");
    if (action === "resume") resume();
    if (action === "retry") start(mode, rules, race?.target);
    if (action === "menu") toMenu();
    if (action === "watch" && lastReplay) startReplay(lastReplay);
    if (action === "stats" && game) statsUI.open(game.state, `${mode.name} · ${rules.name}`);
    if (action === "export" && lastReplay) exportReplay(lastReplay);
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
let replayReturn = /** @type {{ screen: string, game: any, mode: any, rules: any }} */ ({});
const SPEEDS = [1, 2, 4];
const replayBar = $("replay-bar");
const replayStatus = $("replay-status");
const replayNote = $("replay-note");
const replayProgress = /** @type {HTMLProgressElement} */ ($("replay-progress"));
const replayTime = $("replay-time");
const replayStep = /** @type {HTMLButtonElement} */ (replayBar.querySelector('[data-replay="step"]'));
const replayToggle = /** @type {HTMLButtonElement} */ (replayBar.querySelector('[data-replay="toggle"]'));

const updateReplayProgress = () => {
  const frame = player?.frame ?? 0;
  const length = playing?.result?.frames ?? 0;
  replayProgress.max = length || 1;
  if (length) replayProgress.value = Math.min(frame, length);
  else replayProgress.removeAttribute("value");
  replayTime.textContent = length ? `${formatTime(frame)} / ${formatTime(length)}` : formatTime(frame);
};
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
  updateReplayProgress();
};

const startReplay = (replay, returnTo = screen, note = "") => {
  if (screen !== "replay") replayReturn = { screen: returnTo, game, mode, rules };
  playing = replay;
  player = createPlayer(replay, findMode);
  game = player.game;
  mode = player.mode;
  rules = replay.rules;
  replayPaused = false;
  acc = 0;
  renderer.clearEffects();
  actionEl.classList.remove("is-shown");
  countdownEl.hidden = true;
  showPanel(null);
  setScreen("replay");
  showModeHud(mode, true);
  replayBar.hidden = false;
  replayNote.textContent = note;
  $("replay-title").textContent = `${mode.name} · ${rules.name}`;
  updateReplayBar();
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
  } else {
    toMenu();
  }
};

const advanceReplay = count => {
  if (!player || player.done) return;
  for (let i = 0; i < count && !player.done; i++) {
    const events = player.step();
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
    e.repeat
  )
    return;
  if (e.code === "Space" && !replayBar.contains(document.activeElement)) replayPaused = !replayPaused;
  else if (["Digit1", "Digit2", "Digit4"].includes(e.code)) replaySpeed = Number(e.code.slice(5));
  else return;
  e.preventDefault();
  updateReplayBar();
});

/** JSON 값을 파일로 내려받게 한다 */
const downloadJson = (value, filename) => {
  const blob = new Blob([JSON.stringify(value)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

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
    showMenuNotice(t("읽을 수 없는 리플레이 파일이에요."));
    return false;
  }
  const check = verifyReplay(replay, findMode);
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
      showMenuNotice(t("파일을 읽지 못했어요. 다시 선택해 주세요."));
    return;
  }
  if (request === replayFileRequest && screen === "menu") openReplayText(text);
});

// ---- 저장 데이터 백업 ----

$("export-backup").addEventListener("click", () => {
  const backup = createBackup(store);
  downloadJson(backup, `tetri-sharp-backup-${backup.date.slice(0, 10).replace(/-/g, "")}.json`);
  showMenuNotice(t("설정·기록·리플레이를 백업 파일로 저장했어요."));
});

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

const backupInput = /** @type {HTMLInputElement} */ ($("backup-file"));
$("import-backup").addEventListener("click", () => backupInput.click());
backupInput.addEventListener("change", async () => {
  const file = backupInput.files?.[0];
  backupInput.value = "";
  if (!file || screen !== "menu") return;
  let parsed = null;
  try {
    parsed = parseBackup(JSON.parse(await file.text()), findMode);
  } catch {
    parsed = null;
  }
  if (!parsed) {
    showMenuNotice(t("읽을 수 없는 백업 파일이에요."));
    return;
  }
  const { records: count, replays: replayCount } = parsed.summary;
  const when = parsed.date ? ` (${parsed.date.slice(0, 10)})` : "";
  if (
    !window.confirm(
      t("백업{when}에는 기록 {records}개, 리플레이 {replays}개가 있어요.", {
        when,
        records: count,
        replays: replayCount,
      }) +
        "\n" +
        t("지금 이 브라우저의 설정·기록·리플레이를 백업 내용으로 바꿀까요?")
    )
  )
    return;
  const ok = restoreBackup(store, parsed);
  reloadFromStore();
  showMenuNotice(
    ok
      ? t("백업을 불러왔어요 · 기록 {records}개, 리플레이 {replays}개", { records: count, replays: replayCount })
      : t("일부를 저장하지 못했어요. 저장 공간을 확인해 주세요.")
  );
});

// ---- 루프 ----

const tick = () => {
  if (screen === "countdown") {
    keyboard.takePressed(); // 카운트다운 중 누른 키는 버린다(누르고 있는 키는 시작하자마자 반영).
    touch.takePressed();
    countdown -= 1;
    if (countdown <= 0) {
      setScreen("play");
      goTimer = GO_FRAMES;
      countdownEl.dataset.phase = "go";
      $("countdown-label").textContent = "GO!";
      sfx.play("go");
    }
    return;
  }
  if (screen === "replay") return tickReplay();
  if (screen !== "play" || !game) return;
  if (goTimer > 0 && --goTimer === 0) countdownEl.hidden = true;
  const held = keyboard.held | pad.held | touch.held;
  const pressed = keyboard.takePressed() | touch.takePressed();
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
  if (race && !race.player.done) {
    race.player.step();
    updateRaceProgress();
  }
  for (const e of events) announce(e);
  renderer.addEvents(events);
  sfx.events(events);
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
  requestAnimationFrame(loop);
};

/** 결과 링크(#daily=…)로 열었으면 오늘의 도전 창을 그 코드로 연다. 주소의 해시는 지운다. */
const importDailyFromLink = () => {
  if (!/[#&]daily=/.test(location.hash)) return;
  const pasted = location.hash.slice(1);
  try {
    history.replaceState(null, "", location.pathname + location.search);
  } catch {
    /* file:// 등에서 막혀도 괜찮다 */
  }
  dailyUI.open({
    pasted: `#${pasted}`,
    message: t("받은 결과가 있어요. 겨루기를 누르면 같은 블록 순서로 함께 달려요"),
  });
};

/** 공유 링크(#rules=…)로 열었으면 그 규칙을 Custom으로 들이고 알린다. 주소의 해시는 지운다. */
const importRulesFromLink = () => {
  if (!/[#&]rules=/.test(location.hash)) return false;
  const body = decodeRules(location.hash);
  try {
    history.replaceState(null, "", location.pathname + location.search);
  } catch {
    /* file:// 등에서 막혀도 괜찮다 */
  }
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
