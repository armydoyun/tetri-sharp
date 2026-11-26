import { createSfx, SOUND_SETS } from "../audio/sfx.js";
import { lang, t, translateDom } from "../i18n/index.js";
import { createThemeStage, drawThemeSwatch } from "../render/preview.js";
import { THEMES, THEME_IDS } from "../render/themes.js";
import { button, choiceCards, dropdown, rangeRow, segmented, setSegmented, slider } from "../ui/components.js";
import { el } from "../ui/dom.js";
import { CANDIDATES } from "./candidates.js";
import { CANDIDATE_SOUNDS } from "./sounds.js";

document.documentElement.lang = lang;
translateDom();

/** @param {string} id */
const node = id => document.getElementById(id);
/** @param {string} id */
const stageFor = id => createThemeStage(/** @type {HTMLCanvasElement} */ (node(id)));

const soundSets = { ...SOUND_SETS, ...CANDIDATE_SOUNDS };
const stages = [stageFor("candidate-board"), stageFor("reference-board")];
const cards = [node("candidate-card"), node("reference-card")];
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
let candidate = "porcelain";
let reference = CANDIDATES[candidate].reference;
let mode = "candidate";
let boardsPlaying = false;

const volume = slider({ id: "audition-volume", min: 0, max: 100, step: 1, value: 70 });
const volumeText = el("output", { class: "num", text: `${volume.value}%` });
volumeText.htmlFor.add(volume.id);
const sfx = createSfx({ sets: soundSets, getVolume: () => Number(volume.value) });
volume.addEventListener("input", () => {
  volumeText.textContent = `${volume.value}%`;
  sfx.setVolume();
  if (volume.value === "0") stop(t("음량이 0이에요."));
});
node("volume-control").append(
  el("label", { htmlFor: volume.id, text: t("음량") }),
  rangeRow(volume, volumeText, value => `${value}%`)
);

const status = node("play-status");
const ready = t("동작을 누르면 선택한 테마의 소리가 재생돼요.");
status.textContent = ready;

/** @type {number[]} */
let timers = [];
const stopButton = button({
  label: t("정지"),
  icon: "pause",
  disabled: true,
  onClick: () => stop(t("재생을 멈췄어요.")),
});

/**
 * @param {string} message
 * @param {number} [source] 보드 순서. 새 테마는 0, 기존 테마는 1.
 */
const showPlayback = (message, source = -1) => {
  status.textContent = message;
  status.dataset.playing = String(source >= 0);
  cards.forEach((card, i) => (card.dataset.playing = String(i === source)));
};

/** @param {string} [message] */
const stop = (message = ready) => {
  for (const timer of timers) clearTimeout(timer);
  timers = [];
  sfx.stop();
  stopButton.disabled = true;
  showPlayback(message);
};

/** @typedef {readonly [at: number, sound: string, mix?: number]} Cue */
/** @type {readonly Cue[]} */
const PLAY_SEQUENCE = [
  [0, "move"],
  [0.1, "move"],
  [0.2, "move"],
  [0.34, "rotate"],
  [0.51, "hold"],
  [0.74, "move"],
  [0.83, "rotate"],
  [1.04, "hardDrop", 0.42],
  [1.04, "clear2"],
  [1.6, "move"],
  [1.67, "move"],
  [1.74, "move"],
  [1.87, "rotate"],
  [2.08, "hardDrop", 0.42],
  [2.08, "tspin"],
  [2.08, "combo2"],
];

/** @param {string} set @param {readonly Cue[]} cues */
const durationOf = (set, cues) =>
  Math.max(
    ...cues.flatMap(([at, sound]) =>
      soundSets[set][sound].map(part => at + part.at + part.dur * (part.decay === "slow" ? 1.6 : 1) + 0.035)
    )
  );

/** @param {readonly Cue[]} cues @param {string} label */
const listen = (cues, label) => {
  stop();
  if (volume.value === "0") {
    showPlayback(t("음량이 0이에요."));
    return;
  }
  const sources = mode === "compare" ? [0, 1] : [mode === "reference" ? 1 : 0];
  const sets = [candidate, reference];
  let start = 0;
  for (const source of sources) {
    const set = sets[source];
    for (const [at, sound, mix] of cues) {
      if (!sfx.play(sound, mix, { set, delay: start + at })) {
        stop(t("이 브라우저에서 효과음을 재생할 수 없어요."));
        return;
      }
    }
    const theme = source === 0 ? CANDIDATES[candidate].theme : THEMES[reference];
    const message = t("{theme} · {sound} 재생 중", { theme: theme.name, sound: label });
    if (start === 0) showPlayback(message, source);
    else timers.push(window.setTimeout(() => showPlayback(message, source), start * 1000));
    start += durationOf(set, cues) + (source === sources.at(-1) ? 0.14 : 0.28);
  }
  stopButton.disabled = false;
  timers.push(window.setTimeout(() => stop(t("재생 완료")), start * 1000));
};

const modeControl = segmented({
  id: "audition-mode",
  label: t("들을 테마"),
  options: [
    ["candidate", t("새 테마")],
    ["reference", t("기존 테마")],
    ["compare", t("A/B 비교")],
  ],
  value: mode,
  arrows: true,
  onChange: value => {
    stop();
    mode = value;
    setSegmented(modeControl, mode);
  },
});
node("listen-mode").append(modeControl);
node("listen-actions").append(
  button({
    label: t("연속 재생"),
    icon: "play",
    variant: "primary",
    onClick: () => listen(PLAY_SEQUENCE, t("연속 재생")),
  }),
  stopButton
);

const groups = [
  {
    title: t("기본 조작"),
    sounds: [
      ["move", t("이동")],
      ["rotate", t("피스 회전")],
      ["hold", t("홀드")],
      ["hardDrop", t("하드 드롭")],
      ["kick", t("벽 차기")],
      ["lock", t("착지")],
    ],
  },
  {
    title: t("줄 삭제"),
    sounds: [
      ["clear1", t("1줄")],
      ["clear2", t("2줄")],
      ["clear3", t("3줄")],
      ["quad", t("4줄")],
    ],
  },
  {
    title: t("특수 효과음"),
    sounds: [
      ["tspin", t("T스핀")],
      ["combo3", t("콤보 3")],
      ["garbage", t("가비지")],
      ["gameOver", t("게임 오버")],
    ],
  },
];
for (const { title, sounds } of groups) {
  node("sound-groups").append(
    el(
      "div",
      { class: "audition-sound-group" },
      el("h3", { text: title }),
      el(
        "div",
        { class: "audition-event-grid" },
        ...sounds.map(([sound, label]) =>
          button({ label, wrap: true, size: "s", "data-sound": sound, onClick: () => listen([[0, sound]], label) })
        )
      )
    )
  );
}

/** @param {boolean} playing */
const setBoardsPlaying = playing => {
  boardsPlaying = playing;
  boardControl.setAttribute("aria-pressed", String(playing));
  boardControl.classList.toggle("btn-primary", playing);
  for (const stage of stages) {
    if (playing) stage.play();
    else stage.stop();
  }
};

const boardControl = button({
  label: t("보드 동작 보기"),
  icon: "play",
  size: "s",
  "aria-pressed": "false",
  onClick: () => setBoardsPlaying(!boardsPlaying),
});
node("board-controls").append(boardControl);

/** @param {typeof stages[number]} stage @param {ReturnType<typeof import("../render/themes.js").makeTheme>} theme */
const draw = (stage, theme) => {
  stage.show(theme, theme.palette, {
    theme: "modern",
    effects: reduceMotion.matches ? "reduced" : "full",
    palette: "theme",
  });
};

const drawBoards = () => {
  const { theme, sound } = CANDIDATES[candidate];
  node("candidate-name").textContent = theme.name;
  node("candidate-desc").textContent = `${theme.description} · ${sound}`;
  node("reference-desc").textContent = THEMES[reference].description;
  draw(stages[0], theme);
  draw(stages[1], THEMES[reference]);
};

const referencePicker = dropdown({
  id: "audition-reference",
  label: t("비교할 기존 테마"),
  options: THEME_IDS.map(id => ({ value: id, label: THEMES[id].name })),
  value: reference,
  onChange: value => {
    stop();
    reference = value;
    drawBoards();
  },
});
referencePicker.querySelector(".select-value").id = "reference-value";
referencePicker.setAttribute("aria-labelledby", "reference-title reference-value");
node("reference-picker").append(referencePicker);

const choices = choiceCards({
  id: "audition-candidates",
  label: t("새 테마"),
  compact: true,
  options: Object.entries(CANDIDATES).map(([value, { theme }]) => {
    const preview = el("canvas", { class: "audition-swatch", "aria-hidden": "true" });
    drawThemeSwatch(preview, theme, theme.palette);
    return { value, title: theme.name, preview };
  }),
  value: candidate,
  onChange: value => {
    if (candidate === value) return;
    stop();
    candidate = value;
    setSegmented(choices, candidate);
    const nextReference = CANDIDATES[value].reference;
    if (reference === nextReference) drawBoards();
    else referencePicker.setValue(nextReference);
  },
});
node("candidates").append(choices);
reduceMotion.addEventListener("change", drawBoards);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    stop();
    setBoardsPlaying(false);
  }
});
drawBoards();
