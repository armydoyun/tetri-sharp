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
  const overlays = new Set(["countdown", "replay-bar", "menu", "pause", "results", "welcome"]);
  for (const id of toggled) assert.ok(overlays.has(id), `${id}는 흐름 안 요소 — .is-invisible이나 비활성을 쓴다`);
});

test("CSS 파일마다 중괄호 짝이 맞는다(하나라도 빠지면 그 뒤 규칙이 모두 무시된다)", () => {
  for (const file of fs.readdirSync(path.join(ROOT, "css"))) {
    const css = fs.readFileSync(path.join(ROOT, "css", file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    let depth = 0;
    for (const ch of css) {
      if (ch === "{") depth += 1;
      if (ch === "}") depth -= 1;
      assert.ok(depth >= 0, `${file}: 닫는 괄호가 더 많다`);
    }
    assert.equal(depth, 0, `${file}: 닫히지 않은 규칙이 있다`);
  }
});

// ---- 컴포넌트 약속(docs/DESIGN_SYSTEM.md "컴포넌트") ----

/** CSS 규칙 목록: { file, selector, props } (@media 안 규칙 포함) */
const cssRules = file => {
  let text = fs.readFileSync(path.join(ROOT, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  // 버튼·세그먼트의 바탕 정의는 검사하지 않는다(여기서만 여백·높이를 정한다)
  if (file === "css/components.css") {
    const start = text.indexOf(".btn {");
    const end = text.indexOf(".select {");
    text = text.slice(0, start) + text.slice(end);
  }
  const rules = [];
  for (const m of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = m[1].replace(/@media[^{]*$/, "").trim();
    const props = m[2]
      .split(";")
      .map(d => d.split(":")[0].trim())
      .filter(Boolean);
    rules.push({ file, selector, props });
  }
  return rules;
};

/** 선택자 목록을 맨 바깥 쉼표로 나눈다(:is(a, b) 안의 쉼표는 그대로) */
const splitSelectors = selector => {
  const out = [];
  let depth = 0;
  let cur = "";
  for (const ch of selector) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  return [...out, cur.trim()].filter(Boolean);
};

/** 선택자의 마지막 덩어리(실제로 꾸미는 요소) */
const subject = sel => {
  let depth = 0;
  let last = 0;
  for (let i = 0; i < sel.length; i++) {
    if (sel[i] === "(") depth++;
    if (sel[i] === ")") depth--;
    if (depth === 0 && /[\s>+~]/.test(sel[i])) last = i + 1;
  }
  return sel.slice(last);
};

// 이 속성들은 버튼 면의 가운데 맞춤·크기를 정한다 → 화면 CSS에서는 --btn-*·--seg-* 변수로만 바꾼다
const LAYOUT_PROPS = new Set([
  "padding",
  "padding-top",
  "padding-bottom",
  "padding-left",
  "padding-right",
  "padding-block",
  "padding-inline",
  "padding-block-start",
  "padding-block-end",
  "height",
  "min-height",
  "max-height",
  "line-height",
  "display",
  "align-items",
  "justify-content",
  "gap",
  "font-size",
  "box-shadow",
  "transform",
]);

test("컴포넌트: 화면 CSS는 버튼·세그먼트 칸의 여백·높이·정렬을 직접 덮어쓰지 않는다(--btn-*·--seg-* 변수로)", () => {
  const isSegmentItem = sel => /(segmented|choice|rule-tabs)\b[^,]*>\s*button/.test(sel) && subject(sel) === "button";
  const bad = walk("css")
    .filter(f => f.endsWith(".css"))
    .flatMap(cssRules)
    .flatMap(({ file, selector, props }) =>
      splitSelectors(selector)
        .filter(sel => /\.btn(?![\w-])/.test(subject(sel)) || isSegmentItem(sel))
        .flatMap(sel => props.filter(p => LAYOUT_PROPS.has(p)).map(p => `${file}: ${sel} { ${p} }`))
    );
  assert.deepEqual(bad, []);
});

test("컴포넌트: index.html의 버튼은 [아이콘][.btn-label][.btn-meta][kbd] 구조만 쓴다(맨 글자 없음)", () => {
  const html = stripComments("index.html", fs.readFileSync(path.join(ROOT, "index.html"), "utf8"));
  const bad = [];
  for (const m of html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)) {
    const cls = /class="([^"]*)"/.exec(m[1])?.[1].split(/\s+/) ?? [];
    if (!cls.includes("btn")) continue;
    const rest = m[2]
      .replace(/<kbd\b[^>]*>(?:<kbd\b[^>]*>[^<]*<\/kbd>|[^<])*<\/kbd>/g, "")
      .replace(/<span data-icon="[\w-]+"><\/span>/g, "")
      .replace(/<span class="btn-icon[^"]*">(?:<span data-icon="[\w-]+"><\/span>)?<\/span>/g, "")
      .replace(/<span class="btn-label[^"]*">[^<]*<\/span>/g, "")
      .replace(/<small\b[^>]*class="btn-meta"[^>]*><\/small>/g, "");
    if (rest.trim()) bad.push(`${/id="([^"]*)"/.exec(m[1])?.[1] ?? m[1].trim()}: ${rest.trim().slice(0, 60)}`);
  }
  assert.deepEqual(bad, []);
});

test("컴포넌트: 화면 코드는 버튼·입력을 직접 만들지 않는다 — js/ui/components.js를 쓴다", () => {
  // 모양이 따로 정해진 특수 버튼만 예외(색 견본·키 칸·퍼즐 칸·리플레이 표시)
  const ALLOWED = new Set([
    "js/ui/settings.js:color-swatch",
    "js/ui/settings.js:key-slot",
    "js/ui/puzzle-editor.js:puzzle-editor-cell",
    "js/main.js:replay-mark",
  ]);
  const bad = [];
  for (const f of walk("js").filter(f => f.endsWith(".js") && f !== "js/ui/components.js")) {
    const text = stripComments(f, fs.readFileSync(path.join(ROOT, f), "utf8"));
    for (const m of text.matchAll(
      /el\("(button|input|select|textarea)"|createElement\("(button|input|select|textarea)"\)/g
    )) {
      const near = text.slice(m.index, m.index + 400);
      const cls = /class(?:Name)?:?\s*=?\s*[`"]([\w-]+)/.exec(near)?.[1] ?? "?";
      if (!ALLOWED.has(`${f}:${cls}`)) bad.push(`${f}: ${m[0]} (${cls})`);
    }
  }
  assert.deepEqual(bad, []);
});
