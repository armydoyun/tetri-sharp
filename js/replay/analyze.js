// 리플레이 분석: 끝까지 한 번 돌려 보며 진행 막대에 표시할 장면을 모은다.
//  - 피네스 실수: 하드 드롭한 피스 중 최소 입력보다 더 누른 것(js/modes/finesse.js)
//  - 오래 고민한 피스: 나와서 놓일 때까지 걸린 시간이 이 판의 보통(중앙값)보다 훨씬 긴 것
//  - 주요 장면: T-spin 줄 삭제, 4줄 삭제, 퍼펙트 클리어
import { createPlayer } from "./replay.js";
import { createFinesseTracker } from "../modes/finesse.js";
import { ROTATIONS } from "../rules/rotation/index.js";
import { clearName } from "../rules/scoring/guideline.js";
import { t } from "../i18n/index.js";

/** 오래 고민했다고 보는 기준: 중앙값의 2.5배이면서 1.5초 이상 */
const SLOW_FACTOR = 2.5;
const SLOW_MIN_FRAMES = 90;
const MAX_FRAMES = 60 * 60 * 30; // 30분 넘는 판은 거기까지만 본다
const battleKinds = /** @type {const} */ (["sent", "blocked", "received"]);

/** @param {Marker[]} markers */
const addBattleMarkers = (markers, frame, ownEvents, cpuEvents) => {
  if (!ownEvents.length && !cpuEvents.length) return;
  const notes = { sent: [], blocked: [], received: [] };
  const collect = (side, events) => {
    for (const e of events) {
      if (e.type === "attack") {
        if (e.lines) notes.sent.push(`${side} · ${t("{n}줄 보냄", { n: e.lines })}`);
        if (e.blocked) notes.blocked.push(`${side} · ${t("{n}줄 상쇄", { n: e.blocked })}`);
      } else if (e.type === "garbage") {
        notes.received.push(`${side} · ${t("쓰레기 {n}줄 올라옴", { n: e.rows })}`);
      }
    }
  };
  collect(t("내 보드"), ownEvents);
  collect(t("CPU 보드"), cpuEvents);
  for (const kind of battleKinds) {
    if (notes[kind].length) markers.push({ frame, kind, label: notes[kind].join(" / ") });
  }
};

/**
 * @typedef {{ frame: number, kind: "finesse" | "slow" | "highlight" | "sent" | "blocked" | "received", label: string, value?: number }} Marker
 * @typedef {{ spawnFrame: number, cells: number[][], inputs: number, piece: string }} FinesseScene
 * @returns {{ markers: Marker[], finesse: { judged: number, faults: number }, finesseScene: FinesseScene | null, slow: number, length: number }}
 */
export const analyzeReplay = (replay, findMode) => {
  const player = createPlayer(replay, findMode);
  const game = player.game;
  const tracker = player.cpu ? null : createFinesseTracker(game, ROTATIONS[game.rules.rotation]);
  /** @type {Marker[]} */
  const markers = [];
  /** 피스마다 [나온 프레임, 놓인 프레임] */
  const pieces = [];
  /** @type {FinesseScene | null} */
  let finesseScene = null;
  let spawnedAt = -1;
  let pieceId = -1;
  while (!player.done && player.frame < MAX_FRAMES) {
    const before = player.frame;
    const hadActive = Boolean(game.state.active);
    const spawnFrame = player.spawnFrame;
    const events = player.step();
    if (player.cpu) {
      addBattleMarkers(markers, player.frame, events, player.cpuEvents);
      continue;
    }
    const { held, pressed } = player.input;
    const extra = tracker?.frame(held, pressed, hadActive, events) ?? 0;
    for (const e of events) {
      if (e.type !== "lock") continue;
      if (spawnedAt >= 0) pieces.push([spawnedAt, before]);
      if (extra > 0) {
        markers.push({ frame: Math.max(0, spawnedAt), kind: "finesse", label: e.piece, value: extra });
        if (!finesseScene && replay.mode === "sprint40" && (hadActive || before === 0)) {
          finesseScene = { spawnFrame, cells: e.cells, inputs: tracker.lastInputs, piece: e.piece };
        }
      }
      if ((e.lines > 0 && e.tspin !== "none") || e.lines >= 4 || e.perfect)
        markers.push({ frame: before, kind: "highlight", label: e.perfect ? "PERFECT CLEAR" : clearName(e) });
      spawnedAt = -1;
    }
    // 놓인 것을 먼저 처리하고 새 피스를 본다(하드 드롭하면 같은 프레임에 다음 피스가 나온다).
    if (game.state.pieceId !== pieceId && game.state.active) {
      pieceId = game.state.pieceId;
      spawnedAt = before;
    }
  }
  const durations = pieces.map(([a, b]) => b - a).sort((x, y) => x - y);
  const median = durations.length ? durations[Math.floor(durations.length / 2)] : 0;
  const slowLimit = Math.max(SLOW_MIN_FRAMES, median * SLOW_FACTOR);
  let slow = 0;
  for (const [a, b] of pieces) {
    if (b - a < slowLimit) continue;
    slow += 1;
    markers.push({ frame: a, kind: "slow", label: "", value: b - a });
  }
  markers.sort((x, y) => x.frame - y.frame);
  return {
    markers,
    finesse: tracker ? { ...tracker.result } : { judged: 0, faults: 0 },
    finesseScene,
    slow,
    length: player.frame,
  };
};
