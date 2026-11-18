// npm run build → deploy/index.html : HTML · CSS · JS를 모두 담은 한 파일짜리 배포본.
// file://로 더블클릭해 열어도 동작한다(인라인 classic script라 ES Module의 CORS 제한이 없다).
//
//   node tools/build.mjs                 deploy/index.html을 만든다 (deploy/는 git에 올리지 않는다)
//   node tools/build.mjs --out=a.html    다른 곳에 만든다
import { build as esbuild, transform } from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cssHrefs, inlineHtml } from "./inline-html.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEPLOY = path.join(ROOT, "deploy");

export const JS_OPTIONS = Object.freeze({
  bundle: true,
  format: "iife",
  minify: true,
  charset: "utf8",
  legalComments: "none",
  target: "es2020",
  banner: { js: '/*! Tetri# */\n"use strict";' },
});
export const CSS_OPTIONS = Object.freeze({ loader: "css", minify: true, charset: "utf8" });

/** index.html의 <link> 순서대로 CSS를 이어 붙인다. */
export const readCss = (root = ROOT) =>
  cssHrefs(fs.readFileSync(path.join(root, "index.html"), "utf8"))
    .map(name => fs.readFileSync(path.join(root, name), "utf8"))
    .join("\n");

export const build = async ({ outFile = path.join(DEPLOY, "index.html") } = {}) => {
  const bundle = await esbuild({
    ...JS_OPTIONS,
    entryPoints: [path.join(ROOT, "js", "main.js")],
    write: false,
    logLevel: "silent",
  });
  const js = bundle.outputFiles[0].text;
  const css = (await transform(readCss(), CSS_OPTIONS)).code;
  const html = inlineHtml({ html: fs.readFileSync(path.join(ROOT, "index.html"), "utf8"), css, js });
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, html, "utf8");
  return {
    outFile,
    bytes: Buffer.byteLength(html),
    jsBytes: Buffer.byteLength(js),
    cssBytes: Buffer.byteLength(css),
  };
};

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  const out = process.argv.find(a => a.startsWith("--out="))?.slice(6);
  const kb = n => `${(n / 1024).toFixed(1)} KB`;
  try {
    const result = await build(out ? { outFile: path.resolve(out) } : {});
    console.log(
      `${path.relative(ROOT, result.outFile)}: ${kb(result.bytes)} (JS ${kb(result.jsBytes)} · CSS ${kb(result.cssBytes)})`
    );
  } catch (error) {
    console.error(
      error.errors?.length
        ? error.errors.map(e => `${e.location?.file || ""}:${e.location?.line || ""} ${e.text}`).join("\n")
        : error.message
    );
    process.exit(1);
  }
}
