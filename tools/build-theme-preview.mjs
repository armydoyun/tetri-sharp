import { build as esbuild, transform } from "esbuild";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CSS_OPTIONS, JS_OPTIONS, inlineCssUrls } from "./build.mjs";
import { cssHrefs, inlineHtml } from "./inline-html.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const ENTRY = "js/theme-preview/main.js";

export const buildThemePreview = async (outFile = path.join(ROOT, "deploy", "theme-preview.html")) => {
  const html = await fs.readFile(path.join(ROOT, "theme-preview.html"), "utf8");
  const [bundle, styles] = await Promise.all([
    esbuild({ ...JS_OPTIONS, entryPoints: [path.join(ROOT, ENTRY)], write: false }),
    Promise.all(cssHrefs(html).map(href => fs.readFile(path.join(ROOT, href), "utf8"))),
  ]);
  const css = (await transform(inlineCssUrls(styles.join("\n")), CSS_OPTIONS)).code;
  const preview = inlineHtml({
    html,
    css,
    js: bundle.outputFiles[0].text,
    entryTag: `<script type="module" src="./${ENTRY}"></script>`,
    buildComment: "<!-- 단일 파일 견본: npm run build:theme-preview가 만든다. -->",
  });
  await fs.mkdir(path.dirname(outFile), { recursive: true });
  await fs.writeFile(outFile, preview);
  return outFile;
};

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  console.log(path.relative(ROOT, await buildThemePreview()));
}
