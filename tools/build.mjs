// npm run build → deploy/index.html : HTML · CSS · JS를 모두 담은 한 파일짜리 배포본.
// file://로 더블클릭해 열어도 동작한다(인라인 classic script라 ES Module의 CORS 제한이 없다).
//
//   node tools/build.mjs                 deploy/index.html을 만든다 (deploy/는 git에 올리지 않는다)
//   node tools/build.mjs --out=a.html    다른 곳에 만든다
import { build as esbuild, transform } from "esbuild";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cssHrefs, inlineHtml, replaceOnce } from "./inline-html.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEPLOY = path.join(ROOT, "deploy");
const TAB_ICON = "assets/brand/t-mark.svg";

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

const MIME = { ".svg": "image/svg+xml", ".png": "image/png" };

const assetDataUrl = file => {
  const mime = MIME[path.extname(file)];
  if (!mime) throw new Error(`인라인할 수 없는 형식: ${file}`);
  return `data:${mime};base64,${fs.readFileSync(file).toString("base64")}`;
};

export const inlineTabIcon = html =>
  replaceOnce(html, `href="./${TAB_ICON}"`, `href="${assetDataUrl(path.join(ROOT, TAB_ICON))}"`, "탭 아이콘");

/**
 * CSS 안의 url("../assets/…")를 data: URI로 바꾼다(한 파일 배포본이 바깥 파일을 찾지 않게).
 * 그 밖의 상대 경로 url()이 남아 있으면 빌드를 멈춘다.
 * @param {string} css  css/ 폴더 기준 경로가 들어 있는 CSS
 */
export const inlineCssUrls = (css, root = ROOT) => {
  const out = css.replace(
    /url\(\s*["']?\.\.\/(assets\/[\w./-]+)["']?\s*\)/g,
    (_, rel) => `url("${assetDataUrl(path.join(root, rel))}")`
  );
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

/** 퍼즐 풀이 Worker 소스를 담는 전역 이름(js/app/solver.js의 SOLVER_GLOBAL과 같다) */
export const SOLVER_GLOBAL = "__TETRISHARP_SOLVER__";

/** 퍼즐 풀이 Worker(js/workers/solver.js)를 따로 묶은 소스 */
export const buildSolverWorker = async () => {
  const bundle = await esbuild({
    ...JS_OPTIONS,
    banner: { js: '"use strict";' },
    entryPoints: [path.join(ROOT, "js", "workers", "solver.js")],
    write: false,
    logLevel: "silent",
  });
  return bundle.outputFiles[0].text;
};

export const build = async ({ outFile = path.join(DEPLOY, "index.html") } = {}) => {
  const worker = await buildSolverWorker();
  // 한 파일 배포본: Worker 소스는 본 스크립트 맨 앞 전역 문자열로 넣는다(Blob Worker로 띄운다)
  const bundle = await esbuild({
    ...JS_OPTIONS,
    banner: { js: `${JS_OPTIONS.banner.js}\nvar ${SOLVER_GLOBAL} = ${JSON.stringify(worker)};` },
    entryPoints: [path.join(ROOT, "js", "main.js")],
    write: false,
    logLevel: "silent",
  });
  const js = bundle.outputFiles[0].text;
  const css = (await transform(readCss(), CSS_OPTIONS)).code;
  const source = inlineTabIcon(fs.readFileSync(path.join(ROOT, "index.html"), "utf8"));
  const html = inlineHtml({ html: source, css, js });
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, html, "utf8");
  return {
    outFile,
    bytes: Buffer.byteLength(html),
    jsBytes: Buffer.byteLength(js),
    cssBytes: Buffer.byteLength(css),
  };
};

const MANIFEST = Object.freeze({
  name: "Tetri#",
  short_name: "Tetri#",
  description: "규칙을 직접 조합하는 낙하 블록 퍼즐",
  lang: "ko",
  start_url: "./",
  scope: "./",
  display: "standalone",
  background_color: "#171a17",
  theme_color: "#171a17",
});

/** 설치형 앱 연결: 매니페스트 링크를 <head>에 넣는다(바깥 파일 검사는 이미 끝난 뒤). */
const PWA_HEAD = '    <link rel="manifest" href="./manifest.webmanifest">\n';

/** 첫 화면과 탭에 쓰는 표식을 설치 아이콘의 어두운 바탕과 안전 영역에 배치한다. */
const buildAppIcon = () => {
  const mark = fs
    .readFileSync(path.join(ROOT, TAB_ICON), "utf8")
    .replace(/<style>[\s\S]*?<\/style>/, "")
    .replace("<svg ", '<svg x="64" y="64" width="384" height="384" color="#d6ed84" ')
    .trim();
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="${MANIFEST.background_color}"/>
  ${mark}
</svg>\n`;
};

const shortHash = content => crypto.createHash("sha256").update(content).digest("hex").slice(0, 12);

/** 배포 주소(링크 배너는 이미지 주소가 절대 경로여야 메신저가 읽는다) */
export const SITE_URL = "https://armydoyun.github.io/tetri-sharp/";

/**
 * 메신저·SNS 링크 배너(Open Graph). 이미지는 assets/og/og.png(tools/og-image.mjs로 만든다).
 * 페이지가 바깥에서 무언가를 불러오는 것은 아니다 — 링크를 받은 메신저 서버가 이 태그와 이미지를 읽는다.
 */
export const OG_HEAD = [
  ["og:type", "website"],
  ["og:site_name", "Tetri#"],
  ["og:title", "Tetri#"],
  ["og:description", "블록 쌓기. 규칙은 마음대로."],
  ["og:url", SITE_URL],
  ["og:image", `${SITE_URL}og.png`],
  ["og:image:width", "1200"],
  ["og:image:height", "630"],
  ["og:image:alt", "Tetri# 로고와 블록이 쌓인 게임 보드"],
  ["og:locale", "ko_KR"],
]
  .map(([k, v]) => `    <meta property="${k}" content="${v}">\n`)
  .concat(['    <meta name="twitter:card" content="summary_large_image">\n'])
  .join("");

/**
 * GitHub Pages용: 한 파일 배포본 + manifest.webmanifest + icon.svg + og.png + sw.js
 * 페이지나 앱 아이콘·매니페스트가 바뀌면 새 오프라인 저장본을 받는다.
 */
export const buildPages = async ({ outDir = path.join(ROOT, "deploy-pages") } = {}) => {
  fs.rmSync(outDir, { recursive: true, force: true });
  const result = await build({ outFile: path.join(outDir, "index.html") });
  let html = fs.readFileSync(result.outFile, "utf8");
  if (!html.includes("</head>")) throw new Error("index.html에 </head>가 없습니다");
  html = html.replace("</head>", `${PWA_HEAD}${OG_HEAD}  </head>`);
  fs.writeFileSync(result.outFile, html, "utf8");
  const icon = buildAppIcon();
  const iconUrl = `icon.svg?v=${shortHash(icon)}`;
  const manifest = JSON.stringify(
    { ...MANIFEST, icons: [{ src: iconUrl, sizes: "any", type: "image/svg+xml", purpose: "any maskable" }] },
    null,
    2
  );
  const version = shortHash(html + manifest + icon);
  fs.writeFileSync(path.join(outDir, "manifest.webmanifest"), manifest, "utf8");
  fs.writeFileSync(path.join(outDir, "icon.svg"), icon, "utf8");
  fs.copyFileSync(path.join(ROOT, "assets", "og", "og.png"), path.join(outDir, "og.png"));
  const sw = fs
    .readFileSync(path.join(ROOT, "tools", "sw-template.js"), "utf8")
    .replace("__VERSION__", version)
    .replace("__APP_ICON__", iconUrl);
  fs.writeFileSync(path.join(outDir, "sw.js"), sw, "utf8");
  // Pages가 _로 시작하는 파일을 숨기지 않게
  fs.writeFileSync(path.join(outDir, ".nojekyll"), "", "utf8");
  return { ...result, outDir, version, bytes: Buffer.byteLength(html) };
};

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  const out = process.argv.find(a => a.startsWith("--out="))?.slice(6);
  const pages = process.argv.includes("--pages");
  const kb = n => `${(n / 1024).toFixed(1)} KB`;
  try {
    const result = pages
      ? await buildPages(out ? { outDir: path.resolve(out) } : {})
      : await build(out ? { outFile: path.resolve(out) } : {});
    console.log(
      `${path.relative(ROOT, result.outFile)}: ${kb(result.bytes)} (JS ${kb(result.jsBytes)} · CSS ${kb(result.cssBytes)})` +
        (pages ? ` + PWA (sw ${result.version})` : "")
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
