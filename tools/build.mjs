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

const MIME = { ".woff2": "font/woff2", ".svg": "image/svg+xml", ".png": "image/png" };

/**
 * CSS 안의 url("../assets/…")를 data: URI로 바꾼다(한 파일 배포본이 바깥 파일을 찾지 않게).
 * 그 밖의 상대 경로 url()이 남아 있으면 빌드를 멈춘다.
 * @param {string} css  css/ 폴더 기준 경로가 들어 있는 CSS
 */
export const inlineCssUrls = (css, root = ROOT) => {
  const out = css.replace(/url\(\s*["']?\.\.\/(assets\/[\w./-]+)["']?\s*\)/g, (_, rel) => {
    const file = path.join(root, rel);
    const mime = MIME[path.extname(file)];
    if (!mime) throw new Error(`인라인할 수 없는 형식: ${rel}`);
    return `url("data:${mime};base64,${fs.readFileSync(file).toString("base64")}")`;
  });
  const left = /url\(\s*["']?(?!data:|#)[^)"']+/.exec(out);
  if (left) throw new Error(`CSS가 아직 바깥 파일을 참조합니다: ${left[0]}`);
  return out;
};

/** index.html의 <link> 순서대로 CSS를 이어 붙이고 바깥 파일을 인라인한다. */
export const readCss = (root = ROOT) =>
  inlineCssUrls(
    cssHrefs(fs.readFileSync(path.join(root, "index.html"), "utf8"))
      .map(name => fs.readFileSync(path.join(root, name), "utf8"))
      .join("\n"),
    root
  );

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
