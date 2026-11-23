# Tetri# 디자인 시스템

시각 언어는 **블록**이다. 모서리는 거의 각지고(2–4px), 누를 수 있는 것은 블록처럼 아래쪽에 턱(`--ledge`, 3px)이 있어 누르면 1px 내려앉는다. 화면은 게임 메뉴처럼 목록과 계기판으로 짜고, 홍보 문구나 장식 카드는 두지 않는다. 브라우저 기본 모양의 입력 요소는 쓰지 않는다.

## 색과 표면

| 역할 | 라이트 | 다크(게임 화면) |
| --- | --- | --- |
| 페이지 배경 `--bg` | `#eceee6` | `#141614` |
| 표면 `--surface` | `#f9faf4` | `#1d201d` |
| 보조 표면·호버 `--surface-2` | `#e2e6da` | `#262a25` |
| 움푹 들어간 칸(입력·트랙·세그먼트 홈) `--surface-3` | `#dde1d4` | `#0f110f` |
| 본문 `--text` | `#1d221b` | `#f1f2e9` |
| 보조 문구 `--text-dim` | `#4d584a` | `#aab3a6` |
| 경계선 `--border` | `#cdd3c4` | `#2f342e` |
| 강조 `--accent` / 강조 턱 `--accent-ledge` | `#3f5b29` / `#253a16` | `#d6ed84` / `#9fb553` |

색은 `css/tokens.css`에서 역할별 변수로 관리한다. 첫 화면은 설정의 "화면 색"(시스템 · 라이트 · 다크, `html[data-scheme]`)을 따르고, **게임 화면(첫 화면이 아닐 때)은 기본으로 body 전체가 다크 값**으로 바뀌어 보드와 주변이 한 표면이 된다. 설정 "게임 중 화면"을 "화면 색 따르기"로 바꾸면(`body[data-game-surface="scheme"]`) 게임 중에도 화면 색을 그대로 쓰고, 보드 둘레·보드 위 문구도 그 표면에 맞춘다. 격자는 늘 게임 테마 색이다. 그림자는 대화상자·드롭다운 목록·보드 위 카드에만 쓴다.

## 글자와 간격

- 글자는 시스템 산세리프, 숫자(시계·점수·기록·키 이름)는 고정폭 글꼴 `--font-num`.
- 제목은 굵게(800–900). 구역 제목 앞에는 강조색 8px 정사각형 표식을 둔다(`.section-title::before`).
- 본문 14px, 보조 12–13px, 대화상자 제목 20px. 간격은 4·8·12·16·24·32px.
- 아이콘은 24 격자, 각진 선(square cap, miter join), 현재 글자색.

## 컴포넌트

누르고 고르고 적는 것(컨트롤)은 모두 **`js/ui/components.js`** 한 곳에서 만들고, 크기·여백·정렬은 **`css/controls.css`** 한 곳에서 정한다.
화면 코드와 화면 CSS(`components.css` 대화상자·표 등, `game.css`)는 이것들을 *가져다 쓰기만* 한다 — 배치(폭·격자 칸·바깥 여백)와 각 컨트롤이 열어 둔 변수만 바꾼다. 이 약속은 테스트가 지킨다(아래 "검사").

### 세 가지 약속

1. **가운데는 "버튼 면"의 가운데다.** 누를 수 있는 것은 아래에 턱(`--ledge`, 3px)이 있다. 턱은 `box-shadow: inset`으로 그려 크기에 영향이 없으므로,
   내용(아이콘·글자)은 상자 전체가 아니라 **턱을 뺀 면**의 한가운데에 와야 한다. 바탕 CSS가 아래 여백에 턱 몫(`--face-pad` = 3px, 눌렀을 때 1px)을
   늘 더해서 이걸 맞춘다. 그래서 화면 CSS가 `padding`·`height`·`line-height`·`align-items`를 직접 덮어쓰면 가운데가 어긋난다 → **변수로만 바꾼다.**
2. **구조는 하나다.** 버튼 안에는 `[아이콘] [이름 .btn-label] [부가 정보 .btn-meta] [단축키 kbd]`만 들어간다. 맨 글자(`<button>편집</button>`)나
   `<span>` 아무거나를 넣지 않는다 — 줄 높이가 달라져 글자가 1–2px 뜨거나 가라앉는다.
3. **상태가 바뀌어도 크기·글자 위치가 그대로다.** 바뀌는 것은 색·투명도와, 눌렀을 때 1px 내려앉는 것뿐이다. 세그먼트는 고르지 않은 칸도 턱 자리를 비워 둔다.
   숨길 때는 `hidden` 대신 자리를 남기는 `.is-invisible`·`visibility`를 쓴다(원칙 2).

### 한눈에

| 컴포넌트 | 만들기(`js/ui/components.js`) | class | 모양 |
| --- | --- | --- | --- |
| 버튼 | `button({ label, icon?, variant?, size?, wrap?, kbd?, onClick? })` | `.btn` (+ `.btn-primary` `.btn-ghost` `.btn-small` `.btn-wrap`) | 표면 + 진한 테두리 + 아래 턱. 주 버튼은 강조색 면과 진한 강조 턱 |
| 아이콘 버튼 | `iconButton({ icon, label, variant = "ghost", size = "s" })` | `.btn.btn-icon-only` | 정사각형. 이름은 `aria-label`·`title`로만 |
| 줄 전체 버튼 | `button({ label, meta })` 또는 정적 HTML | `.btn.btn-split` | 이름은 왼쪽, `.btn-meta`는 오른쪽 (첫 화면 "이어서 하기", 리플레이 장면 목록) |
| 두 번 눌러 확정 | `confirmButton({ label, confirmLabel, onConfirm })` | `.btn.btn-confirm` | 되돌릴 수 없는 일(지우기·초기화). 처음 누르면 짧은 확인 이름("정말 지우기")과 강조 테두리, 4초 안에 한 번 더 누르면 실행. 두 이름을 겹쳐 폭이 바뀌지 않는다. 브라우저 `window.confirm` 대신 |
| 세그먼트 | `segmented({ label, options, value, onChange, wrap?, arrows? })` | `.segmented` / `.choice` | 움푹 들어간 홈 안의 칸. 고른 칸만 강조색 블록으로 솟는다 |
| 탭 줄 | `tabBar({ tabs, active, onSelect })` | `.segmented` | 세그먼트 + ←→ Home End로 이동 |
| 세그먼트 칸만 | `segmentButtons(options, value, onChange)` | — | HTML에 이미 있는 `.segmented` 틀을 채울 때(`#rule-tabs`) |
| 카드 선택 | `choiceCards({ options: [{ value, title, desc, preview? }] })` | `.choice-cards` `.choice-card` | 이름 + 긴 설명. 설명은 잘리지 않고 줄바꿈 |
| 드롭다운 | `dropdown({ id, label, options, value, onChange })` | `.select` | 턱 있는 버튼 + 목록. ↑↓ Home End Enter Space Esc Tab, 바깥 클릭으로 닫힘 |
| 스위치 | `toggle({ id, checked, disabled, onChange? })` | `.switch` | 홈 안에서 블록 하나가 좌우로 옮겨 간다(켜면 강조색) |
| 슬라이더 | `rangeRow(slider({ id, min, max, step, value }), output, format)` | `.range` | 10칸 막대, 채운 칸은 강조색, 손잡이는 턱 있는 블록. 값 칸 폭은 가장 긴 값에 고정 |
| 글자 입력 | `textInput({ id, value, placeholder, num? })` | `.text-input` | 움푹 들어간 칸(위쪽 안 그림자). 코드·숫자는 `num: true` |
| 목록 줄 | `menuRow({ index?, title, desc, meta?, onClick })` | `.menu-row` (번호 없으면 `.menu-row-stacked`) | 번호 있음: [번호 \| 이름·설명 \| 정보 \| >](연습·CPU 난이도). 번호 없음: [이름·설명 / 정보 \| >](첫 화면 모드). 왼쪽 4px 막대가 호버·포커스에 강조색. 600px 이하에서는 정보가 설명 아래로 |
| 도구 줄 | (정적 HTML) | `.tool-row` | [`.tool-label` \| `small.tool-meta`(늘 보임) 또는 `small.tool-note`(누를 수 없을 때 이유) \| >], 선으로만 나뉜 한 줄 |
| 설정 한 줄 | `fieldRow({ id, label, hint, control })` (`js/ui/dom.js`) | `.field-row` | [이름 + 설명 줄 \| 조작]. 설명 줄은 비어도 자리를 차지 |
| 대화상자 | `fillDialog(dialog, { title, body, notice, actions, closeId, tabs? })` (`js/ui/dom.js`) | `.dialog` | 위쪽 4px 강조 띠 · 제목과 닫기 · 탭 · 스크롤 몸통 · 알림 칸과 동작 |

### 버튼

```
┌──────────────────────────────┐  ← 테두리 1px (--border-strong, 주 버튼은 --accent-ledge)
│  [icon]  이름  [kbd]          │  ← 면: 내용은 이 면의 한가운데
│▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁│  ← 턱 3px (inset 그림자, 크기에 영향 없음)
└──────────────────────────────┘
```

| 크기 | 높이 | 좌우 여백 | 사이 | 글자 |
| --- | --- | --- | --- | --- |
| 보통(`size: "m"`) | `--control-h` 38px | 16px | 8px | `--text-l` |
| 작게(`size: "s"`, `.btn-small`) | `--control-h-s` 32px | 12px | 4px | `--text-m` |
| 터치 화면 | 최소 44px(`--touch-min`, 모든 컨트롤 공통) | | | |

| 종류 | 쓰는 곳 |
| --- | --- |
| `default` | 대부분. 대화상자 아래 "닫기"도 이것 |
| `primary` | 화면에 하나뿐인 주 동작(계속, 다시 하기, 도전하기) |
| `ghost` | 머리글·리플레이 도구 줄처럼 버튼이 여럿 늘어선 곳. 테두리·턱이 없으니 내용은 상자 한가운데 |

| 상태 | 모양 |
| --- | --- |
| 호버 | 면 색만 `--surface-2`(주 버튼 `--accent-hover`) |
| 누름 | 1px 내려앉고 턱이 1px로 줄며 내용도 그 면의 가운데로 |
| 포커스 | 2px 강조색 윤곽선 |
| 사용 안 함 | 투명도 0.4, 색 그대로. 이유는 옆 설명 줄에 |
| 고름(`aria-pressed="true"`) | 세그먼트처럼 쓰는 버튼 묶음에서만 |

```js
import { button, iconButton } from "./components.js";

button({ label: t("도전하기"), icon: "play", variant: "primary", id: "daily-start", onClick: start });
button({ label: t("링크 복사"), icon: "link", size: "s" });
button({ label: t("같은 블록 순서로 재시작"), size: "s", wrap: true }); // 좁은 칸·영어에서 두 줄
iconButton({ icon: "close", label: t("닫기"), onClick: () => dialog.close() });
```

정적 HTML(`index.html`)도 같은 구조를 그대로 적는다. 아이콘은 `<span data-icon="이름">`(시작할 때 SVG로 바뀐다),
JS가 나중에 아이콘·글자를 바꾸는 자리는 `.btn-icon`·`.btn-label`에 훅 class를 덧붙인다.

```html
<button type="button" class="btn btn-small" data-action="stats"><span data-icon="chart"></span><span class="btn-label">통계</span></button>
<button type="button" class="btn btn-primary" data-replay="toggle"><span class="btn-icon replay-toggle-icon"><span data-icon="pause"></span></span><span class="btn-label replay-toggle-text">일시정지</span></button>
<button type="button" class="btn" data-action="retry"><span data-icon="restart"></span><span class="btn-label">다시 시작</span><kbd data-key="RESTART"></kbd></button>
```

#### 화면에 맞춰 크기 바꾸기 — 변수로만

화면 CSS에서 버튼을 손볼 때는 아래 변수만 쓴다. 바탕 CSS가 이 값으로 여백·높이를 계산하면서 턱 몫을 더한다.

| 변수 | 뜻 | 예 |
| --- | --- | --- |
| `--btn-size` | 높이. `auto`면 글자에 맞춰 늘어난다 | `--btn-size: 34px` |
| `--btn-min` | 최소 높이(`--btn-size: auto`와 함께) | `--btn-min: var(--control-h-s)` |
| `--btn-px` / `--btn-py` | 좌우 / 위아래 여백(아래에는 턱 몫이 자동으로 더해진다) | `--btn-px: var(--space-1)` |
| `--btn-gap` | 아이콘·이름·단축키 사이 | `--btn-gap: 4px` |
| `--btn-font` | 글자 크기 | `--btn-font: var(--text-s)` |
| `--btn-icon` | 아이콘 크기 | `--btn-icon: 14px` |

바깥에서 정하는 배치 속성(`width` `min-width` `flex` `grid-*` `justify-self` `margin` `white-space` `word-break` `overflow-wrap` `visibility` `color`)은 그대로 써도 된다.

```css
/* 좋음 */
.replay-bar .btn { --btn-size: auto; --btn-min: 32px; --btn-py: 4px; --btn-px: 6px; --btn-font: var(--text-s); min-width: 0; }

/* 안 됨: 턱 몫이 사라져 글자가 면의 아래쪽으로 1.5px 내려간다 */
.replay-bar .btn { height: auto; padding: 4px 6px; line-height: 1.2; }
```

### 세그먼트

```
┌───────────────────────────────────┐  ← 홈: --surface-3, 안쪽 여백 3px
│ ┌───────┐  Retro    Arcade  Custom │
│ │Modern │                          │  ← 고른 칸만 강조색 블록 + 턱
│ └▁▁▁▁▁▁▁┘                          │
└───────────────────────────────────┘
```

- 짧은 선택지 2–5개. 칸 폭은 같다(`grid-auto-columns: 1fr`). 5개를 넘거나 설명이 필요하면 드롭다운이나 카드 선택.
- `wrap: false` → `.segmented`: 한 줄 고정(규칙 탭, 대화상자 탭). `wrap: true` → `.choice`: 설정 선택지처럼 이름이 길면 두 줄로 꺾는다(한국어는 단어 중간에서 꺾지 않는다).
- 고른 값은 `aria-pressed`. 다시 그리지 않고 표시만 바꿀 때는 `setSegmented(group, value)`.
- 칸 크기도 변수로만 바꾼다: `--seg-size` `--seg-min` `--seg-px` `--seg-py` `--seg-font`.

```js
fieldRow({ id, label: t("고스트"), control: segmented({ id, label: t("고스트"), wrap: true, options, value, onChange }) });
```

### 스위치 · 슬라이더 · 글자 입력 · 드롭다운

- **스위치**는 켜고 끄는 즉시 반영되는 설정에만. 이름은 `fieldRow`의 label이 붙는다(`for` = 스위치 id). 둘 중 하나를 고르는 데 이름이 필요하면 세그먼트.
- **슬라이더**는 늘 `rangeRow`로 값 칸과 함께. 값 칸 폭은 가능한 가장 긴 값에 맞춰 두므로 값이 바뀌어도 막대 길이가 흔들리지 않는다.
  한 구역의 슬라이더들은 `fillDialog`가 값 칸 폭을 가장 넓은 것에 맞춘다.
- **글자 입력**은 높이 `--control-h-s`(바꿀 때는 `--input-size`). 위아래 여백은 늘 같다. 옆에 버튼을 둘 때는 `.inline-control`([입력 | 버튼]) 안에 넣는다.
- **드롭다운**은 선택지가 많거나 설명이 필요할 때. 구조는 [`.select-value` \| 아래 화살표], 턱이 있으므로 버튼처럼 내용이 턱을 뺀 면의 가운데(높이를 바꿀 때는 `--select-size`). 목록은 `position: fixed`로 떠서 대화상자 스크롤에 잘리지 않는다.
- **스위치**는 어디서나 48×26. 크기를 바꾸지 않는다.

| 컨트롤 | 열어 둔 변수 |
| --- | --- |
| 버튼 | `--btn-size` `--btn-min` `--btn-px` `--btn-py` `--btn-gap` `--btn-font` `--btn-icon` |
| 세그먼트 칸 | `--seg-size` `--seg-min` `--seg-px` `--seg-py` `--seg-font` |
| 드롭다운 | `--select-size` |
| 글자 입력 | `--input-size` |
| 모든 컨트롤 | `--touch-min`(터치 화면에서 controls.css가 44px로 정한다) |

### 특수 버튼

모양이 따로 정해진 것들은 각자 class를 쓰고 `components.js`를 거치지 않는다. 새로 늘리지 않는다 — 꼭 필요하면 이 표와 테스트 허용 목록에 함께 올린다.

| 요소 | class | 위치 |
| --- | --- | --- |
| 색 견본 | `.color-swatch` | `js/ui/settings.js` |
| 피스 칩(색 고르기) | `.color-piece` | `js/ui/settings.js` |
| 퍼즐 단계 칸 | `.puzzle-tile` | `js/ui/puzzles.js` |
| 키 칸 | `.key-slot` | `js/ui/settings.js` |
| 퍼즐 편집 칸 | `.puzzle-editor-cell` | `js/ui/puzzle-editor.js` |
| 리플레이 표시 | `.replay-mark` | `js/main.js` |
| 로고 | `.logo-btn` | `index.html` 머리글 |

### 그 밖의 표면

| 컴포넌트 | 모양 | 코드 |
| --- | --- | --- |
| 계기판(HUD) | 카드 없이 이름(작게) 위 · 값(크게, 고정폭) 아래, 칸 사이 가는 선. 시간은 강조색 | `.hud` |
| 퍼즐 칸 | 번호 블록 격자. 깬 단계는 강조색 면, 다음 단계는 강조색 테두리 | `.puzzle-grid` `.puzzle-tile` |
| 색 고르기 | 피스 칩 한 줄(고른 피스는 솟음) + 16색 견본 격자. 정해진 색만(자유 색상 입력 없음) | `.color-picker` `.color-swatch` |
| 키 입력 표시 | 8칸 아이콘 줄, 누르는 동안 강조색. 한 프레임 탭도 110ms 남긴다 | `.input-display` |

포커스는 2px 강조색 윤곽선. 선택 상태는 시각 표시와 `aria-pressed`·`aria-selected`·`aria-checked`를 함께 쓴다. 값이나 탭이 바뀌어도 주변이 움직이지 않도록 숫자 폭과 알림 영역을 확보한다.

### 하지 말 것

| 하지 말 것 | 대신 |
| --- | --- |
| `window.confirm(…)`·`alert`·`prompt`(브라우저 기본 창) | 대화상자 안 한 버튼이면 `confirmButton()`(두 번 눌러 확정), 대화상자 밖 흐름이면 `ask({ title, message, okLabel })`(`js/ui/ask.js`, 앱 안 확인 대화상자 · Promise) |
| `document.createElement("button")`, `el("button", …)`, `el("input", …)`(여러 줄로 써도 같다) | `button()` `iconButton()` `segmented()` `toggle()` `slider()` `textInput()` `menuRow()` |
| `<button class="btn">편집</button>` (맨 글자) | `<button class="btn"><span class="btn-label">편집</span></button>` |
| 아이콘만 있는 버튼에 글자 없이 `class="btn"` | `iconButton({ icon, label })` 또는 `.btn-icon-only` + `aria-label` |
| `.foo .btn { padding: …; height: auto; line-height: … }` | `.foo .btn { --btn-py: …; --btn-size: auto; --btn-min: … }` |
| `.foo .btn { display: flex; align-items: …; justify-content: … }` | 그대로 두거나 `.btn-split` |
| 고른 칸만 굵게·크게 | 색만 바꾼다(크기·글자 위치 그대로) |
| 버튼을 `hidden`으로 빼서 옆 버튼이 밀림 | 자리는 두고 `disabled` + 이유를 설명 줄에, 또는 `.is-invisible` |
| 기호 글자(×, ←, ✓)나 이모지로 아이콘 | `js/ui/icons.js`의 SVG(`icon: "close"`) |
| 새 색·새 크기 값 직접 쓰기(`#333`, `37px`) | `css/tokens.css` 변수(`--surface-2`, `--control-h`) |
| `#mode-list .menu-row { grid-template-columns: … }`처럼 화면에서 줄 배치를 새로 짜기 | `controls.css`에 변형 class를 더하고 `menuRow()`에 선택지로 |
| 컨트롤 안쪽 요소(`.btn-label` `.menu-text` 등)에 `line-height`·`padding`·`margin`·`grid-row` | 컨트롤 변수, 또는 `controls.css`의 변형 |

### 검사

- `tests/unit/design-rules.test.mjs`
  - `controls.css` 밖의 CSS가 컨트롤(`.btn` 세그먼트 칸 `.select` `.text-input` `.switch` `.range` `.menu-row` `.tool-row` `.key-slot`)의
    `padding` `height` `min-height` `line-height` `display` `align-items` `justify-content` `gap` `font-size` `box-shadow` `transform` `grid-template-*`을 덮어쓰면 실패.
    컨트롤 안쪽 요소의 `line-height` `padding` `margin` `height` `position` `grid-row` `grid-column` 등도 실패
  - `index.html`의 `.btn` 안에 정해진 구조 밖의 내용(맨 글자 등)이 있으면 실패
  - `js/`에서 버튼·입력을 직접 만들면 실패(여러 줄 `el(\n "button"`도. 위 "특수 버튼"만 허용)
- `tests/helpers/ui-audit.mjs`(브라우저 UI 검수, 네 화면 크기): 모든 화면·대화상자를 돌며 보이는 컨트롤마다 잰다.
  - 버튼·세그먼트 칸: 구조, **내용 덩어리가 턱을 뺀 면의 가운데에서 가로·세로 1px 안**
  - 드롭다운·키 칸: 내용이 (턱을 뺀) 면의 세로 가운데 1px 안. 목록 줄·도구 줄: 오른쪽 화살표가 세로 가운데 1px 안, 정해진 구조
  - 글자 입력: 위아래 여백이 같다. 스위치: 48×26

## 화면

- **첫 화면**: 넓으면 [플레이 모드 · 처음 안내 · 규칙 | 연습과 기록 · 다시 보기] 두 칸, 680px 이하는 한 칸. 모드는 번호가 붙은 목록 줄(`menuRow`)로, 최고 기록·랭크를 오른쪽 같은 자리에 둔다. 데이터(백업·리플레이 파일)는 설정에 있다.
- **플레이**: 보드와 홀드·넥스트는 한 캔버스. 넓으면 보드 오른쪽에 계기판, 좁으면 보드 위 한 줄. 일시정지·결과는 보드 위 카드(위쪽 강조 띠).
- Sprint 결과에서 구간 기록을 펼쳐 볼 수 있다. 달리기 중에는 데스크톱에서 상대 보드와 진행 막대, 모바일에서 진행 막대만 보인다.
- **가로 휴대폰**(가로 방향이고 높이 520px 이하): 보드를 가운데 두고, 왼쪽에 계기판(두 칸 격자)과 이동 버튼(홀드·일시정지 / ← ↓ →),
  오른쪽에 회전·드롭 버튼(180°·다시 시작 / 반시계·하드·시계)을 둔다. 리플레이는 오른쪽 칸 전체에 조작을 모으고 프레임 단위 버튼은 뺀다.
  CPU 대전은 CPU 상황을 오른쪽 위에 숫자로만 보인다. 결과 카드는 키 표시를 빼고 글자를 줄인다.
- **가로 휴대폰의 대화상자**: 탭만 있는 대화상자(설정 등)는 화면을 채우고 [세로 탭 | 제목·내용·발] 두 칸으로 나눈다. 탭 칸이 높이를 다 써서 터치 44px 탭이 모두 보이고, 탭은 ←→뿐 아니라 ↑↓로도 옮긴다.
  탭 칸에 다른 조작이 함께 있는 대화상자(규칙 편집)는 위아래 배치 그대로.

## 접근성·편의

- 설정의 **접근성** 탭: 블록 무늬(피스마다 다른 표식 — `drawMark()`), 화면 읽기 알림(`#sr-status`, `role=status`), 진동, 시작 카운트다운(보통·짧게·없음).
- **화면·소리** 탭: 고스트 진하기(흐리게·보통·진하게), 격자 선, 화면 효과 줄이기, 색각 친화 색.
- **조작** 탭: 조작감 프리셋은 DAS·ARR·SDF 묶음이다. 슬라이더로 직접 바꾸면 프리셋 표시가 꺼지고 "직접 조절"이 된다. 터치 조작 방식은 버튼·제스처 중에서 고른다.
- 연습 모드에서는 정보 칸 아래 되돌리기 버튼과 U 키로 바로 앞 피스가 나온 순간으로 돌아간다(`js/modes/undo.js`).
- 처음 방문하면 첫 화면 위에 닫을 수 있는 안내 줄을 띄운다. 모달로 막지 않는다. 도움말은 머리글에서 언제든 연다.
- 소리는 처음에 꺼져 있다(교대 근무 공용 PC 배려). 설정에서 크기를 올리면 그 값이 남는다.
- 레이아웃은 `tests/helpers/ui-audit.mjs` 검수(넘침·잘림·겹침)를 통과해야 한다. 검수 화면 크기: 1280×800 · 390×844 · 768×1024 · 740×360(가로).

## 보드 테마

| 표시 이름 | 저장 키 | 보드 | 블록 |
| --- | --- | --- | --- |
| 스튜디오 | `modern` | 차콜 `#202421` | 선명한 무광색, 부드러운 모서리 |
| 페이퍼 | `retro` | 종이색 `#eeede3` | 잉크색, 낮은 모서리 곡률 |
| 슬레이트 | `minimal` | 푸른 회색 `#262d35` | 낮은 채도, 셀 사이 여백 |
| 그라파이트 | `graphite` | 숯빛 무채색 `#17181a` | 채도를 낮춘 색, 윗면만 살짝 밝게(마감 `edge`) |
| 프레임 | `frame` | 검정 `#0f1012` | 속은 어둡고 테두리만 피스 색(마감 `frame`) |
| 스톤 | `stone` | 밝은 돌빛 `#e4e2dc` | 흙빛이 도는 진한 색, 모서리 없음 |
| 미드나잇 | `midnight` | 짙은 남색 `#111827` | 보석빛을 눌러 담은 단색 |
| 포레스트 | `forest` | 숲빛 `#151d18` | 이끼·흙 계열, 윗면만 살짝 밝게(마감 `edge`) |
| 화이트 | `white` | 흰색 `#fafafa` | 선명하고 묵직한 단색 |

저장 키를 유지해 기존 설정에서 새 테마를 이어서 선택할 수 있다. 모든 테마는 약한 격자와 윤곽선 고스트를 공유하고, 블록 마감(`finish`: flat · edge · frame)으로 질감을 나눈다. 마감은 그림자 흐림 없이 칠하기 한두 번으로 그려 공용 PC에서도 가볍다. 색각 친화 옵션을 켜면 블록과 고스트에 공통 팔레트를 사용한다. "직접 고르기"는 피스마다 견본 색으로 바꾸고, 고르지 않은 피스는 테마 색을 쓴다(`paletteFor()`). 테마 정의는 `js/render/themes.js`에서 관리한다.

## 모션

| 테마 | 한 칸 이동 | 착지 | 하드 드롭 잔상 | 줄 삭제 |
| --- | --- | --- | --- | --- |
| 스튜디오 | 42ms | 165ms · 높이 최대 20% 압축, 짧은 반동 | 최대 2.5칸 · 115ms | 가운데서 양옆으로 퍼지는 띠 · 205ms |
| 페이퍼 | 24ms | 115ms · 높이 최대 12% 압축, 바로 복원 | 최대 1칸 · 75ms | 왼쪽에서 오른쪽으로 진행하는 가는 선 · 155ms |
| 슬레이트 | 56ms | 215ms · 높이 최대 16% 압축, 완만한 반동 | 최대 2칸 · 155ms | 위아래로 벌어지는 평행선 · 245ms |
| 그라파이트 | 36ms | 150ms · 높이 최대 11% 압축, 짧은 반동 | 최대 2칸 · 110ms | 줄 전체가 번쩍였다가 가늘어짐 · 180ms |
| 프레임 | 30ms | 140ms · 높이 최대 10% 압축, 짧은 반동 | 최대 3칸 · 130ms | 오른쪽에서 왼쪽으로 훑는 선 · 210ms |
| 스톤 | 28ms | 120ms · 높이 최대 8% 압축, 바로 복원 | 최대 1.5칸 · 85ms | 칸마다 작은 네모가 줄어들며 사라짐 · 210ms |
| 미드나잇 | 44ms | 175ms · 높이 최대 13% 압축, 짧은 반동 | 최대 2.5칸 · 125ms | 양 끝에서 가운데로 모여 닫힘 · 215ms |
| 포레스트 | 50ms | 185ms · 높이 최대 9.5% 압축, 아주 작은 반동 | 최대 2칸 · 120ms | 칸 높이 그대로 옅어짐 · 240ms |
| 화이트 | 26ms | 125ms · 높이 최대 14% 압축, 바로 복원 | 최대 1.5칸 · 80ms | 얇은 띠가 반 칸 아래로 가라앉음 · 200ms |

최대 압축은 여섯 칸 이상 하드 드롭했을 때 적용한다. 착지는 열별 아래 모서리를 기준으로 높이만 바꾼다. 줄이 지워지는 턴에는 줄 삭제 표시를 우선하고, 네 줄을 한 번에 지우면 표시를 조금 더 진하게 한다. 모든 효과는 보드의 테마 색을 사용하며 충돌, 점수, 리플레이 기록은 엔진 판정 그대로다.

‘줄임’은 위치 보간과 착지·하드 드롭 모션을 생략하고, 줄 삭제 위치에 고정 폭의 선만 175ms 표시한다. ‘끄기’는 효과를 즉시 생략한다. OS에서 동작 줄이기를 켜면 새 설정의 기본 효과 수준이 ‘줄임’이다.

## 변경 후 확인

`npm test`로 판정과 브라우저 흐름을 확인한다(컴포넌트 약속 검사 포함). 홈과 게임은 라이트·다크, 좁은 화면에서 각각 확인한다. 화면 탭에서 아홉 테마와 효과 수준을 바꾸고, 착지·줄 삭제·일시정지·다시 시작을 확인한다. 배포 전 `npm run build`와 `npm run build:pages`를 실행한다.
