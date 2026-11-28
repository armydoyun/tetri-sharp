import { build as esbuild, transform } from "esbuild";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CSS_OPTIONS, JS_OPTIONS, inlineCssUrls } from "./build.mjs";
import { cssHrefs, inlineHtml } from "./inline-html.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const buildPreview = async (name, outFile) => {
  const entry = `js/${name}/main.js`;
  const html = await fs.readFile(path.join(ROOT, `${name}.html`), "utf8");
  const [bundle, styles] = await Promise.all([
    esbuild({ ...JS_OPTIONS, entryPoints: [path.join(ROOT, entry)], write: false }),
    Promise.all(cssHrefs(html).map(href => fs.readFile(path.join(ROOT, href), "utf8"))),
  ]);
  const css = (await transform(inlineCssUrls(styles.join("\n")), CSS_OPTIONS)).code;
  const preview = inlineHtml({
    html,
    css,
    js: bundle.outputFiles[0].text,
    entryTag: `<script type="module" src="./${entry}"></script>`,
    buildComment: `<!-- 단일 파일 견본: npm run build:${name}가 만든다. -->`,
  });
  await fs.mkdir(path.dirname(outFile), { recursive: true });
  await fs.writeFile(outFile, preview);
  return outFile;
};

export const buildThemePreview = (outFile = path.join(ROOT, "deploy", "theme-preview.html")) =>
  buildPreview("theme-preview", outFile);

export const buildPuzzleGoalPreview = (outFile = path.join(ROOT, "deploy", "puzzle-goal-preview.html")) =>
  buildPreview("puzzle-goal-preview", outFile);

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  const build = process.argv.includes("--puzzle-goals") ? buildPuzzleGoalPreview : buildThemePreview;
  console.log(path.relative(ROOT, await build()));
}
