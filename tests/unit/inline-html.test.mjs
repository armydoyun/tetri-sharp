import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { inlineTabIcon } from "../../tools/build.mjs";
import { inlineHtml, scriptSafe } from "../../tools/inline-html.mjs";

const html = fs.readFileSync(new URL("../../index.html", import.meta.url), "utf8");

test("개발용 index.html을 인라인 한 파일로 바꾼다", () => {
  const out = inlineHtml({ html: inlineTabIcon(html), css: "body{color:red}", js: "console.log(1)" });
  assert.equal((out.match(/<style>/g) || []).length, 1);
  assert.ok(!out.includes('rel="stylesheet"'));
  assert.ok(!out.includes('type="module"'));
  assert.ok(out.includes("<script>console.log(1)</script>"));
  assert.match(out, /<link rel="icon" href="data:image\/svg\+xml;base64,[^"]+"/);
});

test("스크립트 안의 </script>는 이스케이프한다", () => {
  assert.equal(scriptSafe('"</script>"'), '"<\\/script>"');
  assert.throws(() => scriptSafe("a<!--b"));
});
