// Chromium 실행 경로: CHROMIUM_PATH → Playwright가 내려받은 것 → 시스템 설치본 순서로 고른다.
import fs from "node:fs";

export const chromiumPath = chromium => {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  if (fs.existsSync(chromium.executablePath())) return chromium.executablePath();
  return ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"].find(f => fs.existsSync(f));
};

export const launchOptions = chromium => ({
  headless: true,
  executablePath: chromiumPath(chromium),
  args: ["--no-sandbox"],
});
