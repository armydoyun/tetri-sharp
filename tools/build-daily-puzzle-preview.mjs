import { build as esbuild, transform } from "esbuild";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { build, CSS_OPTIONS, JS_OPTIONS, inlineCssUrls } from "./build.mjs";
import { cssHrefs, inlineHtml } from "./inline-html.mjs";
import { dayKey, generateSample, SAMPLE_START } from "../js/modes/daily-puzzle-generation.js";
import { WIDTH } from "../js/core/board.js";
import { auditPuzzleVariety } from "./audit-daily-puzzles.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const ENTRY = "js/daily-puzzle-preview/main.js";

const previewData = start => {
  const sample = generateSample(start);
  const matches = auditPuzzleVariety(sample);
  const duplicates = matches.filter(match => match.repeat).length;
  const similar = matches.filter(match => !match.repeat && match.nearby).length;
  const similarRoutes = matches.filter(match => match.sameRoute).length;
  const days = sample.map((day, i) => {
    const { key, family, planned, pieces, stats, code, cells, seed, goal, level, planning, execution } = day;
    const match = matches[i];
    return {
      key,
      family,
      planned,
      pieces,
      stats,
      code,
      seed,
      level,
      planning,
      execution,
      goal: goal.kind,
      rows: Array.from({ length: cells.length / WIDTH }, (_, i) => cells.slice(i * WIDTH, (i + 1) * WIDTH).join("")),
      similarDate: match.repeat ?? match.nearby,
      similarRouteDate: match.sameRoute,
    };
  });
  return { days, duplicates, similar, similarRoutes };
};

export const buildDailyPuzzlePreview = async (
  outFile = path.join(ROOT, "deploy", "daily-puzzle-preview.html"),
  start = SAMPLE_START
) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !Number.isFinite(Date.parse(start)) || dayKey(Date.parse(start)) !== start)
    throw new Error("시작 날짜는 YYYY-MM-DD 형식으로 입력하세요.");
  const data = previewData(start);
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "tetri-daily-sample-"));
  try {
    const game = await build({ outFile: path.join(temp, "index.html") });
    const gameBase64 = await fs.readFile(game.outFile, "base64");
    const html = await fs.readFile(path.join(ROOT, "daily-puzzle-preview.html"), "utf8");
    const [bundle, styles] = await Promise.all([
      esbuild({
        ...JS_OPTIONS,
        entryPoints: [path.join(ROOT, ENTRY)],
        write: false,
        define: {
          "globalThis.__TETRI_DAILY_SAMPLE__": JSON.stringify(data),
          "globalThis.__TETRI_DAILY_GAME__": JSON.stringify(gameBase64),
        },
      }),
      Promise.all(cssHrefs(html).map(href => fs.readFile(path.join(ROOT, href), "utf8"))),
    ]);
    const css = (await transform(inlineCssUrls(styles.join("\n")), CSS_OPTIONS)).code;
    const preview = inlineHtml({
      html,
      css,
      js: bundle.outputFiles[0].text,
      entryTag: `<script type="module" src="./${ENTRY}"></script>`,
      buildComment: "<!-- 오늘의 퍼즐 단일 파일 견본 -->",
    });
    await fs.mkdir(path.dirname(outFile), { recursive: true });
    await fs.writeFile(outFile, preview);
    return { outFile, ...data };
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
};

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  const start = process.argv.find(arg => arg.startsWith("--start="))?.slice(8);
  const out = process.argv.find(arg => arg.startsWith("--out="))?.slice(6);
  const { outFile, days, duplicates, similar, similarRoutes } = await buildDailyPuzzlePreview(out, start);
  console.log(
    `${path.relative(ROOT, outFile)} · ${days.length}일 · 중복 판 ${duplicates} · 비슷한 판 ${similar} · 같은 대표 풀이 ${similarRoutes}`
  );
}
