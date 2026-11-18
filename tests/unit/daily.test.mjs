import { test } from "node:test";
import assert from "node:assert/strict";
import { dailyMode, dailySeed, dateKey, findDaily } from "../../js/modes/daily.js";
import { SPRINT_40, findMode as findBaseMode } from "../../js/modes/index.js";
import { decodeReplayCode, encodeReplayCode, replayLink } from "../../js/replay/share.js";
import { sanitizeReplay, verifyReplay } from "../../js/replay/replay.js";
import { botDailyReplay } from "../helpers/daily.mjs";

const findMode = id => findDaily(id) ?? findBaseMode(id);

test("날짜 키는 YYYY-MM-DD, 같은 날짜는 같은 시드·다른 날짜는 다른 시드", () => {
  assert.equal(dateKey(new Date(2026, 10, 8)), "2026-11-08");
  assert.equal(dailySeed("2026-11-18"), dailySeed("2026-11-18"));
  assert.notEqual(dailySeed("2026-11-18"), dailySeed("2026-11-19"));
  assert.ok(Number.isInteger(dailySeed("2026-11-18")) && dailySeed("2026-11-18") >= 0);
});

test("오늘의 도전은 Sprint 40L 규칙에 시드만 고정한 모드이고 id로 찾는다", () => {
  const m = dailyMode("2026-11-18");
  assert.equal(m.id, "daily-20261118");
  assert.equal(findDaily(m.id), m);
  assert.equal(findMode(m.id), m);
  assert.equal(m.goal, SPRINT_40.goal);
  assert.equal(m.fixedSeed, dailySeed("2026-11-18"));
  assert.equal(findDaily("daily-x"), null);
});

test("결과 코드: 압축해서 주고받아도 같은 리플레이(이름 포함)이고, 링크에서도 읽는다", async () => {
  const replay = botDailyReplay("2026-11-18");
  assert.equal(replay.result.over, "clear");
  const code = await encodeReplayCode(replay, "도윤");
  assert.match(code, /^TD1-[\w-]+$/);
  assert.ok(code.length < JSON.stringify(replay).length, "압축된다");
  const back = sanitizeReplay(await decodeReplayCode(code), findMode);
  assert.equal(back.name, "도윤");
  assert.equal(back.mode, "daily-20261118");
  assert.equal(verifyReplay(back, findMode).ok, true);
  const viaLink = await decodeReplayCode(replayLink(code, "https://example.test/tetri/#rules=x"));
  assert.equal(viaLink.seed, replay.seed);
});

test("결과 코드: 엉터리는 null", async () => {
  assert.equal(await decodeReplayCode(""), null);
  assert.equal(await decodeReplayCode("TD1-!!!"), null);
  assert.equal(await decodeReplayCode("TS1-abc"), null);
});
