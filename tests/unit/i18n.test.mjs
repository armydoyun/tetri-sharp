// 번역 사전이 코드·HTML의 한국어 문장을 빠짐없이 갖고 있는지, 매개변수 이름이 맞는지 확인한다.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { EN } from "../../js/i18n/en.js";
import { resolveLang, setLang, t } from "../../js/i18n/index.js";

const ROOT = path.resolve(import.meta.dirname, "../..");
const walk = dir =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap(e => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));

const HANGUL = /[가-힣]/;

/** 코드의 한국어 문자열(주석·개발자용 오류 문구 제외) */
const codeStrings = () => {
  const out = new Map();
  for (const file of walk(path.join(ROOT, "js"))) {
    if (file.includes(`${path.sep}i18n${path.sep}`)) continue;
    const lines = fs.readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(line) || /throw new Error/.test(line)) return;
      const code = line.replace(/\s\/\/ .*$/, "");
      for (const m of code.matchAll(/"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'/g)) {
        const text = m[1] !== undefined ? JSON.parse(`"${m[1]}"`) : m[2].replace(/\\'/g, "'");
        if (HANGUL.test(text)) out.set(text, `${path.relative(ROOT, file)}:${i + 1}`);
      }
      // 템플릿 문자열의 글자 부분(${…} 밖)에 한국어가 있으면 번역할 수 없다.
      for (const m of code.matchAll(/`([^`]*)`/g)) {
        const literal = m[1].replace(/\$\{(?:[^{}]|\{[^{}]*\})*\}/g, "");
        assert.ok(!HANGUL.test(literal), `번역할 수 없는 템플릿 문자열: ${path.relative(ROOT, file)}:${i + 1}`);
      }
    });
  }
  return out;
};

const htmlStrings = () => {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8").replace(/<!--[\s\S]*?-->/g, "");
  const out = new Set();
  for (const m of html.matchAll(/>([^<>]*)</g)) if (HANGUL.test(m[1])) out.add(m[1].trim());
  for (const m of html.matchAll(/(?:aria-label|title|placeholder|content)="([^"]*)"/g))
    if (HANGUL.test(m[1])) out.add(m[1]);
  return out;
};

test("코드의 한국어 문장은 모두 영어 사전에 있다", () => {
  const missing = [...codeStrings()].filter(([text]) => !(text in EN)).map(([text, at]) => `${at} ${text}`);
  assert.deepEqual(missing, []);
});

test("index.html의 한국어 글자도 모두 영어 사전에 있다", () => {
  const missing = [...htmlStrings()].filter(text => !(text in EN));
  assert.deepEqual(missing, []);
});

test("번역문은 원문과 같은 매개변수를 쓴다", () => {
  const names = s => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();
  for (const [ko, en] of Object.entries(EN)) assert.deepEqual(names(en), names(ko), ko);
});

test("t(): 매개변수를 채우고, 영어면 사전을 쓰며 없으면 원문", () => {
  assert.equal(t("{n}줄", { n: 3 }), "3줄");
  setLang("en");
  try {
    assert.equal(t("{n}줄", { n: 3 }), "3 lines");
    assert.equal(t("사전에 없는 문장"), "사전에 없는 문장");
  } finally {
    setLang("ko");
  }
});

test("자동 언어: 브라우저 언어가 한국어면 ko, 아니면 en", () => {
  assert.equal(resolveLang("auto", ["ko-KR", "en"]), "ko");
  assert.equal(resolveLang("auto", ["en-US"]), "en");
  assert.equal(resolveLang("auto", ["ja"]), "en");
  assert.equal(resolveLang("ko", ["en-US"]), "ko");
  assert.equal(resolveLang("en", ["ko"]), "en");
});
