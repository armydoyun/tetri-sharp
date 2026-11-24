# Tetri# 작업 안내 (에이전트용)

브라우저에서 바로 도는 낙하 블록 퍼즐. 런타임 의존성 없는 바닐라 HTML/CSS/JS(ES 모듈)이고, `npm run build`가 파일 하나(`deploy/index.html`)로 묶는다.
오프라인이 원칙이다: 서버·계정·외부 요청을 더하지 않는다.

## UI를 만들거나 고칠 때 — 먼저 `docs/DESIGN_SYSTEM.md` "컴포넌트"를 읽는다

- 버튼·세그먼트·스위치·슬라이더·글자 입력·드롭다운·목록 줄은 **`js/ui/components.js`로만 만든다.** 크기·여백·정렬은 **`css/controls.css`에서만** 정한다.
  `document.createElement("button")`, `el("button", …)`, `el("input", …)`을 화면 코드에 쓰지 않는다.
  ```js
  import { button, iconButton, confirmButton, segmented, toggle, slider, rangeRow, textInput, dropdown, menuRow } from "./components.js";
  button({ label: t("저장"), icon: "download", size: "s", onClick: save });
  ```
- `index.html`에 버튼을 적을 때는 구조를 그대로 지킨다: `[<span data-icon>] [<span class="btn-label">] [<small class="btn-meta">] [<kbd>]`.
  맨 글자(`<button class="btn">편집</button>`)는 안 된다.
- 버튼 안 내용은 **아래 턱(3px)을 뺀 면**의 가운데에 놓인다. `controls.css`가 계산하므로 다른 CSS에서는
  컨트롤(`.btn` 세그먼트 칸 `.select` `.text-input` `.switch` `.range` `.menu-row` `.tool-row` `.key-slot`)의
  `padding` `height` `min-height` `line-height` `display` `align-items` `justify-content` `gap` `font-size` `box-shadow` `transform` `grid-template-*`를
  덮어쓰지 않는다. 크기를 바꿀 때는 변수만: `--btn-size` `--btn-min` `--btn-px` `--btn-py` `--btn-gap` `--btn-font` `--btn-icon`,
  세그먼트 `--seg-*`, 드롭다운 `--select-size`, 글자 입력 `--input-size`. 새 배치가 필요하면 `controls.css`에 변형 class를 더한다.
- 상태가 바뀌어도 크기·위치가 그대로여야 한다. 흐름 안의 요소를 `hidden`으로 빼지 말고 `disabled`나 `.is-invisible`로 자리를 남긴다.
- 지우기·초기화처럼 되돌릴 수 없는 일은 `window.confirm` 대신 `confirmButton()`(두 번 눌러 확정)으로,
  대화상자 밖 흐름(새 판 시작 등)은 `js/ui/ask.js`의 앱 안 확인 대화상자로. `window.confirm·alert·prompt`는 테스트가 막는다.
- 색·간격·크기는 `css/tokens.css` 변수만 쓴다. 이모지·기호 글자 아이콘(× ← ✓ 등)은 쓰지 않는다 — `js/ui/icons.js`의 SVG.
- 화면에 보이는 문구는 한국어로 쓰고 `t("…")`로 감싼 뒤 `js/i18n/en.js`에 영어를 더한다.

## 확인

```bash
npx eslint . --max-warnings=0
npx tsc -p tsconfig.json
npx prettier --check js tools tests
npm run test:unit
timeout 900 npm run test:browser   # 실패는 "^not ok" 줄로 확인한다
```

PR을 올리면 CI(`.github/workflows/ci.yml`)가 위 다섯 가지를 모두 돌리고, 마지막 **all checks pass**가 초록이어야 머지할 수 있다
(저장소의 브랜치 보호에서 필수 검사로 건다). 빨간 PR은 고쳐서 다시 올린다. PR 본문은 `.github/pull_request_template.md`의 확인 목록을 채운다.

`tests/unit/design-rules.test.mjs`가 위 UI 약속을, 브라우저 UI 검수(`tests/helpers/ui-audit.mjs`)가 네 화면 크기에서
넘침·잘림·겹침과 버튼 구조·가운데 맞춤(1px 안)을 검사한다. 검사를 끄거나 허용 목록을 늘려서 통과시키지 않는다.
