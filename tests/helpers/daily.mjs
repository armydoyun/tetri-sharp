// 테스트용: 봇으로 오늘의 도전(그날 시드의 Sprint 40L)을 끝까지 둔 리플레이를 만든다.
import { createGame } from "../../js/core/engine.js";
import { MODERN } from "../../js/rules/presets.js";
import { ROTATIONS } from "../../js/rules/rotation/index.js";
import { createBot } from "../../js/ai/bot.js";
import { createRecorder } from "../../js/replay/replay.js";
import { dailyMode } from "../../js/modes/daily.js";

export const botDailyReplay = key => {
  const mode = dailyMode(key);
  const seed = mode.fixedSeed;
  const game = createGame({ rules: MODERN, seed, mode });
  const rec = createRecorder({ seed, mode, rules: MODERN, handling: game.handling });
  const bot = createBot({ game, rotation: ROTATIONS.srs, level: { pps: 3, mistake: 0, hold: true }, seed });
  for (let f = 0; f < 60 * 120 && !game.state.over; f++) {
    const { held, pressed } = bot.input();
    rec.input(held, pressed);
    game.step({ held, pressed });
  }
  return JSON.parse(JSON.stringify(rec.finish(game.state)));
};
