// 진입점: 화면 흐름(메뉴 → 카운트다운 → 플레이 → 결과), 게임 루프, 입력, 설정, 기록을 연결한다.
// 로직은 고정 60Hz로 진행하고 화면은 모니터 주사율대로 그린다.
import { createGame } from "./core/engine.js";
import { createRenderer } from "./render/canvas.js";
import { createKeyboard } from "./input/keyboard.js";
import { ACTIONS, compileKeymap, keyLabel } from "./input/keymap.js";
import { MODES, findMode } from "./modes/index.js";
import { formatScore, formatTime } from "./modes/format.js";
import { clearName } from "./rules/scoring/guideline.js";
import { createStore } from "./storage/store.js";
import { loadSettings, sanitizeSettings, saveSettings, toEngineHandling } from "./storage/settings.js";
import { createRecords } from "./storage/records.js";
import { createSettingsUI } from "./ui/settings.js";
import { createRulesUI } from "./ui/rules.js";
import { MODERN, PRESETS, PRESET_LIST } from "./rules/presets.js";
import { makeCustomRules, sanitizeRuleBody } from "./rules/sanitize.js";

const FRAME_MS = 1000 / 60;
const MAX_CATCH_UP_MS = 250; // 시간이 크게 튀면(탭 복귀 등) 한꺼번에 따라잡지 않는다.
const READY_FRAMES = 40; // "READY"
const GO_FRAMES = 20; // "GO!" — 이 동안에는 이미 플레이 중

const $ = id => /** @type {HTMLElement} */ (document.getElementById(id));
const canvas = /** @type {HTMLCanvasElement} */ ($("board"));
const panels = { menu: $("menu"), pause: $("pause"), results: $("results") };
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
};

const store = createStore();
const records = createRecords(store);
let settings = loadSettings(store);
let bindings = compileKeymap(settings.keymap);

const renderer = createRenderer(canvas, { getVisual: () => settings.visual });

/** @type {"menu" | "countdown" | "play" | "paused" | "results"} */
let screen = "menu";
let mode = findMode(store.get("lastMode", null));

// ---- 규칙 선택 (Modern / Retro / Arcade / Custom) ----

const RULE_CHOICES = [...PRESET_LIST.map(p => p.id), "custom"];
let ruleChoice = RULE_CHOICES.includes(store.get("lastRules", null)) ? store.get("lastRules", null) : "modern";
let customBody = sanitizeRuleBody(store.get("customRules", MODERN));
/** 지금 고른 규칙 */
const currentRules = () => (ruleChoice === "custom" ? makeCustomRules(customBody) : PRESETS[ruleChoice]);
/** 이번 판에 쓰는 규칙(게임 중에 Custom을 고쳐도 이번 판 기록은 시작할 때 규칙으로 남는다) */
let rules = currentRules();
/** @type {ReturnType<typeof createGame> | null} */
let game = null;
let countdown = 0;
let goTimer = 0;
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

const keysFor = id => (settings.keymap[id] ?? []).map(keyLabel).join("/");

const renderKeyHelp = () => {
  const parts = ACTIONS.map(a => (keysFor(a.id) ? `${a.label} ${keysFor(a.id)}` : null)).filter(Boolean);
  $("key-help").textContent = [...parts, "메뉴·일시정지 Esc"].join(" · ");
  for (const kbd of document.querySelectorAll("kbd[data-key]")) kbd.textContent = keysFor(kbd.getAttribute("data-key"));
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
        /** @type {HTMLElement | null} */ (tabs.querySelector(`[data-rules="${id}"]`))?.focus();
      });
      return b;
    })
  );
  $("edit-rules").hidden = ruleChoice !== "custom";
};

const renderMenu = () => {
  renderRuleTabs();
  const ruleSet = currentRules();
  const list = $("mode-list");
  list.replaceChildren(
    ...MODES.map(m => {
      const best = records.best(m, ruleSet);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "mode-card";
      btn.dataset.mode = m.id;
      const name = document.createElement("strong");
      name.textContent = m.name;
      const desc = document.createElement("small");
      desc.textContent = m.description;
      const pb = document.createElement("small");
      pb.className = "mode-best";
      pb.textContent = best ? `최고 기록 ${m.formatRecord(best)}` : "기록 없음";
      btn.append(name, desc, pb);
      btn.addEventListener("click", () => start(m));
      return btn;
    })
  );
};

const updateHud = () => {
  const frame = game?.state.frame ?? 0;
  const stats = game?.state.stats ?? { pieces: 0, lines: 0 };
  const lines = game ? mode.hudLines(game.state) : { label: "줄", value: "0" };
  const time = game ? mode.hudTime(game.state) : { label: "시간", frames: 0 };
  hud.timeLabel.textContent = time.label;
  hud.time.textContent = formatTime(time.frames);
  hud.score.textContent = formatScore(game?.state.score ?? 0);
  hud.level.textContent = game ? (mode.hudLevel?.(game.state) ?? String(game.state.level)) : "1";
  hud.linesLabel.textContent = lines.label;
  hud.lines.textContent = lines.value;
  hud.pieces.textContent = String(stats.pieces);
  hud.pps.textContent = frame ? (stats.pieces / (frame / 60)).toFixed(2) : "0.00";
};

// ---- 화면 흐름 ----

const setScreen = next => {
  screen = next;
  keyboard.setEnabled(next === "play" || next === "countdown");
};

const toMenu = () => {
  game = null;
  setScreen("menu");
  countdownEl.hidden = true;
  renderMenu();
  showPanel("menu");
  // 마지막으로 한 모드에 포커스를 둔다 → Enter로 바로 시작.
  /** @type {HTMLElement | null} */ (panels.menu.querySelector(`[data-mode="${mode.id}"]`))?.focus();
};

const start = m => {
  mode = m;
  store.set("lastMode", m.id);
  rules = currentRules();
  game = createGame({
    rules,
    handling: toEngineHandling(settings.handling),
    seed: (Math.random() * 2 ** 32) >>> 0,
    mode: m,
  });
  acc = 0;
  countdown = READY_FRAMES;
  goTimer = 0;
  showPanel(null);
  actionEl.classList.remove("is-shown");
  renderer.clearEffects();
  setScreen("countdown");
  countdownEl.hidden = false;
  countdownEl.textContent = "READY";
};

let pausedFrom = /** @type {"play" | "countdown"} */ ("play");

const pause = () => {
  if (screen !== "play" && screen !== "countdown") return;
  pausedFrom = screen;
  setScreen("paused");
  showPanel("pause");
};

const resume = () => {
  if (screen !== "paused") return;
  showPanel(null);
  setScreen(pausedFrom);
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
      date: new Date().toISOString(),
    });
  }
  const best = records.best(mode, rules);

  $("results-mode").textContent = `${mode.name} · ${rules.name}`;
  const summary = mode.summary(state);
  $("results-title").textContent = summary.title;
  $("results-main").textContent = summary.main;
  $("results-badge").hidden = !outcome?.isBest;

  const seconds = state.frame / 60;
  const rows = [
    ["시간", formatTime(state.frame)],
    ["점수", formatScore(state.score)],
    ["레벨", String(state.level)],
    ["줄", String(state.stats.lines)],
    ["피스", String(state.stats.pieces)],
    ["PPS", seconds ? (state.stats.pieces / seconds).toFixed(2) : "0.00"],
    ["최고 기록", best ? mode.formatRecord(best) : "—"],
  ];
  if (outcome && !outcome.isBest && outcome.rank < 10) rows.push(["순위", `${outcome.rank + 1}위`]);
  $("results-stats").replaceChildren(
    ...rows.flatMap(([k, v]) => {
      const dt = document.createElement("dt");
      dt.textContent = k;
      const dd = document.createElement("dd");
      dd.textContent = v;
      return [dt, dd];
    })
  );
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
  } else if (e.type === "levelUp") {
    lines = [`LEVEL ${e.level}`];
  }
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
    game?.setHandling(toEngineHandling(settings.handling));
    renderKeyHelp();
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
    customBody = sanitizeRuleBody(body);
    store.set("customRules", customBody);
  },
  onClose: () => {
    renderMenu();
    /** @type {HTMLElement | null} */ ($("edit-rules"))?.focus();
  },
});

$("edit-rules").addEventListener("click", () => rulesUI.open());

const keyboard = createKeyboard({
  getBindings: () => bindings,
  onSystem: action => {
    if (settingsUI.isOpen || rulesUI.isOpen) return;
    if (action === "restart" && screen !== "menu") return start(mode);
    if (action !== "pause") return;
    if (screen === "play" || screen === "countdown") pause();
    else if (screen === "paused") resume();
    else if (screen === "results") toMenu();
  },
});

$("open-settings").addEventListener("click", () => {
  pause();
  settingsUI.open();
});

for (const btn of document.querySelectorAll("[data-action]")) {
  btn.addEventListener("click", () => {
    const action = btn.getAttribute("data-action");
    if (action === "resume") resume();
    if (action === "retry") start(mode);
    if (action === "menu") toMenu();
  });
}

// 창이 포커스를 잃으면 keyup을 못 받는다 → 자동 일시정지.
window.addEventListener("blur", pause);
document.addEventListener("visibilitychange", () => document.hidden && pause());

// ---- 루프 ----

const tick = () => {
  if (screen === "countdown") {
    keyboard.takePressed(); // 카운트다운 중 누른 키는 버린다(누르고 있는 키는 시작하자마자 반영).
    countdown -= 1;
    if (countdown <= 0) {
      setScreen("play");
      goTimer = GO_FRAMES;
      countdownEl.textContent = "GO!";
    }
    return;
  }
  if (screen !== "play" || !game) return;
  if (goTimer > 0 && --goTimer === 0) countdownEl.hidden = true;
  const events = game.step({ held: keyboard.held, pressed: keyboard.takePressed() });
  for (const e of events) announce(e);
  renderer.addEvents(events);
  if (events.some(e => e.type === "gameOver" || e.type === "finish")) finish();
};

const loop = now => {
  acc += Math.min(now - last, MAX_CATCH_UP_MS);
  last = now;
  if (screen !== "play" && screen !== "countdown") acc = 0;
  while (acc >= FRAME_MS) {
    tick();
    acc -= FRAME_MS;
  }
  renderer.draw(game);
  updateHud();
  requestAnimationFrame(loop);
};

renderKeyHelp();
toMenu();
requestAnimationFrame(loop);

// 브라우저 테스트가 "앱이 끝까지 떴는지" 확인하는 표시.
document.documentElement.dataset.ready = "1";
