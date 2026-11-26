// 드롭다운(직접 만든 선택 상자). 브라우저 기본 <select> 대신 게임 화면과 같은 모양으로 그린다.
// 버튼을 누르면 목록이 뜨고, 키보드(↑↓ Home End Enter Space Esc Tab)와 마우스로 고른다.
// 목록은 대화상자 안이면 그 대화상자에, 아니면 body에 붙인다(대화상자 스크롤 영역에 잘리지 않게 fixed 위치).
import { el } from "./dom.js";
import { icon } from "./icons.js";

/** 지금 열린 목록 하나(다른 목록을 열면 닫는다) */
let current = /** @type {null | { close: (focus?: boolean) => void }} */ (null);

// 열린 목록이 있으면 Esc가 대화상자를 닫지 않고 목록만 닫는다.
if (typeof document !== "undefined") {
  document.addEventListener(
    "cancel",
    e => {
      if (!current) return;
      e.preventDefault();
      current.close(true);
    },
    true
  );
}

/**
 * @param {{
 *   id: string,
 *   label: string,
 *   options: ReadonlyArray<{ value: any, label: string, hint?: string }>,
 *   value: any,
 *   onChange: (value: any) => void,
 *   disabled?: boolean,
 * }} o
 * @returns {HTMLButtonElement & { setValue: (value: any) => void }} 열기 버튼. 고른 값은 data-value에 있다.
 */
export const dropdown = ({ id, label, options, value, onChange, disabled = false }) => {
  // 고른 항목은 열기 버튼에도 바로 반영한다(부르는 쪽이 대화상자를 다시 그리지 않아도 맞도록)
  let selectedIndex = Math.max(
    0,
    options.findIndex(o => o.value === value)
  );
  const listId = `${id}-list`;
  const trigger = /** @type {HTMLButtonElement} */ (
    el(
      "button",
      {
        type: "button",
        id,
        class: "select",
        disabled,
        "aria-haspopup": "listbox",
        "aria-expanded": "false",
        "aria-controls": listId,
        "data-value": String(options[selectedIndex]?.value ?? ""),
      },
      el("span", { class: "select-value", text: options[selectedIndex]?.label ?? "" }),
      icon("chevron-down")
    )
  );

  let list = /** @type {HTMLElement | null} */ (null);
  let active = selectedIndex;

  const optionEl = i => /** @type {HTMLElement | undefined} */ (list?.children[i]);

  const setActive = i => {
    active = Math.min(options.length - 1, Math.max(0, i));
    for (const [k, node] of [...(list?.children ?? [])].entries()) node.classList.toggle("is-active", k === active);
    const node = optionEl(active);
    if (node) {
      list?.setAttribute("aria-activedescendant", node.id);
      node.scrollIntoView({ block: "nearest" });
    }
  };

  const onOutside = e => {
    if (list && !list.contains(e.target) && !trigger.contains(e.target)) close(false);
  };
  /** 연 시각: 열기 직전의 스크롤(누른 단추를 화면에 보이게 하는 스크롤, 휴대폰의 관성 스크롤)은 조금 늦게 오므로 그건 무시한다 */
  let openedAt = 0;
  const onViewport = e => {
    if (performance.now() - openedAt < 150) return;
    if (list && e.target !== list && !list.contains(e.target)) close(false);
  };

  const close = (focus = true) => {
    if (!list) return;
    list.remove();
    list = null;
    trigger.setAttribute("aria-expanded", "false");
    document.removeEventListener("pointerdown", onOutside, true);
    window.removeEventListener("scroll", onViewport, true);
    window.removeEventListener("resize", onViewport);
    if (current?.close === close) current = null;
    if (focus && trigger.isConnected) trigger.focus();
  };

  const choose = i => {
    const next = options[i];
    close(true);
    if (!next || next.value === options[selectedIndex].value) return;
    selectedIndex = i;
    active = i;
    trigger.dataset.value = String(next.value);
    /** @type {HTMLElement} */ (trigger.querySelector(".select-value")).textContent = next.label;
    onChange(next.value);
  };

  /** 열기 버튼 아래(모자라면 위)에 목록을 둔다 */
  const place = () => {
    if (!list) return;
    const r = trigger.getBoundingClientRect();
    const gap = 4;
    list.style.minWidth = `${r.width}px`;
    list.style.left = `${Math.min(r.left, window.innerWidth - list.offsetWidth - 8)}px`;
    const below = window.innerHeight - r.bottom - gap - 8;
    const above = r.top - gap - 8;
    const h = list.scrollHeight;
    if (h <= below || below >= above) {
      list.style.top = `${r.bottom + gap}px`;
      list.style.maxHeight = `${Math.max(120, below)}px`;
    } else {
      list.style.top = `${Math.max(8, r.top - gap - Math.min(h, above))}px`;
      list.style.maxHeight = `${above}px`;
    }
  };

  const open = () => {
    if (list || trigger.disabled) return;
    current?.close(false);
    list = el("div", {
      id: listId,
      class: "select-list",
      role: "listbox",
      tabIndex: -1,
      "aria-label": label,
    });
    options.forEach((o, i) => {
      const node = el(
        "div",
        {
          id: `${id}-opt-${i}`,
          class: "select-option",
          role: "option",
          "data-value": String(o.value),
          "aria-selected": String(i === selectedIndex),
        },
        el(
          "span",
          { class: "select-option-text" },
          el("strong", { text: o.label }),
          ...(o.hint ? [el("small", { text: o.hint })] : [])
        ),
        ...(i === selectedIndex ? [icon("check")] : [])
      );
      node.addEventListener("pointermove", () => active !== i && setActive(i));
      node.addEventListener("click", () => choose(i));
      list?.append(node);
    });
    list.addEventListener("keydown", e => {
      const keys = {
        ArrowDown: () => setActive(active + 1),
        ArrowUp: () => setActive(active - 1),
        Home: () => setActive(0),
        End: () => setActive(options.length - 1),
        PageDown: () => setActive(active + 5),
        PageUp: () => setActive(active - 5),
        Enter: () => choose(active),
        " ": () => choose(active),
        Escape: () => close(true),
        Tab: () => close(true),
      };
      const run = keys[e.key];
      if (!run) return;
      if (e.key !== "Tab") e.preventDefault();
      e.stopPropagation();
      run();
    });
    (trigger.closest("dialog") ?? document.body).append(list);
    trigger.setAttribute("aria-expanded", "true");
    current = { close };
    place();
    setActive(selectedIndex);
    list.focus({ preventScroll: true });
    openedAt = performance.now();
    document.addEventListener("pointerdown", onOutside, true);
    window.addEventListener("scroll", onViewport, true);
    window.addEventListener("resize", onViewport);
  };

  trigger.addEventListener("click", () => (list ? close(true) : open()));
  trigger.addEventListener("keydown", e => {
    if (["ArrowDown", "ArrowUp"].includes(e.key)) {
      e.preventDefault();
      open();
    }
  });
  return Object.assign(trigger, {
    setValue(value) {
      const index = options.findIndex(option => option.value === value);
      if (index !== -1) choose(index);
    },
  });
};
