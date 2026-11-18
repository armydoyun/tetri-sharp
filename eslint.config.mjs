// ESLint 설정 (flat config, ESLint 9)
// 실제 버그로 이어지는 규칙은 error, 정리 성격은 warn. `npm run lint`는 경고도 실패로 친다(--max-warnings=0).
import js from "@eslint/js";
import globals from "globals";

const rules = {
  "no-unused-vars": ["warn", { args: "after-used", argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
  "no-undef": "error",
  "no-self-compare": "error",
  "no-template-curly-in-string": "warn",
  eqeqeq: ["error", "smart"],
};

export default [
  { ignores: ["deploy/**", "deploy-pages/**", "node_modules/**", "test-results/**"] },
  { linterOptions: { reportUnusedDisableDirectives: "warn" } },
  js.configs.recommended,

  // 게임: 브라우저 ES 모듈. core/와 rules/는 DOM을 쓰지 않는다(아래에서 따로 막는다).
  {
    files: ["js/**/*.js"],
    languageOptions: { ecmaVersion: 2022, sourceType: "module", globals: { ...globals.browser } },
    rules,
  },
  // 코어 엔진·규칙은 순수 JS여야 한다: Node 테스트에서 그대로 돌고, 리플레이가 결정론적이도록.
  {
    files: ["js/core/**/*.js", "js/rules/**/*.js"],
    languageOptions: { globals: {} },
    rules: {
      "no-restricted-properties": [
        "error",
        { object: "Math", property: "random", message: "시드 PRNG(js/core/rng.js)를 쓴다." },
        { object: "Date", property: "now", message: "코어는 틱 단위로만 시간을 센다." },
      ],
    },
  },
  // 서비스 워커 원본(브라우저 워커 환경)
  {
    files: ["tools/sw-template.js"],
    languageOptions: { ecmaVersion: 2022, sourceType: "script", globals: { ...globals.serviceworker } },
    rules,
  },
  // 빌드 도구·테스트: Node ES 모듈
  {
    files: ["tools/**/*.mjs", "tests/**/*.mjs", "*.mjs"],
    languageOptions: { ecmaVersion: 2022, sourceType: "module", globals: { ...globals.node } },
    rules,
  },
  // 브라우저 테스트는 page.evaluate(() => …) 안에서 document 등 브라우저 전역을 쓴다.
  {
    files: ["tests/browser/**/*.mjs"],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  // UI 검수: 함수 일부를 Playwright가 브라우저 안에서 실행한다
  {
    files: ["tests/helpers/ui-audit.mjs", "tests/helpers/ui-scenarios.mjs"],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
];
