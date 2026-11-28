// 장면 연습: 리플레이의 한 장면을 그 자리에서 다시 해 본다.
//  - 구간 연습(Sprint 구간을 원래 시간과 비교), 피네스 장면 연습(점선 칸에 더 적은 입력으로), Survival 구조 연습(막히기 전부터 다시)
// 리플레이 재생기(js/app/replay-player.js)에서 들어오고 끝나면 그 자리로 돌아간다. 판 상태는 main.js의 session으로 함께 쓴다.
import {
  createSceneAttempt,
  createSurvivalAttempt,
  findSurvivalRescue,
  splitAttemptOutcome,
} from "../replay/practice.js";
import { createFinesseTracker } from "../modes/finesse.js";
import { formatTime } from "../modes/format.js";
import { ROTATIONS } from "../rules/rotation/index.js";
import { toEngineHandling } from "../storage/settings.js";
import { t } from "../i18n/index.js";

const $ = id => /** @type {HTMLElement} */ (document.getElementById(id));

/** @typedef {{from: number, to: number, endFrame: number}} SceneSplit */
/** @typedef {import("../replay/analyze.js").FinesseScene} FinesseScene */
/**
 * 연습 중인 장면
 * @typedef {{ spawnFrame: number, split: SceneSplit | null, target: FinesseScene | null, rescue: any, startFrame: number, best: number | null, ended: boolean }} Scene
 */

/**
 * @param {{
 *   session: { game: any, mode: any, rules: any, goTimer: number, readonly restoring: boolean, resetClock: () => void },
 *   replayView: ReturnType<typeof import("./replay-player.js").createReplayPlayer>,
 *   findMode: (id: string) => any,
 *   panels: Record<string, HTMLElement>,
 *   countdownEl: HTMLElement,
 *   renderer: any,
 *   fb: any,
 *   sfx: any,
 *   inputDisplay: any,
 *   input: { keyboard: any, touch: any, gestures: any },
 *   getSettings: () => any,
 *   getLastReplay: () => any,
 *   journal: { begin: (seed: number, target: any, scene: any) => void, save: () => void, clear: () => void },
 *   replacesSavedRun: () => boolean,
 *   confirmReplaceRun: (then: () => void) => void,
 *   showPanel: (name: string | null) => void,
 *   setScreen: (screen: string) => void,
 *   showModeHud: (mode: any, replay?: boolean) => void,
 *   updateBackLabels: () => void,
 *   feedback: (events: any[]) => void,
 *   pause: () => void,
 * }} deps
 */
export const createScenePractice = deps => {
  const { session, replayView, findMode, panels, renderer, fb, inputDisplay, journal } = deps;

  /** @type {Scene | null} */
  let scene = null;
  /** 피네스 장면 연습의 입력 세기 */
  let finesse = null;

  const sceneControls = $("scene-practice-controls");
  const sceneStatus = $("scene-practice-status");
  const pauseResume = /** @type {HTMLButtonElement} */ (panels.pause.querySelector('[data-action="resume"]'));
  const sceneSplitProgress = $("scene-split-progress");
  const sceneSplitMeter = /** @type {HTMLProgressElement} */ ($("scene-split-meter"));

  const updateSplitProgress = state => {
    const split = scene.split;
    const cleared = Math.min(state.stats.lines, split.to);
    $("scene-split-lines").textContent = t("{n} / {goal}줄", { n: cleared, goal: split.to });
    $("scene-split-elapsed").textContent = formatTime(state.frame - scene.startFrame);
    sceneSplitMeter.value = cleared - split.from;
  };

  const showSplitOutcome = outcome => {
    const { split } = scene;
    const { delta, frames, original } = outcome;
    if (delta !== null) scene.best = Math.min(scene.best ?? frames, frames);
    $("scene-result-range").textContent = t("{from}–{to}줄 구간", split);
    $("scene-result-title").textContent = delta === null ? t("구간 미완료") : t("구간 완료");
    $("scene-result-original").textContent = formatTime(original);
    $("scene-result-attempt").textContent = delta === null ? "—" : formatTime(frames);
    const feedback = $("scene-result-delta");
    feedback.dataset.comparison = delta === null ? "incomplete" : delta < 0 ? "faster" : delta > 0 ? "slower" : "even";
    feedback.textContent =
      delta === null
        ? t("목표 {goal}줄 중 {n}줄까지 도달했어요.", { goal: split.to, n: session.game.state.stats.lines })
        : delta === 0
          ? t("원래 판과 같은 시간이에요.")
          : t(delta < 0 ? "원래 판보다 {time}초 단축" : "원래 판보다 {time}초 느림", {
              time: (Math.abs(delta) / 60).toFixed(2),
            });
    $("scene-result-best").textContent =
      scene.best === null ? "" : t("이번 연습 최고 · {time}", { time: formatTime(scene.best) });
  };

  const showFinesseOutcome = (lock, inputs) => {
    const target = scene.target;
    const same =
      lock?.piece === target.piece &&
      target.cells.every(([x, y]) => lock.cells.some(([cx, cy]) => cx === x && cy === y));
    const delta = target.inputs - inputs;
    $("scene-result-range").textContent = t("{piece} 피네스 연습", { piece: target.piece });
    $("scene-result-title").textContent = same ? t("성공!") : t("실패");
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
    const { game } = session;
    const { originalFrame, originalBlocked } = scene.rescue;
    const delta = game.state.frame - originalFrame;
    $("scene-result-range").textContent = t("Survival 구조 연습");
    $("scene-result-title").textContent = delta > 0 ? t("더 버텼어요") : delta < 0 ? t("덜 버텼어요") : t("같은 시간");
    $("scene-result-original").textContent = formatTime(originalFrame - scene.startFrame);
    $("scene-result-attempt").textContent = formatTime(game.state.frame - scene.startFrame);
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

  const title = () =>
    scene.rescue
      ? t("Survival 구조 연습")
      : scene.target
        ? t("피네스 장면 연습")
        : scene.split
          ? t("구간 연습")
          : t("장면 연습");
  const retryLabel = () => (scene.split ? t("구간 재시도") : t("장면 재시도"));

  /** 일시정지 카드의 단추 이름: 장면 연습 중이면 재시도·리플레이로, 아니면 원래대로 */
  const setPauseLabels = () => {
    const ended = Boolean(scene?.ended);
    pauseResume.disabled = ended;
    panels.pause.querySelector(".panel-title").textContent = ended ? t("장면 연습 종료") : t("일시정지");
    panels.pause.querySelector('[data-action="retry"] .btn-label').textContent = scene ? retryLabel() : t("다시 시작");
    if (scene) panels.pause.querySelector('[data-action="menu"] .btn-label').textContent = t("리플레이로");
    else deps.updateBackLabels();
  };

  /** 같은 장면을 처음부터 다시(이어서 하기로 되살릴 때는 restored) */
  const reset = (restored = null) => {
    if (!scene) return;
    const playing = replayView.playing;
    const attempt = scene.rescue
      ? createSurvivalAttempt(playing, findMode, scene.spawnFrame)
      : createSceneAttempt(playing, findMode, scene.spawnFrame);
    const split = scene.split;
    if (
      !attempt ||
      (split &&
        (attempt.state.stats.lines < split.from ||
          attempt.state.stats.lines >= split.to ||
          attempt.state.frame >= split.endFrame))
    ) {
      exit();
      replayView.setNote(t("이 장면을 연습할 수 없어요. 다른 위치를 선택해 주세요."));
      return;
    }
    session.game = attempt;
    const game = attempt;
    const target = scene.target;
    if (target) game.state.finesseTarget = target.cells;
    finesse = target ? createFinesseTracker(game, ROTATIONS[session.rules.rotation]) : null;
    scene.startFrame = game.state.frame;
    scene.ended = false;
    if (!scene.rescue) game.setHandling(toEngineHandling(restored?.handling ?? deps.getSettings().handling));
    deps.input.keyboard.releaseAll();
    deps.input.touch.releaseAll();
    deps.input.gestures.setEnabled(false);
    session.resetClock();
    session.goTimer = 0;
    deps.countdownEl.hidden = true;
    fb.clearAction();
    renderer.clearEffects();
    inputDisplay.show(0, 0);
    deps.showPanel(null);
    deps.setScreen("play");
    deps.showModeHud(scene.rescue ? session.mode : { hud: [] });
    setPauseLabels();
    sceneControls.querySelector('[data-action="scene-retry"] .btn-label').textContent = retryLabel();
    sceneStatus.textContent = target
      ? t("점선 칸에 맞춘 뒤 하드 드롭하세요.")
      : split
        ? t("{from}–{to}줄 구간", split)
        : t("연습 시작점 · {time}", { time: formatTime(scene.spawnFrame) });
    if (!session.restoring) {
      journal.begin(playing.seed, null, {
        source: playing,
        returnFrame: replayView.player.frame,
        spawnFrame: scene.spawnFrame,
        split: scene.split,
        target: scene.target,
        rescue: scene.rescue,
        best: scene.best,
      });
      journal.save();
    }
    sceneSplitProgress.hidden = !split;
    if (split) {
      sceneSplitMeter.max = split.to - split.from;
      updateSplitProgress(game.state);
    }
    /** @type {HTMLElement | null} */ (sceneControls.querySelector('[data-action="scene-retry"]'))?.focus({
      preventScroll: true,
    });
  };

  /**
   * 리플레이의 지금 자리에서 장면 연습을 시작한다(구간·피네스·구조 중 하나, 셋 다 없으면 그냥 장면)
   * @param {SceneSplit | null} [split] @param {FinesseScene | null} [target] @param {any} [rescue] @param {any} [restored]
   * @param {boolean} [confirmed] 저장된 판을 지워도 된다고 이미 답했다
   */
  const enter = (split = null, target = null, rescue = null, restored = null, confirmed = false) => {
    const player = replayView.player;
    if (!replayView.paused || !(replayView.canPracticeScene() || (rescue && player && !player.done))) return;
    if (!session.restoring && !confirmed && deps.replacesSavedRun()) {
      deps.confirmReplaceRun(() => enter(split, target, rescue, restored, true));
      return;
    }
    scene = {
      spawnFrame: restored?.scene.spawnFrame ?? rescue?.spawnFrame ?? target?.spawnFrame ?? player.spawnFrame,
      split,
      target,
      rescue,
      startFrame: 0,
      best: restored?.scene.best ?? null,
      ended: false,
    };
    document.body.dataset.scenePractice = rescue ? "rescue" : target ? "finesse" : split ? "split" : "scene";
    replayView.showBar(false);
    sceneControls.hidden = false;
    reset(restored);
  };

  /** 장면 연습을 마치고 리플레이의 그 자리로 돌아간다 */
  const exit = () => {
    const player = replayView.player;
    if (!scene || !player) return;
    journal.clear();
    scene = null;
    finesse = null;
    document.body.removeAttribute("data-scene-practice");
    sceneControls.hidden = true;
    session.game = player.game;
    renderer.clearEffects();
    fb.clearAction();
    inputDisplay.show(player.input.held, player.input.pressed);
    deps.showPanel(null);
    deps.setScreen("replay");
    deps.showModeHud(session.mode, true);
    setPauseLabels();
    replayView.showBar(true);
    replayView.updateBar();
    replayView.focusAfterPractice();
  };

  /**
   * 장면 연습 중 한 프레임: 끝났는지(구간 도착·피네스 고정·막힘) 보고 결과를 보인다.
   * @param {number} held @param {number} pressed @param {boolean} reconstructing 이어서 하기로 되살리는 중(화면은 그리지 않는다)
   */
  const step = (held, pressed, reconstructing) => {
    const { game } = session;
    const hadActive = Boolean(game.state.active);
    const events = game.step({ held, pressed });
    finesse?.frame(held, pressed, hadActive, events);
    const lock = scene.target && events.find(event => event.type === "lock");
    const split = scene.split;
    const outcome = split && splitAttemptOutcome(game.state, scene.startFrame, split.to, split.endFrame);
    const ended = Boolean(outcome || lock || game.state.over);
    if (ended) scene.ended = true;
    if (reconstructing) return;
    inputDisplay.show(held, pressed);
    renderer.addEvents(events);
    deps.sfx.events(events);
    deps.feedback(events);
    if (ended) {
      journal.clear();
      if (outcome) {
        showSplitOutcome(outcome);
        fb.clearAction();
      } else if (scene.target) {
        showFinesseOutcome(lock, finesse.lastInputs);
        fb.clearAction();
      } else if (scene.rescue) {
        showRescueOutcome();
        fb.clearAction();
      }
      setPauseLabels();
      deps.pause();
    }
  };

  // 결과의 "막히기 전 다시 해보기"(Survival): 방금 판의 리플레이를 막히기 전 자리에서 열고 구조 연습
  $("survival-rescue").addEventListener("click", () => {
    const lastReplay = deps.getLastReplay();
    const rescue = lastReplay && findSurvivalRescue(lastReplay, findMode);
    if (!rescue) return;
    replayView.start(lastReplay, "results", "", true);
    replayView.seek(rescue.spawnFrame, true);
    enter(null, null, rescue);
  });

  return {
    /** 연습 중인 장면(아니면 null) */
    get current() {
      return scene;
    },
    enter,
    exit,
    reset,
    step,
    title,
    setPauseLabels,
    updateSplitProgress,
  };
};
