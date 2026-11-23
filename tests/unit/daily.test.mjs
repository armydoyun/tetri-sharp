import { test } from "node:test";
import assert from "node:assert/strict";
import { dailyMode, dailySeed, dateKey, findDaily, recentDailyKeys } from "../../js/modes/daily.js";
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

test("최근 도전은 오늘부터 7일이며 월과 연도가 바뀌어도 날짜가 이어진다", () => {
  const date = new Date(2026, 0, 2, 0, 15);
  assert.deepEqual(recentDailyKeys(date), [
    "2026-01-02",
    "2026-01-01",
    "2025-12-31",
    "2025-12-30",
    "2025-12-29",
    "2025-12-28",
    "2025-12-27",
  ]);
  assert.equal(dateKey(date), "2026-01-02");
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

test("오늘의 도전 모드: 시작일 전은 늘 Sprint 40L, 그날부터 Sprint → Ultra → Dig를 날마다 돈다", async () => {
  const { DIG, SPRINT_40, ULTRA } = await import("../../js/modes/index.js");
  const { ROTATION_START, dailyBase, dailyMode, findDaily } = await import("../../js/modes/daily.js");
  // 이미 지난 날짜(저장·공유된 결과 코드)는 바뀌지 않는다
  for (const key of ["2026-11-18", "2026-11-22", "2026-11-30"]) assert.equal(dailyBase(key), SPRINT_40, key);
  assert.equal(ROTATION_START, "2026-12-01");
  assert.deepEqual(
    ["2026-12-01", "2026-12-02", "2026-12-03", "2026-12-04", "2027-01-01"].map(k => dailyBase(k).id),
    ["sprint40", "ultra", "dig", "sprint40", dailyBase("2027-01-01").id]
  );
  // 달·해가 바뀌어도 날 수로 이어진다(12월 31일 다음 날)
  const order = [SPRINT_40.id, ULTRA.id, DIG.id];
  const next = order[(order.indexOf(dailyBase("2026-12-31").id) + 1) % 3];
  assert.equal(dailyBase("2027-01-01").id, next);
  // 같은 날짜는 언제 만들어도 같은 모드(리플레이 검증이 이 값에 기댄다)
  const ultraDay = dailyMode("2026-12-02");
  assert.equal(ultraDay.timeLimit, ULTRA.timeLimit);
  assert.equal(ultraDay.baseName, "Ultra");
  assert.equal(findDaily("daily-20261202"), ultraDay);
  assert.equal(dailyMode("2026-12-03").check.toString(), DIG.check.toString());
});
