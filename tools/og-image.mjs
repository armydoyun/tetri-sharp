// 메신저 링크 배너(Open Graph 이미지)를 만든다: assets/og/og.html → assets/og/og.png(1200×630).
// 배포 때마다 만들지 않고, 디자인을 바꿨을 때만 실행해 PNG를 저장소에 넣는다(배포본은 그 파일을 복사만 한다).
//   node tools/og-image.mjs
// 한글 글꼴: 기계에 따라 다르다. OG_FONT_DIR에 Noto Sans KR woff2(700·800·900)가 있으면 그것으로 찍는다.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { launchOptions } from "../tests/helpers/browser.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(ROOT, "assets", "og", "og.html");
const out = path.join(ROOT, "assets", "og", "og.png");

const fontDir = process.env.OG_FONT_DIR;
const fontCss = fontDir
  ? [500, 700, 800, 900]
      .map(w => ({ w, file: path.join(fontDir, `noto-sans-kr-korean-${w}-normal.woff2`) }))
      .filter(({ file }) => fs.existsSync(file))
      .map(
        ({ w, file }) =>
          `@font-face{font-family:"Noto Sans KR";font-weight:${w};src:url("data:font/woff2;base64,${fs.readFileSync(file).toString("base64")}") format("woff2");}`
      )
      .join("")
  : "";

const browser = await chromium.launch(launchOptions(chromium));
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.goto(`file://${source}`);
  if (fontCss) await page.addStyleTag({ content: fontCss });
  await page.evaluate(() => globalThis.document.fonts.ready);
  await page.waitForTimeout(200);
  await page.screenshot({ path: out, type: "png" });
  console.log(`${path.relative(ROOT, out)}: ${(fs.statSync(out).size / 1024).toFixed(1)} KB`);
} finally {
  await browser.close();
}
