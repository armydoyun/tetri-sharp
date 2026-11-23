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
    // 화면 읽기 프로그램 전용(보이지 않게 잘라 둔 것)은 검사하지 않는다
    if (el.closest(".sr-only")) return false;
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
  // 열린 모달 대화상자가 있으면 그것만 본다(뒤 화면은 가려져 있다).
  // 좁거나 낮은 화면에서 화면 전체를 덮는 보드 패널(일시정지·확인·결과)도 같다.
  const coveringPanel = [...document.querySelectorAll(".board-wrap > .panel:not([hidden])")].find(
    p => getComputedStyle(p).position === "fixed"
  );
  const modal = [...document.querySelectorAll("dialog[open]")].pop();
  const root = modal ?? coveringPanel ?? document.body;
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
  // 5) 컴포넌트 약속(docs/DESIGN_SYSTEM.md "컴포넌트"): 버튼은 [아이콘][이름][단축키]만 담고,
  //    내용 덩어리가 아래 턱을 뺀 버튼 면의 한가운데(가로·세로 1px 안)에 놓인다.
  //    세그먼트 칸은 고르지 않았어도 턱 자리를 비워 두므로(골라도 글자가 안 움직이게) 늘 턱을 뺀 면으로 잰다.
  for (const b of all.filter(el => el.matches(".btn:not(.btn-split), .segmented > button, .choice > button"))) {
    if (b.matches(".btn")) {
      // 버튼 구조: [아이콘 svg.icon | .btn-icon] [이름 .btn-label] [부가 정보 .btn-meta] [단축키 kbd]
      const stray = [...b.childNodes].filter(
        n =>
          (n.nodeType === 3 && n.nodeValue.trim()) ||
          (n.nodeType === 1 && !(/** @type {Element} */ (n).matches("svg.icon, .btn-icon, .btn-label, .btn-meta, kbd")))
      );
      if (stray.length) problems.push(`버튼 구조 · ${describe(b)} (아이콘·.btn-label·.btn-meta·kbd 밖의 내용)`);
      if (b.querySelectorAll(":scope > .btn-label").length > 1) problems.push(`버튼 구조 · ${describe(b)} (이름 둘)`);
    }
    const parts = [...b.children].filter(visible).map(c => c.getBoundingClientRect());
    if (!parts.length) {
      if (!b.childNodes.length) continue;
      const range = document.createRange();
      range.selectNodeContents(b);
      parts.push(range.getBoundingClientRect());
    }
    const s = getComputedStyle(b);
    const r = b.getBoundingClientRect();
    const ledge = b.matches(".btn")
      ? /inset/.test(s.boxShadow)
        ? Math.abs(parseFloat(s.boxShadow.split(" ").filter(v => v.endsWith("px"))[1]) || 0)
        : 0
      : parseFloat(s.getPropertyValue("--ledge")) || 0;
    const face = {
      x: (r.left + parseFloat(s.borderLeftWidth) + r.right - parseFloat(s.borderRightWidth)) / 2,
      y: (r.top + parseFloat(s.borderTopWidth) + r.bottom - parseFloat(s.borderBottomWidth) - ledge) / 2,
    };
    const box = {
      x: (Math.min(...parts.map(q => q.left)) + Math.max(...parts.map(q => q.right))) / 2,
      y: (Math.min(...parts.map(q => q.top)) + Math.max(...parts.map(q => q.bottom))) / 2,
    };
    const dx = box.x - face.x;
    const dy = box.y - face.y;
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1)
      problems.push(`버튼 정렬 · ${describe(b)} 면 중심에서 (${dx.toFixed(1)}, ${dy.toFixed(1)})px`);
  }
  // 6) 나머지 컨트롤(docs/DESIGN_SYSTEM.md "컴포넌트"): 정해진 구조, 내용은 (턱을 뺀) 면의 세로 가운데 1px 안
  const ANATOMY = {
    ".select": "svg.icon, .select-value",
    ".tool-row": "svg.icon, .tool-label, small.tool-meta, small.tool-note",
    ".menu-row": "svg.icon, .menu-index, .menu-text, .mode-best",
  };
  for (const [sel, allowed] of Object.entries(ANATOMY))
    for (const c of all.filter(el => el.matches(sel))) {
      const stray = [...c.childNodes].filter(
        n =>
          (n.nodeType === 3 && n.nodeValue.trim()) ||
          (n.nodeType === 1 && !(/** @type {Element} */ (n).matches(allowed)))
      );
      if (stray.length) problems.push(`컨트롤 구조 · ${describe(c)} (${allowed} 밖의 내용)`);
    }
  for (const c of all.filter(el => el.matches(".select, .tool-row, .menu-row, .key-slot"))) {
    const s = getComputedStyle(c);
    const r = c.getBoundingClientRect();
    const ledge = /inset/.test(s.boxShadow)
      ? Math.abs(parseFloat(s.boxShadow.split(" ").filter(v => v.endsWith("px"))[1]) || 0)
      : 0;
    const faceY = (r.top + parseFloat(s.borderTopWidth) + r.bottom - parseFloat(s.borderBottomWidth) - ledge) / 2;
    // 줄(목록·도구)은 오른쪽 화살표가, 나머지는 내용 전체가 가운데
    const parts = (
      c.matches(".menu-row, .tool-row") ? [...c.children].filter(k => k.matches("svg.icon")) : [...c.children]
    )
      .filter(visible)
      .map(k => k.getBoundingClientRect());
    if (!parts.length) continue;
    const dy = (Math.min(...parts.map(q => q.top)) + Math.max(...parts.map(q => q.bottom))) / 2 - faceY;
    if (Math.abs(dy) > 1) problems.push(`컨트롤 정렬 · ${describe(c)} 면 중심에서 세로 ${dy.toFixed(1)}px`);
  }
  // 목록 줄의 글자 덩어리(이름·설명·정보)도 세로 가운데: 빈 둘째 줄이 남으면 위로 쏠린다(2차 평가 U34)
  for (const c of all.filter(el => el.matches(".menu-row:not(:has(> .menu-index))"))) {
    const parts = [...c.children].filter(k => k.matches(".menu-text, .mode-best") && visible(k));
    if (!parts.length) continue;
    const s = getComputedStyle(c);
    const r = c.getBoundingClientRect();
    const mid = (r.top + parseFloat(s.borderTopWidth) + r.bottom - parseFloat(s.borderBottomWidth)) / 2;
    const rects = parts.map(k => k.getBoundingClientRect());
    const dy = (Math.min(...rects.map(q => q.top)) + Math.max(...rects.map(q => q.bottom))) / 2 - mid;
    if (Math.abs(dy) > 2) problems.push(`컨트롤 정렬 · ${describe(c)} 글자가 세로 가운데에서 ${dy.toFixed(1)}px`);
  }
  // 빈 자리: visibility로 숨겨 두고 높이만 차지하는 블록(24px 넘게)은 화면에 구멍으로 보인다(2차 평가 U33).
  // 자리를 지켜야 하면 그 자리에 안내 등 보이는 내용을 둔다. 겹쳐 뜨는 것(position 있는 것)과 보드 위 표시는 뺀다.
  for (const el of root.querySelectorAll("body *")) {
    if (!(el instanceof HTMLElement)) continue;
    const s = getComputedStyle(el);
    if (s.visibility !== "hidden" || s.display === "none" || s.position === "absolute" || s.position === "fixed")
      continue;
    if (el.parentElement && getComputedStyle(el.parentElement).visibility === "hidden") continue;
    // aria-hidden 크기 잡이(보이는 글자와 같은 칸에 겹쳐 폭만 잡는 것, 예: #replay-time-width)도 뺀다
    if (el.closest('dialog:not([open]), [hidden], [aria-hidden="true"], .board-wrap, .stage-side, .hud, .touchpad'))
      continue;
    const r = el.getBoundingClientRect();
    if (r.height > 24 && r.width > 48 && r.bottom > 0 && r.top < innerHeight)
      problems.push(
        `빈 자리 · ${describe(el)} ${Math.round(r.width)}×${Math.round(r.height)} (보이지 않는데 자리만 차지)`
      );
  }
  // 글자 입력은 위아래 여백이 같고, 스위치는 어디서나 같은 크기
  for (const c of all.filter(el => el.matches(".text-input"))) {
    const s = getComputedStyle(c);
    if (Math.abs(parseFloat(s.paddingTop) - parseFloat(s.paddingBottom)) > 0.5)
      problems.push(`컨트롤 정렬 · ${describe(c)} 위아래 여백 ${s.paddingTop}/${s.paddingBottom}`);
  }
  for (const c of all.filter(el => el.matches(".switch"))) {
    const r = c.getBoundingClientRect();
    if (Math.round(r.width) !== 48 || Math.round(r.height) !== 26)
      problems.push(`컨트롤 크기 · ${describe(c)} ${Math.round(r.width)}×${Math.round(r.height)} (48×26)`);
  }
  return [...new Set(problems)];
};
