// 터치 버튼: 화면의 고정된 버튼을 누르면 키보드와 같은 버튼 비트가 된다.
// 손가락마다 따로 추적(여러 버튼 동시 누르기 가능), 누른 순간을 다음 프레임까지 모아 둔다(키보드와 같은 방식).
// 버튼은 data-touch="LEFT" 같은 동작 id를 가진다. RESTART·PAUSE는 시스템 동작.
import { ACTIONS } from "./keymap.js";
import { createPressQueue } from "./press-queue.js";

/** 설정값과 기기(굵은 포인터=터치 화면)로 터치 버튼을 보일지 정한다. */
export const touchVisible = (setting, coarsePointer) => setting === "on" || (setting === "auto" && coarsePointer);

const BIT = Object.fromEntries(ACTIONS.filter(a => a.bit).map(a => [a.id, a.bit]));
const SYSTEM = Object.fromEntries(ACTIONS.filter(a => a.system).map(a => [a.id, a.system]));

/**
 * @param {{ root: HTMLElement, onSystem: (action: string) => void, vibrate?: () => boolean }} options
 */
export const createTouch = ({ root, onSystem, vibrate = () => true }) => {
  /** @type {Map<number, { id: string, button: HTMLElement }>} */
  const fingers = new Map();
  let held = 0;
  const pending = createPressQueue();
  let enabled = false;

  const recompute = () => {
    held = 0;
    for (const { id } of fingers.values()) held |= BIT[id] || 0;
  };

  const release = e => {
    const finger = fingers.get(e.pointerId);
    if (!finger) return;
    fingers.delete(e.pointerId);
    if (![...fingers.values()].some(other => other.button === finger.button)) finger.button.classList.remove("is-down");
    recompute();
  };

  root.addEventListener("pointerdown", e => {
    const button = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (e.target).closest("[data-touch]"));
    if (!button || button.matches(":disabled") || e.button !== 0 || fingers.has(e.pointerId)) return;
    const id = button.dataset.touch ?? "";
    if (!SYSTEM[id] && (!enabled || !BIT[id])) return;
    e.preventDefault();
    const alreadyHeld = Boolean(held & BIT[id]);
    fingers.set(e.pointerId, { id, button });
    recompute();
    try {
      button.setPointerCapture(e.pointerId);
    } catch {
      /* 일부 환경에서는 캡처가 안 돼도 괜찮다 */
    }
    button.classList.add("is-down");
    // 짧은 진동으로 눌렀다는 느낌을 준다(지원하는 기기만)
    try {
      if (vibrate()) navigator.vibrate?.(8);
    } catch {
      /* 무시 */
    }
    if (SYSTEM[id]) return onSystem(SYSTEM[id]);
    if (alreadyHeld) return;
    pending.press(BIT[id]);
  });
  root.addEventListener("lostpointercapture", release);
  // 캡처를 지원하지 않는 환경에서도 버튼 밖으로 손을 떼면 해제한다.
  for (const type of ["pointerup", "pointercancel"]) window.addEventListener(type, release, true);
  // 길게 누를 때 뜨는 메뉴·확대를 막는다
  root.addEventListener("contextmenu", e => e.preventDefault());

  const releaseAll = () => {
    fingers.clear();
    held = 0;
    pending.clear();
    for (const el of root.querySelectorAll(".is-down")) el.classList.remove("is-down");
  };

  return {
    get held() {
      return held;
    },
    setEnabled(value) {
      if (enabled !== value) releaseAll();
      enabled = value;
    },
    takePressed: pending.take,
    releaseAll,
  };
};
