// 킥 없는 회전: 모양은 SRS와 같고, 회전한 자리가 막혀 있으면 그냥 돌지 않는다(옛날 가정용 게임 방식).
import { cellsOf } from "../../core/pieces.js";

const NONE = /** @type {ReadonlyArray<readonly [number, number]>} */ (Object.freeze([Object.freeze([0, 0])]));

export default Object.freeze({
  id: "classic",
  cells: cellsOf,
  spawnRotation: () => 0,
  kicks: () => NONE,
});
