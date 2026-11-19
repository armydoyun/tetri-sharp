// 새 엔진에서 같은 입력을 재생해 생성기의 위치도 연습 시작점에 맞춘다.
import { createPlayer } from "./replay.js";
import { restoreState, snapshotState } from "../modes/undo.js";

/** 생성 직후, 해당 프레임의 나머지 입력이 적용되기 전 상태에서 분기한다. */
export const createSceneAttempt = (replay, findMode, spawnFrame) => {
  let start = null;
  let preparing = true;
  const playback = createPlayer(replay, findMode, state => {
    if (preparing && playback.frame === spawnFrame) start = snapshotState(state);
  });
  if (spawnFrame === 0) {
    // 리플레이 시작점에서는 기록된 첫 입력 없이 첫 피스를 생성한다.
    playback.game.step();
  } else {
    while (playback.frame < spawnFrame && !playback.done) playback.step();
  }
  preparing = false;
  if (!start || playback.game.state.over) return null;
  const { game } = playback;
  restoreState(game.state, start);
  // 리플레이의 눌린 키와 횡이동 충전은 새 조작으로 가져오지 않는다.
  game.state.prevHeld = 0;
  game.state.das = { dir: 0, charge: 0, arrAcc: 0 };
  return game;
};
