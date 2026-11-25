// 리플레이 재생 화면: 재생·멈춤·속도·한 프레임·앞뒤로 감기, 진행 막대, 장면 표시(타임라인·목록), 대전 리플레이 보드 고르기.
// 판 상태(game·mode·rules·screen)는 main.js가 갖고 있어 session으로 받아 함께 쓴다.
// 장면 연습(리플레이의 한 장면을 다시 해 보기)은 게임 흐름과 얽혀 main.js에 있고, 이 모듈은 hooks.onPractice로 부른다.
import { analyzeReplay } from "../replay/analyze.js";
import { createPlayer } from "../replay/replay.js";
import { formatTime } from "../modes/format.js";
import { t } from "../i18n/index.js";
import { button } from "../ui/components.js";
import { el } from "../ui/dom.js";
import { icon } from "../ui/icons.js";

const $ = id => /** @type {HTMLElement} */ (document.getElementById(id));
const SPEEDS = [1, 2, 4];

const MARK_LABELS = {
  finesse: m => t("피네스 실수 +{n} · {piece}", { n: m.value, piece: m.label }),
  slow: m => t("오래 고민한 피스 · {s}초", { s: (m.value / 60).toFixed(1) }),
  highlight: m => m.label,
  sent: m => m.label,
  blocked: m => m.label,
  received: m => m.label,
};

/**
 * @param {{
 *   session: { game: any, mode: any, rules: any, readonly screen: string, readonly versus: any, resetClock: () => void },
 *   findMode: (id: string) => any,
 *   panels: Record<string, HTMLElement>,
 *   renderer: any,
 *   cpuRenderer: any,
 *   fb: any,
 *   sfx: any,
 *   inputDisplay: any,
 *   versusPanel: HTMLElement,
 *   countdownEl: HTMLElement,
 *   setText: (el: HTMLElement, text: string) => void,
 *   setScreen: (screen: string) => void,
 *   showPanel: (name: string | null) => void,
 *   showModeHud: (mode: any, replay?: boolean) => void,
 *   toMenu: () => void,
 *   hooks: {
 *     canRace: (replay: any) => boolean,
 *     onRace: (replay: any) => void,
 *     onShare: (replay: any, title: string) => void,
 *     onPractice: () => void,
 *   },
 * }} deps
 */
export const createReplayPlayer = deps => {
  const { session, findMode, panels, renderer, cpuRenderer, fb, sfx, inputDisplay, hooks } = deps;
  const { setText, setScreen, showPanel, showModeHud, toMenu } = deps;

  /** @type {ReturnType<typeof createPlayer> | null} */
  let player = null;
  let playing = null;
  let ownReplay = false;
  let paused = false;
  let speed = 1;
  /** 리플레이를 닫으면 돌아갈 곳 @type {{ screen?: string, game?: any, mode?: any, rules?: any, focus?: Element | null }} */
  let replayReturn = {};
  let selectedMark = -1;
  /** @type {(ReturnType<typeof analyzeReplay> & { for: any }) | null} 지금 보는 리플레이의 분석 */
  let analysis = null;

  const replayBar = $("replay-bar");
  const replayStatus = $("replay-status");
  const replayNote = $("replay-note");
  const replayProgress = /** @type {HTMLInputElement} */ ($("replay-progress"));
  const replayMarkers = $("replay-markers");
  const replayTime = $("replay-time");
  const replayBattleView = $("replay-battle-view");
  const replayBattleTally = $("replay-battle-tally");
  const replayBattleEvent = $("replay-battle-event");
  const replayStep = /** @type {HTMLButtonElement} */ (replayBar.querySelector('[data-replay="step"]'));
  const replayToggle = /** @type {HTMLButtonElement} */ (replayBar.querySelector('[data-replay="toggle"]'));
  const replayPractice = /** @type {HTMLButtonElement} */ (replayBar.querySelector('[data-replay="practice"]'));

  const resetReplayBattleEvent = () => {
    if (!replayBattleEvent.hidden) replayBattleEvent.hidden = true;
  };

  const replayLength = () => playing?.result?.frames || analysis?.length || 0;

  /** 리플레이 분석(같은 리플레이면 다시 하지 않는다) */
  const analyze = replay => {
    if (analysis?.for !== replay) analysis = { ...analyzeReplay(replay, findMode), for: replay };
    return analysis;
  };

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
    if (session.screen === "replay") renderTimelineMarks();
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
      session.game = player.game;
    }
    while (player.frame < to && !player.done) player.step();
    if (pause) paused = true;
    renderer.clearEffects();
    cpuRenderer.clearEffects();
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

  const canPracticeScene = () => ownReplay && playing?.mode === "sprint40" && player && !player.done;

  const updateReplayBar = () => {
    // 재생 중에도 누를 수 있다: 누르면 멈추고 지금 장면을 연습한다(이유 없이 꺼져 있던 것, U43)
    replayPractice.disabled = !canPracticeScene();
    // 끝까지 본 뒤에는 재생 단추가 "다시 재생"(처음부터)이 된다. 흐려진 "일시정지"로 남지 않게.
    const ended = Boolean(player?.done);
    /** @type {HTMLElement} */ (replayBar.querySelector(".replay-toggle-icon")).replaceChildren(
      icon(ended ? "restart" : paused ? "play" : "pause")
    );
    /** @type {HTMLElement} */ (replayBar.querySelector(".replay-toggle-text")).textContent = ended
      ? t("다시 재생")
      : paused
        ? t("재생")
        : t("일시정지");
    /** @type {HTMLElement} */ (replayBar.querySelector(".replay-speed")).textContent = `${speed}x`;
    replayStatus.textContent = player?.done
      ? player.cpu
        ? session.mode.summary(session.game.state).title
        : t("끝")
      : "";
    replayStep.disabled = !player || player.done;
    replayToggle.disabled = !player;
    for (const b of /** @type {NodeListOf<HTMLButtonElement>} */ (
      replayBar.querySelectorAll('[data-replay="back"], [data-replay="step-back"]')
    ))
      b.disabled = !player || player.frame === 0;
    updateReplayProgress();
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

  /**
   * 리플레이를 연다(이미 보는 중이면 다른 리플레이로 바꾼다).
   * @param {any} replay @param {string} [returnTo] 닫으면 돌아갈 화면 @param {string} [note] 조작 줄 아래 안내
   * @param {boolean} [local] 이 기기에서 한 판(장면 연습을 할 수 있다)
   */
  const startReplay = (replay, returnTo = session.screen, note = "", local = false) => {
    const entering = session.screen !== "replay";
    const focus = document.activeElement;
    if (entering) {
      replayReturn = { screen: returnTo, game: session.game, mode: session.mode, rules: session.rules, focus };
      ownReplay = local;
    }
    selectedMark = -1;
    playing = replay;
    player = createPlayer(replay, findMode);
    session.game = player.game;
    session.mode = player.mode;
    session.rules = replay.rules;
    paused = false;
    const battle = Boolean(player.cpu);
    if (entering && battle) selectReplayBoard("own");
    document.body.toggleAttribute("data-battle-replay", battle);
    replayBattleView.hidden = replayBattleTally.hidden = !battle;
    resetReplayBattleEvent();
    deps.versusPanel.hidden = true;
    document.body.classList.remove("is-versus");
    analyze(replay);
    // 끝까지 갔을 때의 시간 표시만큼 처음부터 자리를 잡는다.
    const length = replayLength();
    const endTime = formatTime(length);
    $("replay-time-width").textContent = length ? `${endTime} / ${endTime}` : endTime;
    session.resetClock();
    renderer.clearEffects();
    cpuRenderer.clearEffects();
    fb.clearAction();
    deps.countdownEl.hidden = true;
    showPanel(null);
    setScreen("replay");
    showModeHud(session.mode, true);
    replayBar.hidden = false;
    replayPractice.hidden = !ownReplay || replay.mode !== "sprint40";
    replayNote.textContent = note;
    $("replay-title").textContent = `${session.mode.name} · ${session.rules.name}`;
    renderMarkers();
    /** @type {HTMLButtonElement} */ (replayBar.querySelector('[data-replay="race"]')).hidden = !hooks.canRace(replay);
    /** @type {HTMLButtonElement} */ (replayBar.querySelector('[data-replay="share"]')).hidden = battle;
    updateReplayBar();
    if (!entering && focus instanceof HTMLElement && replayBar.contains(focus)) focus.focus({ preventScroll: true });
    else replayToggle.focus({ preventScroll: true });
  };

  const restartReplay = () => playing && startReplay(playing, session.screen, replayNote.textContent);

  /** 리플레이를 닫고 연 곳(결과 화면·첫 화면)으로 돌아간다 */
  const stopReplay = () => {
    if (session.screen !== "replay") return;
    player = null;
    playing = null;
    ownReplay = false;
    replayBar.hidden = true;
    replayBattleView.hidden = replayBattleTally.hidden = true;
    document.body.removeAttribute("data-battle-replay");
    document.body.removeAttribute("data-replay-board");
    deps.versusPanel.hidden = !session.versus;
    document.body.classList.toggle("is-versus", Boolean(session.versus));
    renderer.clearEffects();
    cpuRenderer.clearEffects();
    session.game = replayReturn.game;
    session.mode = replayReturn.mode;
    session.rules = replayReturn.rules;
    if (replayReturn.screen === "results") {
      showModeHud(session.mode);
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
    resetReplayBattleEvent();
    for (let i = 0; i < count && !player.done; i++) {
      const events = player.step();
      inputDisplay.show(player.input.held, player.input.pressed);
      if (!player.cpu) for (const e of events) fb.announce(e);
      renderer.addEvents(events);
      if (player.cpu) cpuRenderer.addEvents(player.cpuEvents);
      // 빨리 감기 중에는 소리를 겹쳐 내지 않는다.
      if (count === 1) sfx.events(events);
    }
    if (player.done) updateReplayBar();
    else updateReplayProgress();
  };

  /** 재생·멈춤을 바꾼다(끝까지 봤으면 처음부터) */
  const togglePause = () => {
    if (player?.done) return restartReplay();
    if (!player) return;
    paused = !paused;
    updateReplayBar();
  };

  for (const btn of replayBar.querySelectorAll("[data-replay]")) {
    btn.addEventListener("click", e => {
      const action = btn.getAttribute("data-replay");
      if (action === "toggle") {
        if (player?.done) return restartReplay();
        paused = !paused;
      }
      if (action === "speed") speed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
      if (action === "step") {
        paused = true;
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
        paused = true;
        return hooks.onPractice();
      }
      if (action === "share" && playing && !player?.cpu)
        return hooks.onShare(playing, `${session.mode.name} · ${session.rules.name}`);
      if (action === "race" && playing) return hooks.onRace(playing);
      if (action === "restart") return restartReplay();
      if (action === "exit") return stopReplay();
      updateReplayBar();
    });
  }

  /** 리플레이 중 단축키: Space 일시정지, 1·2·4 속도, ←→ 5초(Shift: 한 프레임), [ ] 앞뒤 장면, Esc 닫기 @param {KeyboardEvent} e */
  const handleKey = e => {
    if (e.code === "Space" && !(document.activeElement instanceof HTMLButtonElement)) {
      e.preventDefault();
      if (!e.repeat) togglePause();
      return;
    }
    if (e.repeat) return;
    if (e.code === "Escape") return stopReplay();
    if (["Digit1", "Digit2", "Digit4"].includes(e.code)) speed = Number(e.code.slice(5));
    // ←→: 막대에 포커스가 있으면 막대가 처리한다
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
  };

  return {
    /** 지금 재생기(엔진 + 입력 기록), 보지 않으면 null */
    get player() {
      return player;
    },
    /** 지금 보는 리플레이 */
    get playing() {
      return playing;
    },
    get paused() {
      return paused;
    },
    set paused(value) {
      paused = value;
    },
    analyze,
    start: startReplay,
    restart: restartReplay,
    stop: stopReplay,
    seek: seekReplay,
    togglePause,
    handleKey,
    updateBar: updateReplayBar,
    /** 장면 연습을 할 수 있는지(이 기기의 Sprint 리플레이, 끝나기 전) */
    canPracticeScene,
    /** 화면 틀마다 한 번: 멈추지 않았으면 속도만큼 진행 */
    tick: () => {
      if (!paused) advanceReplay(speed);
    },
    /** 조작 줄 보이기(장면 연습 중에는 숨긴다) @param {boolean} visible */
    showBar: visible => {
      replayBar.hidden = !visible;
      if (visible) renderTimelineMarks();
    },
    /** @param {string} text */
    setNote: text => {
      replayNote.textContent = text;
    },
    /** 장면 연습을 마치고 돌아왔을 때 포커스: Survival 구조 연습이면 재생, 아니면 장면 연습 단추 */
    focusAfterPractice: () =>
      (playing?.mode === "survival" ? replayToggle : replayPractice).focus({ preventScroll: true }),
  };
};
