// UI 검수: 지금 화면에서 레이아웃 문제를 찾는다(브라우저 안에서 돈다).
//  - 가로 넘침: 페이지·스크롤 영역에 가로 스크롤이 생김, 요소가 글자를 잘라 숨김(…)
//  - 밖으로 나감: 보이는 요소가 자기를 잘라 내는 조상(overflow ≠ visible)이나 화면 밖으로 삐져나감
//  - 겹침: 서로 다른 글자 덩어리가 같은 자리에 겹쳐 그려짐
// 반환: ["종류 · 요소 설명", ...]
export const auditInPage = () => {
  const problems = [];
  const describe = el => {
    const id = el.id ? `#${el.id}` : "";
    const cls =
      typeof el.className === "string" && el.className ? `.${el.className.trim().split(/\s+/).join(".")}` : "";
    const text = (el.textContent || el.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ").slice(0, 24);
    return `${el.tagName.toLowerCase()}${id}${cls}${text ? ` "${text}"` : ""}`;
  };
  const visible = el => {
    if (!(el instanceof HTMLElement || el instanceof SVGElement)) return false;
    // 접힌 <details> 안, visibility·opacity로 숨긴 것까지 걸러 낸다
    if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  /** 글자가 들어가는 상자(inline이 아닌 것) */
  const clientBox = el => el.clientWidth > 0 && getComputedStyle(el).display !== "inline";
  /** 실제로 보이는 영역: 잘라 내는 조상들(overflow ≠ visible)과 화면에 맞춰 자른 상자 */
  const clipped = (el, rect) => {
    let { left, top, right, bottom } = rect;
    for (let p = el.parentElement; p; p = p.parentElement) {
      const ps = getComputedStyle(p);
      if (ps.overflowX !== "visible" || ps.overflowY !== "visible") {
        const pr = p.getBoundingClientRect();
        left = Math.max(left, pr.left);
        top = Math.max(top, pr.top);
        right = Math.min(right, pr.right);
        bottom = Math.min(bottom, pr.bottom);
      }
    }
    return { left, top, right: Math.min(right, innerWidth), bottom: Math.min(bottom, innerHeight) };
  };
  // 열린 모달 대화상자가 있으면 그것만 본다(뒤 화면은 가려져 있다)
  const modal = [...document.querySelectorAll("dialog[open]")].pop();
  const root = modal ?? document.body;
  const all = [root, ...root.querySelectorAll("*")].filter(visible);
  const extra = modal ? [...document.querySelectorAll(".select-list")].filter(visible) : [];

  // 1) 페이지 가로 스크롤
  const doc = document.documentElement;
  if (doc.scrollWidth > doc.clientWidth + 1) problems.push(`페이지 가로 넘침 ${doc.scrollWidth}>${doc.clientWidth}`);
  // 게임 화면은 한 화면에 들어가야 한다(보드가 화면 높이에 맞춰 줄어든다)
  if (!modal && document.body.dataset.screen !== "menu" && doc.scrollHeight > innerHeight + 1)
    problems.push(`게임 화면 세로 넘침 ${doc.scrollHeight}>${innerHeight}`);

  for (const el of [...all, ...extra.flatMap(l => [l, ...l.querySelectorAll("*")])]) {
    if (el instanceof SVGElement && !(el instanceof SVGSVGElement)) continue;
    const s = getComputedStyle(el);
    // 2) 가로 스크롤·잘림
    if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0 && !["CANVAS", "svg"].includes(el.tagName)) {
      const clips = s.overflowX !== "visible" || s.textOverflow === "ellipsis";
      if (clips && !(el instanceof HTMLInputElement))
        problems.push(`가로 넘침 · ${describe(el)} ${el.scrollWidth}>${el.clientWidth}`);
    }
    // 2-0) 글자가 자기 칸보다 넓음(잘리지 않고 밖으로 비쳐 나가도 문제): 직접 글자를 가진 상자만
    if (
      clientBox(el) &&
      el.scrollWidth > el.clientWidth + 1 &&
      [...el.childNodes].some(n => n.nodeType === 3 && n.nodeValue.trim()) &&
      !(el instanceof HTMLInputElement)
    )
      problems.push(`글자 넘침 · ${describe(el)} ${el.scrollWidth}>${el.clientWidth}`);
    // 2-1) 세로 잘림: 높이가 정해진 칸(overflow hidden, 줄 수 제한)에서 글자가 아래로 잘림. 스크롤 영역은 정상
    if (
      el.scrollHeight > el.clientHeight + 2 &&
      el.clientHeight > 0 &&
      s.overflowY === "hidden" &&
      (el.textContent ?? "").trim() &&
      !["CANVAS", "svg", "DIALOG"].includes(el.tagName)
    )
      problems.push(`세로 잘림 · ${describe(el)} ${el.scrollHeight}>${el.clientHeight}`);
    // 3) 잘라 내는 조상 밖으로 삐져나감
    const r = el.getBoundingClientRect();
    if (r.width < 1) continue;
    let p = el.parentElement;
    while (p && p !== document.body) {
      const ps = getComputedStyle(p);
      if (ps.overflowX !== "visible" || ps.overflowY !== "visible") {
        const pr = p.getBoundingClientRect();
        const bl = parseFloat(ps.borderLeftWidth) || 0;
        const br = parseFloat(ps.borderRightWidth) || 0;
        if (r.left < pr.left + bl - 1 || r.right > pr.right - br + 1) {
          // 스크롤 영역 안에서 가로로 나간 것만(세로 스크롤은 정상)
          if (!(ps.overflowX === "auto" || ps.overflowX === "scroll") || p.scrollWidth > p.clientWidth + 1)
            problems.push(`밖으로 나감 · ${describe(el)} ⊄ ${describe(p)}`);
        }
        break;
      }
      p = p.parentElement;
    }
    if (!modal && (r.left < -1 || r.right > innerWidth + 1) && s.position !== "fixed")
      problems.push(`화면 밖 · ${describe(el)} [${Math.round(r.left)}, ${Math.round(r.right)}] / ${innerWidth}`);
  }

  // 4) 글자 덩어리 겹침: 직접 글자를 가진 요소끼리
  const leaves = all.filter(
    el =>
      [...el.childNodes].some(n => n.nodeType === 3 && n.nodeValue.trim()) &&
      !el.closest(".select-list") &&
      getComputedStyle(el).position !== "absolute"
  );
  const boxes = leaves.map(el => {
    // 글자가 실제로 차지하는 영역(요소 상자가 아니라)
    const range = document.createRange();
    range.selectNodeContents(el);
    const rects = [...range.getClientRects()]
      .map(q => clipped(el, q))
      .filter(q => q.right - q.left > 0 && q.bottom - q.top > 0);
    return { el, rects };
  });
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const hit = a.rects.some(p =>
        b.rects.some(
          q =>
            Math.min(p.right, q.right) - Math.max(p.left, q.left) > 2 &&
            Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top) > 2
        )
      );
      if (hit) problems.push(`겹침 · ${describe(a.el)} × ${describe(b.el)}`);
    }
  }
  return [...new Set(problems)];
};
