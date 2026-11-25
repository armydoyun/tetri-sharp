// 내 퍼즐·받은 퍼즐(js/storage/custom-puzzles.js): 저장·고치기·지우기·한도, 받은 퍼즐 남기기·기록, 검사, 백업에서 합치기
import { test } from "node:test";
import assert from "node:assert/strict";
import { WIDTH } from "../../js/core/board.js";
import { createStore, memoryBackend } from "../../js/storage/store.js";
import {
  CUSTOM_PUZZLES_KEY,
  MAX_MADE,
  MAX_RECEIVED,
  createCustomPuzzles,
  mergeCustomPuzzles,
  sanitizeCustomPuzzles,
} from "../../js/storage/custom-puzzles.js";
import { createBackup, parseBackup, restoreBackup } from "../../js/storage/backup.js";
import { CHECKED_TRIED, PUZZLE_CELLS, decodePuzzle, encodePuzzle } from "../../js/modes/custom-puzzle.js";
import { findMode } from "../../js/modes/index.js";

/** 바닥 줄 앞 n칸을 채운 판의 퍼즐 코드 */
const codeOf = (n, extra = {}) => {
  const cells = new Uint8Array(PUZZLE_CELLS);
  cells.fill(1, PUZZLE_CELLS - WIDTH, PUZZLE_CELLS - WIDTH + n);
  return /** @type {string} */ (encodePuzzle({ cells, pieces: "I", ...extra }, { checked: true }));
};

let tick = 0;
const clock = () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++)).toISOString();

test("내 퍼즐: 처음 저장하면 id가 생기고, 같은 id로 고치면 맨 앞으로, 지우면 사라진다", () => {
  const customs = createCustomPuzzles(createStore(memoryBackend()), clock);
  const a = customs.save(null, codeOf(6));
  const b = customs.save(null, codeOf(2));
  assert.ok(a && b && a !== b);
  assert.deepEqual(
    customs.made().map(m => m.id),
    [b, a]
  );
  assert.equal(customs.save(a, codeOf(6, { title: "고친 이름" })), a);
  assert.deepEqual(
    customs.made().map(m => m.id),
    [a, b],
    "고친 퍼즐이 맨 앞"
  );
  assert.equal(decodePuzzle(customs.find(a)?.code)?.title, "고친 이름");
  assert.equal(customs.findByCode(codeOf(2))?.id, b, "같은 퍼즐 찾기");
  assert.equal(customs.save(null, "망가진 코드"), null);
  customs.remove(b);
  assert.deepEqual(
    customs.made().map(m => m.id),
    [a]
  );
});

test("내 퍼즐: 가득 차면 새로 저장하지 않지만, 있던 퍼즐은 고칠 수 있다", () => {
  const store = createStore(memoryBackend());
  const made = Array.from({ length: MAX_MADE }, (_, i) => ({
    id: `p${i}`,
    code: codeOf(6),
    created: clock(),
    updated: clock(),
  }));
  store.set(CUSTOM_PUZZLES_KEY, { made, received: [] });
  const customs = createCustomPuzzles(store, clock);
  assert.equal(customs.save(null, codeOf(2)), null);
  assert.equal(customs.save("p5", codeOf(2)), "p5");
});

test("받은 퍼즐: 같은 퍼즐은 하나로, 내가 만든 퍼즐은 남기지 않고, 가득 차면 오래된 것부터 지운다", () => {
  const customs = createCustomPuzzles(createStore(memoryBackend()), clock);
  assert.equal(customs.receive(codeOf(6)), true);
  assert.equal(customs.receive(codeOf(6, { checked: CHECKED_TRIED })), false, "확인 표시만 다르면 같은 퍼즐");
  customs.save(null, codeOf(2));
  assert.equal(customs.receive(codeOf(2)), false, "내가 만든 퍼즐");
  for (let i = 0; i < MAX_RECEIVED + 3; i++) customs.receive(codeOf(6, { title: `퍼즐 ${i}` }));
  const list = customs.received();
  assert.equal(list.length, MAX_RECEIVED);
  assert.equal(decodePuzzle(list[0].code)?.title, `퍼즐 ${MAX_RECEIVED + 2}`, "최근 것이 맨 앞");
});

test("받은 퍼즐 기록: 풀면 가장 빠른 시간, 첫 수 보기를 썼는지", () => {
  const customs = createCustomPuzzles(createStore(memoryBackend()), clock);
  const code = codeOf(6);
  customs.receive(code);
  customs.recordReceived(code, { solved: false, hinted: false, frames: 50 });
  assert.deepEqual(
    { solved: customs.received()[0].solved, best: customs.received()[0].best },
    { solved: false, best: null }
  );
  customs.recordReceived(code, { solved: true, hinted: false, frames: 300 });
  customs.recordReceived(code, { solved: true, hinted: true, frames: 200 });
  customs.recordReceived(code, { solved: true, hinted: false, frames: 400 });
  const [item] = customs.received();
  assert.equal(item.best, 200);
  assert.equal(item.hinted, true);
  customs.removeReceived(code);
  assert.equal(customs.received().length, 0);
});

test("검사: 망가진 항목·겹치는 id·읽을 수 없는 코드는 버린다", () => {
  const clean = sanitizeCustomPuzzles({
    made: [
      { id: "a", code: codeOf(6), created: "2026-01-01T00:00:00Z", updated: "2026-01-02T00:00:00Z" },
      { id: "a", code: codeOf(2) },
      { id: "<x>", code: codeOf(2) },
      { id: "b", code: "1.zz.I" },
      null,
    ],
    received: [{ code: codeOf(6), solved: "yes", best: -3 }, { code: codeOf(6) }, { code: 5 }],
  });
  assert.equal(clean.made.length, 1);
  assert.equal(clean.received.length, 1);
  assert.equal(clean.received[0].solved, false);
  assert.equal(clean.received[0].best, null);
  assert.deepEqual(sanitizeCustomPuzzles("x"), { made: [], received: [] });
});

test("백업: 내 퍼즐을 담고, 불러올 때는 이 기기의 목록과 합친다(같은 id는 최근에 고친 것)", () => {
  const from = createStore(memoryBackend());
  const a = createCustomPuzzles(from, clock);
  const id = /** @type {string} */ (a.save(null, codeOf(6, { title: "백업 쪽" })));
  a.receive(codeOf(4));
  a.recordReceived(codeOf(4), { solved: true, hinted: false, frames: 120 });
  const parsed = parseBackup(JSON.parse(JSON.stringify(createBackup(from))), findMode);
  assert.ok(parsed);

  const to = createStore(memoryBackend());
  const b = createCustomPuzzles(to, clock);
  b.save(null, codeOf(2, { title: "이 기기 쪽" }));
  b.receive(codeOf(4));
  restoreBackup(to, parsed);
  const merged = createCustomPuzzles(to, clock);
  assert.deepEqual(
    merged
      .made()
      .map(m => decodePuzzle(m.code)?.title)
      .sort(),
    ["백업 쪽", "이 기기 쪽"]
  );
  assert.equal(merged.received().length, 1, "같은 받은 퍼즐은 하나로");
  assert.equal(merged.received()[0].best, 120, "푼 기록은 남긴다");
  assert.equal(merged.find(id)?.id, id);

  // 고친 시각이 더 나중인 쪽이 남는다
  const older = {
    made: [{ id: "x", code: codeOf(6), created: "2026-01-01T00:00:00Z", updated: "2026-01-01T00:00:00Z" }],
    received: [],
  };
  const newer = {
    made: [{ id: "x", code: codeOf(2), created: "2026-01-01T00:00:00Z", updated: "2026-02-01T00:00:00Z" }],
    received: [],
  };
  assert.equal(mergeCustomPuzzles(newer, older).made[0].code, codeOf(2));
  assert.equal(mergeCustomPuzzles(older, newer).made[0].code, codeOf(2));
});
