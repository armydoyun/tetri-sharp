import { test } from "node:test";
import assert from "node:assert/strict";
import { createPuzzleVerification } from "../../js/app/puzzle-verification.js";
import { PUZZLE_CELLS } from "../../js/modes/custom-puzzle.js";

test("퍼즐 자동 확인: 취소된 탐색의 늦은 결과는 다음 퍼즐에 적용하지 않는다", async () => {
  const jobs = [];
  const solver = {
    run() {
      const { promise, resolve } = Promise.withResolvers();
      const job = { promise, resolve, cancelled: false, cancel: () => (job.cancelled = true) };
      jobs.push(job);
      return job;
    },
  };
  let pieces = "I";
  const cells = new Uint8Array(PUZZLE_CELLS);
  const verifier = createPuzzleVerification({
    solver,
    getPuzzle: () => ({ cells, pieces }),
    getKey: () => pieces,
    hasWarnings: () => false,
  });
  const completed = [];
  assert.equal(
    verifier.start(() => completed.push("old")),
    true
  );
  pieces = "IT";
  verifier.sync();
  assert.equal(jobs[0].cancelled, true);
  assert.equal(verifier.result, null);
  assert.equal(
    verifier.start(() => completed.push("current")),
    true
  );

  jobs[0].resolve({ moves: [] });
  await jobs[0].promise;
  assert.deepEqual(verifier.result, { code: "IT", state: "checking" });
  assert.deepEqual(completed, []);

  jobs[1].resolve(null);
  await jobs[1].promise;
  assert.deepEqual(verifier.result, { code: "IT", state: "unsolvable" });
  assert.deepEqual(completed, ["current"]);
});
