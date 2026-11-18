# Tetri#

규칙(회전 시스템, 미노 생성기, 고정 방식, 중력…)을 직접 조합할 수 있는 낙하 블록 퍼즐.
HTML · CSS · JS로 만들고, 배포물은 **`index.html` 파일 하나**입니다.

기획: [docs/PLAN.md](docs/PLAN.md) · 디자인 시스템: [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md)

## 들어 있는 것

- **모드:** Sprint 40L · Marathon(150줄) · Ultra(2분) · Master(레벨 999, 500부터 20G) · Dig(쓰레기 10줄) · Endless
- **규칙:** Modern · Retro · Arcade 프리셋과 Custom 편집기(회전 SRS/ARS/킥 없음, 생성기 5종, 고정 방식 4종,
  넥스트·홀드·고스트·하드 드롭, ARE, IRS/IHS, 점수표, 조작감 고정). 기록은 모드 × 규칙 조합마다 따로 저장
- **조작:** DAS/ARR/SDF 조절, 키 변경(동작마다 2개), 게임패드(표준 배치)
- **점수:** T-spin(Mini 포함)·B2B·콤보·퍼펙트 클리어
- **기록 이름:** 기록 화면에서 이름을 저장하면 이후 기록에 표시됩니다. 이름과 기록은 이 브라우저에 저장됩니다.
- **훈련:** Sprint 40L 결과에서 구간별 최고 기록 비교, 2줄 우물 연습과 세션 연속 성공 기록
- **리플레이:** 시드 + 입력 기록만으로 재생, 진행률과 한 프레임씩 보기, 파일로 저장·열기(열 때 결과를 다시 계산해 검증)
- **화면:** 스튜디오 · 페이퍼 · 슬레이트 보드 테마, 착지 눌림과 짧은 이동, 색각 친화 팔레트, 시스템 라이트/다크

## 개발

```bash
npm install
npx serve .        # 또는 아무 정적 서버. ES 모듈이라 file://로는 개발용 index.html이 안 열린다.
```

| 명령 | 하는 일 |
|---|---|
| `npm run build` | `deploy/index.html` 한 파일 생성 (file://로 더블클릭해도 동작) |
| `npm run build:pages` | `deploy-pages/` — 위 파일 + 설치형 앱(PWA) 파일. GitHub Pages용 |
| `npm run test:unit` | Node 단위 테스트 (코어·규칙·빌드 도구) |
| `npm run test:browser` | 배포본을 Chromium으로 열어 보는 테스트 (`npx playwright install chromium` 필요) |
| `npm run lint` / `npm run format` | ESLint / Prettier |

## CI

`.github/workflows/ci.yml` — 모든 push·PR에서 lint → unit/browser 테스트 → 모두 통과하면 단일 파일 빌드를
실행 페이지의 **Artifacts**(`tetri-sharp-<커밋 SHA>`)로 올립니다.

## 배포 (GitHub Pages)

`.github/workflows/pages.yml` — `main`에 push되면 `npm run build:pages` 결과를 GitHub Pages로 배포합니다.
배포본은 설치형 앱(PWA)이라 한 번 열면 인터넷 없이도 열리고, 휴대폰 홈 화면에 추가할 수 있습니다.

처음 한 번만:
1. 저장소 **Settings → Pages → Build and deployment → Source**를 **GitHub Actions**로.
2. 기본 브랜치를 `main`으로(Settings → General → Default branch). Pages 배포 환경은 기본 브랜치만 허용합니다.
