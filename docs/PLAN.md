# Tetri# 구현 기획서

> 규칙을 갈아끼울 수 있는 낙하 블록 퍼즐. HTML/CSS/JS로 개발하고, 배포물은 **`index.html` 파일 하나**.

---

## 0. 핵심 결정 요약

| 항목 | 결정 | 이유 |
|---|---|---|
| 언어 | 순수 JS (ES Modules) + JSDoc 타입 주석 | "html/css/js만" 조건 유지, 에디터 자동완성은 JSDoc으로 확보 |
| 번들 | **esbuild + `tools/build.mjs`** (field-studio와 같은 방식) | 개발은 ES 모듈로 쪼개고, 빌드 시 JS/CSS를 `deploy/index.html` 하나로 인라인 |
| 런타임 라이브러리 | **기본 0개** (필요 시 소형만: 예: 효과음용 ZzFX ~1KB) | 테트리스류 로직은 작아서 엔진이 필요 없음 |
| 개발 전용 의존성 | `esbuild`, `eslint`, `prettier`, `playwright` (테스트는 Node 내장 `node:test`) | 번들에 안 들어감 |
| 렌더링 | 보드/미노/이펙트 = `<canvas>` 2D, 메뉴/설정/HUD = DOM + CSS | 게임 화면은 빠르게, UI는 스타일링 쉽게 |
| 게임 루프 | **고정 타임스텝 60Hz 로직 틱** + rAF 렌더 (누적기 방식) | 규칙을 "프레임" 단위로 정의 → NES/TGM 계열 규칙 재현 정확, 리플레이 결정론 보장 |
| 랜덤 | 시드 기반 PRNG (mulberry32 등) | 리플레이, 같은 시드로 기록 비교 |
| 저장 | `localStorage` (설정, 키맵, 개인 기록, 리플레이) | 서버 없음 |
| CI | GitHub Actions (`.github/workflows/ci.yml`) | push마다 lint → unit/browser 테스트 → 통과 시 단일 파일 빌드를 Artifacts로 업로드 |

> 제미나이 답변과 다른 점: "deltaTime으로 ms 단위 처리"보다 **고정 틱(프레임) 단위**를 추천합니다.
> 가변 deltaTime은 144Hz/60Hz에서 미세하게 결과가 달라져 리플레이가 깨지고, 클래식 규칙(예: "레벨 0은 48프레임마다 1칸")을 그대로 옮기기 어렵습니다.
> 화면은 모니터 주사율대로 그리되, 로직은 항상 1/60초 단위로만 진행합니다. 사용자 설정(DAS/ARR)은 ms로 입력받아 내부에서 프레임으로 환산합니다.

---

## 1. 아키텍처

```
┌─────────────── UI (DOM) ───────────────┐
│ 메뉴 · 모드 선택 · 규칙 편집기 · 설정 · 결과 화면 │
└──────────────┬─────────────────────────┘
               │ config(RuleSet + Mode + Handling)
┌──────────────▼──────────────┐   events   ┌──────────────┐
│        Core Engine (순수 JS)  │──────────▶│ Renderer      │ canvas
│  board · piece · step(input) │──────────▶│ Audio         │ WebAudio
│  DOM/시간/Math.random 사용 금지 │──────────▶│ Stats/HUD     │ DOM
└──────────────▲──────────────┘            └──────────────┘
               │ 틱마다 입력 상태
┌──────────────┴──────────────┐
│ Input (키보드/게임패드 → 액션) │  DAS/ARR/SDF 처리, 키 리매핑
└─────────────────────────────┘
```

원칙
1. **Core는 DOM을 모른다.** `engine.step(inputFrame)`만 호출하면 상태가 한 틱 진행되고, 발생한 사건을 `events` 배열로 돌려준다 (`lock`, `lineClear{lines, tspin, b2b, combo}`, `hold`, `spawn`, `topOut` ...). → Node에서 `node:test`로 그대로 테스트 가능.
2. **규칙은 데이터 + 전략 함수.** 엔진 안에 `if (mode === 'nes')` 같은 분기를 두지 않고, RuleSet 객체가 들고 있는 전략 모듈을 호출한다.
3. **Mode ≠ RuleSet.** RuleSet은 "조작 물리"(회전, 고정, 생성기...), Mode는 "목표와 진행"(40줄 끝, 2분 제한, 레벨업 곡선...). 둘을 조합해 한 판을 만든다.
4. **결정론.** 같은 시드 + 같은 RuleSet + 같은 입력 기록 = 같은 결과. 리플레이는 입력 로그만 저장하면 된다.

---

## 2. 폴더 구조

```
tetri-sharp/
├─ index.html
├─ tools/build.mjs           # esbuild 번들 + HTML 인라인 → deploy/index.html
├─ .github/workflows/ci.yml  # lint · 테스트 · 빌드
├─ package.json
├─ js/
│  ├─ main.js                # 부트스트랩, 화면 전환
│  ├─ core/
│  │  ├─ engine.js           # createGame(config, seed) → { step, getState }
│  │  ├─ board.js            # 10×40 Uint8Array, 충돌/라인 삭제
│  │  ├─ pieces.js           # 7종 미노 모양(회전 상태 0/R/2/L)
│  │  ├─ rng.js              # 시드 PRNG
│  │  └─ scoring.js          # 점수 테이블, T-spin 판정, B2B, 콤보, 퍼펙트 클리어
│  ├─ rules/
│  │  ├─ rotation/           # srs.js, ars.js, classic.js (킥 테이블)
│  │  ├─ randomizer/         # bag7.js, bag14.js, random.js, nesReroll.js, history4.js
│  │  ├─ lock/               # moveReset.js, stepReset.js, infinite.js, none.js
│  │  ├─ gravity/            # 레벨→프레임당 낙하량 테이블
│  │  └─ presets.js          # Modern / Retro / Arcade / Custom
│  ├─ modes/                 # sprint.js, marathon.js, ultra.js, zen.js, master.js, dig.js
│  ├─ input/
│  │  ├─ keyboard.js         # keydown/keyup → 액션 상태
│  │  ├─ handling.js         # DAS, ARR, SDF, DCD 계산
│  │  └─ keymap.js
│  ├─ render/
│  │  ├─ canvas.js           # DPR 대응, 보드/고스트/홀드/넥스트
│  │  ├─ skins.js
│  │  └─ fx.js               # 라인 클리어 플래시, 파티클, 화면 흔들림
│  ├─ audio/sfx.js
│  ├─ ui/                    # menu.js, ruleEditor.js, settings.js, results.js
│  ├─ storage/               # settings.js, records.js, replays.js
├─ css/                     # tokens.css → base.css → game.css (index.html 링크 순서 = 빌드 순서)
└─ tests/
   ├─ unit/                  # *.test.mjs — Node만으로 (코어·규칙·빌드 도구)
   └─ browser/               # *.test.mjs — 배포본을 Chromium으로 열어 확인
```

---

## 3. RuleSet 스키마 (규칙 샌드박스의 심장)

```js
/** @typedef {Object} RuleSet */
{
  id: 'modern',
  rotation: 'srs',              // 'srs' | 'srs+' (I 대칭킥) | 'ars' | 'classic' | 'none-kick'
  randomizer: 'bag7',           // 'bag7' | 'bag14' | 'random' | 'nesReroll' | 'history4'
  previewCount: 5,              // 0~6
  hold: { enabled: true, infinite: false },   // infinite=true면 매 미노 여러 번 홀드
  ghost: true,
  hardDrop: true,
  softDrop: { mode: 'factor' }, // 'factor'(SDF 사용) | 'classic'(1/2G 고정)
  lock: {
    type: 'moveReset',          // 'moveReset' | 'stepReset' | 'infinite' | 'none'
    delayFrames: 30,            // 0.5초
    maxResets: 15,
  },
  are: { spawnFrames: 0, lineClearFrames: 0 },   // 생성 지연 / 라인 클리어 지연
  spawn: { row: 18,      // y-down 기준: 보이는 영역(20~39) 바로 위 orientation: 'guideline', irs: true, ihs: true },
  gravity: 'guidelineCurve',    // 'guidelineCurve' | 'nesTable' | 'tgmTable' | 고정값 {g: 20}
  tspin: 'threeCorner',         // 'none' | 'threeCorner' | 'immobile'(all-spin)
  scoring: 'guideline',         // 'guideline' | 'nes' | 'none'
  topOut: ['blockOut', 'lockOut'],
}
```

### 프리셋 (상표·특정 게임 재현 이슈를 피하려고 이름은 일반 명칭으로)

| 프리셋 | 회전 | 생성기 | 홀드/넥스트 | 고정 | 특징 |
|---|---|---|---|---|---|
| **Modern** | SRS | 7-Bag | O / 5 | Move reset 15회, 30F | 하드드롭, 고스트, T-spin, B2B, 콤보 |
| **Retro** | 킥 없음 (우회전 기준) | 직전 중복 시 1회 재추첨 | X / 1 | 없음 (닿고 다음 낙하 시 고정) | 하드드롭·고스트 X, 레벨별 고정 낙하표, DAS 16F/6F 고정 |
| **Arcade** | ARS (중앙열 규칙 포함 단순 킥) | 최근 4개 이력 기반 재추첨 | 선택 / 1~3 | Step reset (내려갈 때만 리셋) | IRS, ARE 존재, 고중력 20G 대응 |
| **Custom** | 전부 자유 조합 | | | | 결과 화면에 "Custom" 태그, 기록 별도 분리 |

**기록 분리 규칙:** RuleSet을 정규화해 해시를 만들고, `기록 키 = 모드 + 규칙 해시`. 커스텀 규칙으로 세운 40줄 기록이 Modern 기록과 섞이지 않게.

---

## 4. 코어 엔진 상세

### 4.1 한 틱(step)의 순서
```
1. 입력 반영 (홀드 → 회전 → 좌우 이동(DAS/ARR) → 소프트/하드 드롭)
2. 중력 누적 (gravityAccumulator += G; 정수 부분만큼 낙하, 20G면 즉시 바닥)
3. 바닥 접촉 시 lock 전략에 따라 타이머 진행/리셋 판단
4. 고정 → 라인 판정 → T-spin/점수/B2B/콤보 → events 기록
5. ARE/라인 클리어 지연 처리 → 다음 미노 스폰 (IRS/IHS 적용)
6. 스폰 위치 충돌 시 topOut
7. mode.update(state, events) → 종료 조건 체크
```

### 4.2 보드
- `Uint8Array(10 * 40)`, 0 = 빈칸, 1~7 = 미노 색, 8 = 가비지. 화면에는 아래 20줄(+버퍼 일부)만 표시.
- 좌표는 y가 **아래로** 증가(0 = 맨 위 버퍼). 미노 모양 좌표와 방향이 같아 변환이 필요 없다.
- 라인 삭제는 `copyWithin`으로 한 번에 당김.

### 4.3 회전 시스템 인터페이스
```js
// rules/rotation/srs.js
export default {
  spawnState: (type) => 0,
  shape: (type, rot) => cells,                // 4칸 좌표
  kicks: (type, from, to) => [[0,0],[-1,0],...], // 순서대로 시도
}
```
엔진은 `kicks()` 결과를 순서대로 시도해 첫 성공 위치를 적용하고, **마지막 동작이 회전이었는지 + 몇 번째 킥을 썼는지**를 기록 → T-spin(Mini 포함) 판정에 사용.

### 4.4 생성기 인터페이스
```js
export default (rng) => ({ next(): PieceType, peek(n): PieceType[] })
```
넥스트 큐는 엔진이 `previewCount`만큼 미리 채워둔다.

### 4.5 고정 규칙
| 타입 | 동작 |
|---|---|
| `moveReset` | 이동/회전 성공 시 타이머 리셋, `maxResets` 소진 시 바로 고정 (가장 낮은 행 갱신 시 카운트 초기화) |
| `stepReset` | 더 낮은 행에 도달했을 때만 리셋 |
| `infinite` | 이동/회전 할 때마다 무제한 리셋 |
| `none` | 접지 후 다음 중력 틱에 즉시 고정 |

---

## 5. 입력 & 조작감 (Handling)

설정 화면에서 개인별로 저장 (RuleSet과 별개 — 단, Retro 프리셋은 고정값 강제 옵션).

| 설정 | 기본값 | 범위 |
|---|---|---|
| DAS | 133ms | 0~333 |
| ARR | 10ms (0 = 즉시 벽까지) | 0~83 |
| SDF (소프트드롭 배율) | ×20 (∞ = 즉시) | 5~41, ∞ |
| DCD (DAS 캔슬 지연) | 0ms | 0~333 |
| 좌우 동시 입력 | 나중 입력 우선 | 우선/정지 |
| IRS/IHS | 켜짐 | |

구현 포인트
- `keydown`의 `e.repeat`는 무시하고 DAS는 직접 계산 (OS 키 반복 설정 영향 제거).
- `window.blur` 시 모든 키 해제 + 일시정지.
- 키 리매핑 UI: "키 누르기 대기" 방식, 중복 키 경고.
- (후순위) Gamepad API 지원.

---

## 6. 모드

| 모드 | 목표/종료 | 비고 |
|---|---|---|
| **Sprint 40L** | 40줄 삭제 시간 | ★ 첫 구현 추천 — 중력 낮음, 점수 계산 불필요, 조작감 검증에 최적 |
| **Marathon** | 150줄 또는 무한, 10줄마다 레벨업 | 중력 곡선 + 점수 시스템 검증 |
| **Ultra** | 2분 내 최고 점수 | T-spin/B2B 점수 검증 |
| **Zen** | 종료 없음, 탑아웃 시 아래 줄 정리 | 규칙 실험용 샌드박스와 궁합 좋음 |
| **Master (20G)** | 레벨 진행에 따라 20G 도달 | Arcade 프리셋과 함께, IRS/ARE 검증 |
| **Dig** | 가비지 N줄 파기 | 가비지 생성기(시드 기반) 필요 |

Mode 인터페이스:
```js
export default {
  id: 'sprint40',
  defaultRules: 'modern',
  init(state) {},
  gravityFor(state) {},       // 레벨/진행에 따른 G
  update(state, events) {},   // 진행도 갱신
  isFinished(state) {},       // { done, result: 'clear' | 'topout' }
  hud: ['time', 'lines', 'pps', 'kpp'],
}
```

---

## 7. 렌더링 & 연출

- Canvas: `devicePixelRatio` 반영, 셀 크기는 창 크기에 맞게 정수 스냅 (블러 방지).
- 레이어 순서: 배경 그리드 → 보드 → 고스트 → 현재 미노(lock 진행도에 따라 밝기 변화) → 이펙트.
- 홀드/넥스트는 같은 캔버스 혹은 작은 캔버스 2개.
- HUD(시간, 줄, PPS, 점수)는 DOM — 폰트/레이아웃 다루기 쉬움. 매 프레임 갱신하지 말고 값이 바뀔 때만.
- 이펙트는 events를 구독: 라인 클리어 플래시, "T-SPIN DOUBLE / B2B / PERFECT CLEAR" 텍스트 팝업, 하드드롭 잔상, 소량의 파티클.
- 접근성/설정: 이펙트 강도, 화면 흔들림 끄기, 색맹 친화 스킨.
- 오디오: Web Audio로 짧은 효과음 합성(파일 없이) → 단일 파일 용량 유지.

---

## 8. 저장 / 리플레이

- `localStorage` 키 네임스페이스: `tetrisharp:settings`, `tetrisharp:keymap`, `tetrisharp:records`, `tetrisharp:replays`
- 스키마 버전 필드 넣어 두기 (`{ v: 1, ... }`) → 나중에 구조 바뀌어도 마이그레이션 가능.
- 리플레이 = `{ version, seed, ruleSet, mode, handling, inputs: [[frame, actionBitmask], ...] }` (변화가 있는 프레임만 기록 → 매우 작음)
- 리플레이 내보내기/가져오기: JSON 텍스트 복사·붙여넣기 or 파일 다운로드.

---

## 9. 테스트 전략

- `npm run test:unit` — `node:test`, core/rules/빌드 도구
- `npm run test:browser` — 단일 파일 배포본을 Chromium에서 열어 오류·외부 요청·렌더링 확인
- CI에서 둘 다 실행, 둘 다 통과해야 빌드 업로드

단위 테스트 대상

- SRS 킥: 대표 상황(T-spin Triple 셋업, I 미노 벽킥) 스냅샷
- 7-Bag: 7개마다 정확히 1세트, 시드 고정 시 동일 수열
- T-spin 판정: 3-corner / Mini / 킥 5번째 예외
- 라인 삭제/퍼펙트 클리어
- 고정 규칙: moveReset 15회 후 강제 고정
- **리플레이 결정론**: 입력 로그 재생 결과 보드 해시 일치

---

## 10. 개발 단계 (마일스톤)

| 단계 | 내용 | 완료 기준 |
|---|---|---|
| **M0 셋업** ✅ | esbuild 단일 파일 빌드, ESLint/Prettier, node:test, Playwright, GitHub Actions, 빈 보드 | CI 통과 시 Artifacts에 `index.html` 하나 |
| **M1 코어 MVP** ✅ | 보드, 7종 미노, SRS, 7-Bag, 중력, moveReset, 하드드롭, 고스트, 홀드, 넥스트 5 | 키보드로 끝없이 플레이 가능 |
| **M2 조작감** ✅ | DAS/ARR/SDF, 키 리매핑, 설정 저장 | ARR 0 / SDF ∞ 정상 동작 |
| **M3 Sprint 40L** ✅ (+ Endless) | 모드 인터페이스, 타이머, 결과 화면, 개인 기록 | 첫 "완성된 게임" |
| **M4 점수 & Marathon/Ultra** ✅ | T-spin, B2B, 콤보, PC, 레벨 곡선 | |
| **M5 규칙 샌드박스** ✅ | 전략 모듈 추가(ARS, Classic, 생성기들, lock 타입), 프리셋, 규칙 편집 UI, 기록 분리 | Modern/Retro/Arcade 전환 |
| **M6 고속 플레이** ✅ | ARE, IRS/IHS, 20G, Master 모드 | |
| **M7 연출** ✅ (효과음은 M10) | 이펙트, 효과음, 스킨 | |
| **M8 리플레이 & 부가** ✅ | 리플레이 저장/재생, Zen, Dig, 게임패드 | |

| **M9 마무리·배포** ✅ | 기록 화면·최고 기록 리플레이·Sprint 구간 기록, 게임패드 버튼 바꾸기, 판 통계, Custom 규칙 공유(코드·링크), 연습 모드, 터치 조작, PWA + GitHub Pages | main에 합치면 Pages 주소로 바로 플레이 |
| **M10 확장** ✅ | 효과음, 저장 데이터 백업·복원, Survival 모드, Ultra·Dig 달리기, 연습(TST·PC 마무리·피네스), 테마 미리보기, 상위 3개 리플레이, 영어 UI | 모든 화면이 영어로도 잘림 없이 보이고, 백업 파일로 다른 브라우저에 그대로 옮겨진다 |

---

## 10-1. 다음 할 일 (우선순위 1)

| 항목 | 내용 |
|---|---|
| **CPU 대전 (1:1)** ✅ | `js/modes/versus.js`(공격표·상쇄·받기), `js/ai/bot.js`(모든 자리 평가 + 홀드 비교, 프레임마다 버튼 입력). 난이도 4단계(PPS·실수율·홀드), 난이도별 전적 |
| **리플레이 탐색·분석** | 진행 막대를 눌러 원하는 시점으로(처음부터 빠르게 다시 돌림), 뒤로 가기, 피네스 실수·오래 고민한 피스 위치를 막대에 표시 |
| **오늘의 도전** | 날짜로 정한 시드로 모두 같은 블록 순서. 결과를 코드·링크로 공유하고, 받은 코드로 상대 리플레이와 달리기 |

## 11. 리스크 / 주의

- **상표:** "Tetris"는 등록 상표이며 권리사가 적극적으로 대응하는 편. 개인 학습용이면 문제없지만 공개 배포 시 UI·설명에 해당 상표/로고/공식 테마곡 사용은 피하고, 프리셋 이름도 일반 명칭(Modern/Retro/Arcade)을 쓰는 것을 권장.
- **ARS 구현 난이도:** 중앙열 규칙 등 예외가 많아 M5 후반에 배치. SRS로 엔진 인터페이스를 먼저 굳힌 뒤 추가.
- **브라우저 키 이벤트:** 스페이스/방향키 스크롤 방지(`preventDefault`), 한글 IME 상태에서 `e.key`가 달라지므로 **`e.code` 기준**으로 매핑.
- **탭 비활성화:** rAF가 멈추므로 복귀 시 누적된 시간을 한 번에 시뮬레이션하지 말고 자동 일시정지.
