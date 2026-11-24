## 무엇을 왜 바꿨나

<!-- 한두 줄. 리뷰 문서 항목(F·U 번호)이 있으면 적는다 -->

## 화면이 바뀌었다면

<!-- 바뀐 화면과 크기(데스크톱·휴대폰 세로·가로). 스크린숏이 있으면 붙인다 -->

## 확인 (AGENTS.md)

- [ ] 버튼·세그먼트·스위치·입력은 `js/ui/components.js`로만 만들었다(`el("button")`·`createElement("button")` 없음)
- [ ] 컨트롤의 여백·높이·정렬은 `css/controls.css`나 `--btn-*` 같은 변수로만 바꿨다
- [ ] 상태가 바뀌어도 크기·위치가 그대로다(흐름 안 요소를 `hidden`으로 빼지 않았다)
- [ ] 되돌릴 수 없는 일은 `confirmButton()`(브라우저 확인창 없음)
- [ ] 화면 문구는 `t("…")`로 감싸고 `js/i18n/en.js`에 영어를 더했다
- [ ] `npm run lint` · `npm run typecheck` · `npm run format:check` · `npm test` 통과
- [ ] 검사를 끄거나 허용 목록을 늘려서 통과시키지 않았다

CI의 **all checks pass**가 초록이어야 머지한다.
