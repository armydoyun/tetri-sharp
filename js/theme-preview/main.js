import { createSfx, SOUND_SETS } from "../audio/sfx.js";
import { lang, t, translateDom } from "../i18n/index.js";
import { createThemeStage, drawThemeSwatch } from "../render/preview.js";
import { ADDITIONAL_THEMES, ORIGINAL_THEMES, THEMES } from "../render/themes.js";
import { button, choiceCards, dropdown, rangeRow, segmented, setSegmented, slider } from "../ui/components.js";
import { el } from "../ui/dom.js";
import { MOTION_SAMPLES, motionSounds, playMotionSample } from "./motion-scenes.js";

document.documentElement.lang = lang;
translateDom();

/** @param {string} id */
const node = id => document.getElementById(id);
/** @param {string} id */
const stageFor = id => createThemeStage(/** @type {HTMLCanvasElement} */ (node(id)));

const stages = [stageFor("candidate-board"), stageFor("reference-board")];
const cards = [node("candidate-card"), node("reference-card")];
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
const originalIds = Object.keys(ORIGINAL_THEMES);
const catalog = {
  new: ADDITIONAL_THEMES,
  existing: Object.fromEntries(originalIds.map(id => [id, { reference: id, theme: THEMES[id] }])),
};
const selected = { new: "porcelain", existing: "modern" };
let category = "new";
const selectedPreview = () => catalog[category][selected[category]];
let reference = selectedPreview().reference;
let mode = "candidate";
let boardsPlaying = false;
let playingVisuals = false;

const volume = slider({ id: "audition-volume", min: 0, max: 100, step: 1, value: 70 });
const volumeText = el("output", { class: "num", text: `${volume.value}%` });
volumeText.htmlFor.add(volume.id);
const sfx = createSfx({ getVolume: () => Number(volume.value) });
volume.addEventListener("input", () => {
  volumeText.textContent = `${volume.value}%`;
  sfx.setVolume();
  if (volume.value === "0" && !playingVisuals) stop(t("음량이 0이에요."));
});
node("volume-control").append(
  el("label", { htmlFor: volume.id, text: t("음량") }),
  rangeRow(volume, volumeText, value => `${value}%`)
);

const status = node("play-status");
const ready = t("동작을 눌러 선택한 테마를 미리 보세요.");
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
 * @param {number} [source] 보드 순서. 견본은 0, 원본은 1.
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
  playingVisuals = false;
  sfx.stop();
  if (!boardsPlaying) for (const stage of stages) stage.stop();
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

const CLEAR_SOUNDS = { clear1: 1, clear2: 2, clear3: 3, quad: 4, tspin: 2 };

/** @param {number} delay @param {() => void} action */
const schedule = (delay, action) => {
  if (delay === 0) action();
  else timers.push(window.setTimeout(action, delay * 1000));
};

/** @param {string} set @param {readonly Cue[]} cues */
const durationOf = (set, cues) =>
  Math.max(
    0,
    ...cues.flatMap(([at, sound]) =>
      SOUND_SETS[set][sound].map(part => at + part.at + part.dur * (part.decay === "slow" ? 1.6 : 1) + 0.035)
    )
  );

/** @param {readonly Cue[]} cues @param {string} label @param {keyof typeof MOTION_SAMPLES} [sampleId] */
const listen = (cues, label, sampleId) => {
  stop();
  const visuals = cues.filter(([, sound]) => Object.hasOwn(CLEAR_SOUNDS, sound));
  const muted = volume.value === "0";
  const sample = sampleId && MOTION_SAMPLES[sampleId];
  playingVisuals = Boolean(sample || visuals.length);
  if (muted && !playingVisuals) {
    showPlayback(t("음량이 0이에요."));
    return;
  }
  if (playingVisuals && boardsPlaying) setBoardsPlaying(false);
  const sources = mode === "compare" ? [0, 1] : [mode === "reference" ? 1 : 0];
  const sets = [selected[category], reference];
  let start = 0;
  for (const source of sources) {
    const set = sets[source];
    const theme = source === 0 ? selectedPreview().theme : ORIGINAL_THEMES[reference];
    for (const [at, sound, mix] of cues) {
      if (!muted && !sfx.play(sound, mix, { set, delay: start + at }) && !playingVisuals) {
        stop(t("이 브라우저에서 효과음을 재생할 수 없어요."));
        return;
      }
    }
    const name =
      sets[0] === sets[1] ? t(source === 0 ? "{theme} 견본" : "{theme} 원본", { theme: theme.name }) : theme.name;
    const message = t("{theme} · {sound} 재생 중", { theme: name, sound: label });
    schedule(start, () => showPlayback(message, source));
    let visualEnd = 0;
    if (sample) {
      schedule(start, () => playMotionSample(stages[source], sampleId, set, theme, reduceMotion.matches));
      visualEnd = (sample.end - sample.start) / 1000;
    } else if (visuals.length) {
      for (const [at, sound] of visuals)
        schedule(start + at, () => stages[source].playClear(CLEAR_SOUNDS[sound], sound === "tspin"));
      visualEnd = visuals.at(-1)[0] + (Math.max(200, theme.motion.clearMs) + 170) / 1000;
    }
    start += Math.max(visualEnd, durationOf(set, cues)) + (source === sources.at(-1) ? 0.14 : 0.28);
  }
  stopButton.disabled = false;
  timers.push(window.setTimeout(() => stop(t("재생 완료")), start * 1000));
};

const modeControl = segmented({
  id: "audition-mode",
  label: t("재생할 보드"),
  options: [
    ["candidate", t("견본")],
    ["reference", t("원본")],
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
  })
);

/** @type {readonly (readonly [keyof typeof MOTION_SAMPLES, string])[]} */
const motionActions = [
  ["flow", t("플레이 흐름")],
  ["next", t("다음 피스 등장")],
  ["hold", t("홀드 교환")],
  ["spin", t("T스핀 회전 강조")],
  ["perfect", t("퍼펙트 클리어")],
  ["combo", t("콤보 표시")],
];
/** @type {typeof motionActions} */
const situationActions = [
  ["danger", t("위험 진입·해제")],
  ["kick", t("벽 차기 접촉선")],
  ["cancel", t("가비지 상쇄")],
  ["record", t("개인 기록 추월")],
];

/** @param {typeof motionActions} actions */
const sampleButtons = actions =>
  actions.map(([id, label]) =>
    button({
      label,
      icon: id === "flow" ? "play" : undefined,
      variant: id === "flow" ? "primary" : "default",
      size: "s",
      wrap: true,
      "data-motion": id,
      onClick: () => listen(motionSounds(id), label, id),
    })
  );
node("motion-actions").append(...sampleButtons(motionActions), stopButton);
node("situation-actions").append(...sampleButtons(situationActions));

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
    title: t("줄 삭제 연출"),
    target: "clear-actions",
    sounds: [
      ["clear1", t("1줄")],
      ["clear2", t("2줄")],
      ["clear3", t("3줄")],
      ["quad", t("4줄")],
      ["tspin", t("T스핀")],
    ],
  },
  {
    title: t("특수 효과음"),
    sounds: [
      ["combo3", t("콤보 3")],
      ["garbage", t("가비지")],
      ["gameOver", t("게임 오버")],
    ],
  },
];
for (const { title, sounds, target = "sound-groups" } of groups) {
  node(target).append(
    el(
      "div",
      { class: "audition-sound-group" },
      el("h3", { text: title }),
      el(
        "div",
        { class: "audition-event-grid" },
        ...sounds.map(([sound, label]) =>
          button({
            label,
            wrap: true,
            size: "s",
            "data-sound": sound,
            onClick: () => listen([[0, sound]], label, sound === "tspin" ? "spinClear" : undefined),
          })
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
  onClick: () => {
    stop();
    setBoardsPlaying(!boardsPlaying);
  },
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
  const { theme, sound } = selectedPreview();
  node("candidate-name").textContent = theme.name;
  node("candidate-desc").textContent = sound ? `${theme.description} · ${sound}` : theme.description;
  node("reference-desc").textContent = ORIGINAL_THEMES[reference].description;
  draw(stages[0], theme);
  draw(stages[1], ORIGINAL_THEMES[reference]);
};

const referencePicker = dropdown({
  id: "audition-reference",
  label: t("비교할 기존 테마"),
  options: originalIds.map(id => ({ value: id, label: ORIGINAL_THEMES[id].name })),
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

const updateReference = () => {
  const nextReference = selectedPreview().reference;
  if (reference === nextReference) drawBoards();
  else referencePicker.setValue(nextReference);
};

const drawChoices = () => {
  const choices = choiceCards({
    id: "audition-candidates",
    label: t("테마 목록"),
    compact: true,
    options: Object.entries(catalog[category]).map(([value, { theme }]) => {
      const preview = el("canvas", { class: "audition-swatch", "aria-hidden": "true" });
      drawThemeSwatch(preview, theme, theme.palette);
      return { value, title: theme.name, preview };
    }),
    value: selected[category],
    onChange: value => {
      if (selected[category] === value) return;
      stop();
      selected[category] = value;
      setSegmented(choices, value);
      updateReference();
    },
  });
  node("candidates").replaceChildren(choices);
};

const categoryControl = segmented({
  label: t("테마 종류"),
  options: [
    ["new", t("새 테마")],
    ["existing", t("기존 테마")],
  ],
  value: category,
  arrows: true,
  onChange: value => {
    if (category === value) return;
    stop();
    category = value;
    setSegmented(categoryControl, value);
    drawChoices();
    updateReference();
  },
});
node("theme-category").append(categoryControl);
drawChoices();
reduceMotion.addEventListener("change", drawBoards);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    stop();
    setBoardsPlaying(false);
  }
});
drawBoards();
