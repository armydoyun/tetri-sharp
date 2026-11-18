# Tetri#

규칙(회전 시스템, 미노 생성기, 고정 방식, 중력…)을 직접 조합할 수 있는 낙하 블록 퍼즐.
HTML · CSS · JS로 만들고, 배포물은 **`index.html` 파일 하나**입니다.

기획: [docs/PLAN.md](docs/PLAN.md)

## 개발

```bash
npm install
npx serve .        # 또는 아무 정적 서버. ES 모듈이라 file://로는 개발용 index.html이 안 열린다.
```

| 명령 | 하는 일 |
|---|---|
| `npm run build` | `deploy/index.html` 한 파일 생성 (file://로 더블클릭해도 동작) |
| `npm run test:unit` | Node 단위 테스트 (코어·규칙·빌드 도구) |
| `npm run test:browser` | 배포본을 Chromium으로 열어 보는 테스트 (`npx playwright install chromium` 필요) |
| `npm run lint` / `npm run format` | ESLint / Prettier |

## CI

`.github/workflows/ci.yml` — 모든 push·PR에서 lint → unit/browser 테스트 → 모두 통과하면 단일 파일 빌드를
실행 페이지의 **Artifacts**(`tetri-sharp-<커밋 SHA>`)로 올립니다.
