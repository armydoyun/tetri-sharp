// 디자인 원칙을 소스에서 직접 확인한다 — docs/DESIGN_SYSTEM.md
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ICONS } from "../../js/ui/icons.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const walk = dir =>
  fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap(e => {
    const rel = `${dir}/${e.name}`;
    return e.isDirectory() ? walk(rel) : [rel];
  });

const SOURCES = [...walk("js"), ...walk("css"), "index.html"].filter(f => /\.(js|css|html)$/.test(f));

/** 주석을 지운 코드(주석 안의 설명용 기호는 허용) */
const stripComments = (file, text) => {
  let out = text.replace(/\/\*[\s\S]*?\*\//g, "");
  if (file.endsWith(".html")) out = out.replace(/<!--[\s\S]*?-->/g, "");
  if (file.endsWith(".js")) out = out.replace(/(^|[^:"'])\/\/.*$/gm, "$1");
  return out;
};

// 이모지: 그림 문자 영역, 이모지 변형 선택자, 결합 문자, 국기 등
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{E0020}-\u{E007F}]|\u{FE0F}|\u{200D}/u;
// 아이콘처럼 쓰기 쉬운 글자 기호: 화살표, 도형, 체크·별, 곱셈·무한대
const SYMBOL_ICONS = /[←-⇿⌀-⏿■-◿✓-✘★☆×∞]/u;

const findAll = (text, re) =>
  text.split("\n").flatMap((line, i) => (re.test(line) ? [`${i + 1}: ${line.trim().slice(0, 80)}`] : []));

test("원칙 1: 소스 어디에도 이모지가 없다(주석 포함)", () => {
  const hits = SOURCES.flatMap(f => findAll(fs.readFileSync(path.join(ROOT, f), "utf8"), EMOJI).map(h => `${f}:${h}`));
  assert.deepEqual(hits, []);
});

test("원칙 1: 코드·문구에 글자 기호 아이콘(화살표·도형·체크·×·∞)이 없다 — 아이콘은 SVG로", () => {
  const hits = SOURCES.flatMap(f =>
    findAll(stripComments(f, fs.readFileSync(path.join(ROOT, f), "utf8")), SYMBOL_ICONS).map(h => `${f}:${h}`)
  );
  assert.deepEqual(hits, []);
});

test("HTML에서 쓰는 아이콘 이름은 모두 정의돼 있다", () => {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const used = [...html.matchAll(/data-icon="([^"]+)"/g)].map(m => m[1]);
  assert.ok(used.length > 5);
  for (const name of used) assert.ok(ICONS[name], name);
});

test("아이콘은 24 격자 안의 선 요소만 쓴다(채움 속성 없음)", () => {
  for (const [name, parts] of Object.entries(ICONS)) {
    assert.ok(parts.length > 0, name);
    for (const [tag, attrs] of parts) {
      assert.ok(["path", "circle", "rect", "line", "polyline"].includes(tag), `${name}: ${tag}`);
      assert.equal(attrs.fill, undefined, `${name}: fill 금지`);
      const nums =
        Object.values(attrs)
          .join(" ")
          .match(/-?\d*\.?\d+/g)
          ?.map(Number) ?? [];
      // 좌표가 격자를 벗어나지 않는다(상대 좌표 포함 대략 검사)
      for (const n of nums) assert.ok(Math.abs(n) <= 24, `${name}: ${n}`);
    }
  }
});

test("원칙 2: 흐름 안 요소를 hidden으로 끄지 않는다 — hidden은 겹쳐 뜨는 패널에만", () => {
  const main = fs.readFileSync(path.join(ROOT, "js/main.js"), "utf8");
  const toggled = [...main.matchAll(/\$\("([\w-]+)"\)\.hidden\s*=/g)].map(m => m[1]);
  const overlays = new Set(["countdown", "replay-bar", "menu", "pause", "results"]);
  for (const id of toggled) assert.ok(overlays.has(id), `${id}는 흐름 안 요소 — .is-invisible이나 비활성을 쓴다`);
});
