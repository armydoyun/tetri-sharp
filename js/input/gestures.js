// 터치 제스처 조작: 보드를 직접 밀고 두드린다(버튼 대신).
//  - 좌우로 밀기: 손가락이 한 칸 폭만큼 갈 때마다 한 칸 이동
//  한 번 댄 손가락은 처음 움직인 방향으로 잠근다: 아래·위로 쓸기 시작하면 떼기 전까지 가로 흔들림을 무시하고,
//  가로로 확실히(세로의 2배 넘게) 밀 때만 칸 이동을 한다. 엄지로 내려 쓸 때 호를 그리며 옆으로 흘러도
//  하드 드롭이 옆 칸으로 새지 않는다.
//  다만 세로로 내린 뒤 손가락이 더 내려가지 않으면서 가로로 한 칸 반 넘게 움직이면 그 자리에서 한 칸 움직이고
//  가로를 다시 허락한다 → 소프트 드롭으로 내리다가 처마 아래로 한 칸 밀어 넣기를 한 손가락으로 할 수 있다.
//  - 아래로 밀고 있기: 소프트 드롭(손가락을 떼면 멈춤)
//  - 아래로 빠르게 튕기기: 하드 드롭
//  - 위로 밀기: 홀드
//  - 두드리기: 오른쪽 절반은 시계 방향, 왼쪽 절반은 반시계 방향 회전
//  - 두 손가락으로 함께 두드리기: 180도 회전
// 키보드·터치 버튼과 같은 { held, takePressed() } 모양이라 게임 루프가 그대로 합친다.
import { BTN } from "../core/engine.js";
import { createPressQueue } from "./press-queue.js";

const TAP_MOVE = 12; // px: 이보다 덜 움직이고 떼면 두드리기
const TAP_MS = 260;
const movedPastTap = (start, event) => Math.hypot(event.clientX - start.x0, event.clientY - start.y0) > TAP_MOVE;
const FLICK_SPEED = 0.9; // px/ms: 아래로 이보다 빠르면 하드 드롭
const AXIS_RATIO = 2; // 가로 이동량이 세로의 이 배수를 넘어야 가로로 잠근다
const TUCK_UNLOCK = 1.5; // 칸: 세로로 잠근 뒤 이만큼 옆으로 밀면 밀어 넣기(한 칸 이동)

/**
 * @param {{ root: HTMLElement, cellSize: () => number }} options  cellSize: 화면에서 보드 한 칸의 폭(px)
 */
export const createGestures = ({ root, cellSize }) => {
  let enabled = false;
  let held = 0;
  const pending = createPressQueue();
  /** @type {null | { id: number, pointerType: string, x0: number, y0: number, ax: number, t0: number, moved: boolean, soft: boolean, axis: null | "x" | "y", anchor: {x: number, y: number}, trail: {y: number, t: number}[] }} */
  let touch = null;
  /** @type {null | { contacts: Map<number, { x0: number, y0: number }>, t0: number, valid: boolean }} */
  let twoFingerTap = null;

  const press = pending.press;

  const capture = e => {
    e.preventDefault();
    try {
      root.setPointerCapture(e.pointerId);
    } catch {
      /* 무시 */
    }
  };

  const down = e => {
    if (!enabled || e.pointerType === "mouse") return;
    if (twoFingerTap) {
      capture(e);
      twoFingerTap.contacts.set(e.pointerId, { x0: e.clientX, y0: e.clientY });
      twoFingerTap.valid = false;
      return;
    }
    if (touch) {
      if (touch.pointerType !== "touch" || e.pointerType !== "touch" || touch.moved || e.timeStamp - touch.t0 >= TAP_MS)
        return;
      capture(e);
      twoFingerTap = {
        contacts: new Map([
          [touch.id, { x0: touch.x0, y0: touch.y0 }],
          [e.pointerId, { x0: e.clientX, y0: e.clientY }],
        ]),
        t0: touch.t0,
        valid: true,
      };
      touch = null;
      return;
    }
    capture(e);
    touch = {
      id: e.pointerId,
      pointerType: e.pointerType,
      x0: e.clientX,
      y0: e.clientY,
      ax: e.clientX,
      t0: e.timeStamp,
      moved: false,
      soft: false,
      axis: null,
      // 세로로 잠근 뒤 마지막으로 아래로 나아간 자리(옆으로 밀기를 다시 허락할지 재는 기준)
      anchor: { x: e.clientX, y: e.clientY },
      trail: [],
    };
  };

  const move = e => {
    if (twoFingerTap) {
      const start = twoFingerTap.contacts.get(e.pointerId);
      if (!start) return;
      e.preventDefault();
      if (movedPastTap(start, e)) twoFingerTap.valid = false;
      return;
    }
    if (!touch || e.pointerId !== touch.id) return;
    e.preventDefault();
    const cell = Math.max(8, cellSize());
    const tdx = e.clientX - touch.x0;
    const dy = e.clientY - touch.y0;
    if (movedPastTap(touch, e)) touch.moved = true;
    // 방향 잠그기: 두드리기보다 더 움직였을 때 정한다. 가로가 세로의 2배를 넘으면 가로, 세로가 더 크면 세로.
    // 그 사이(대각선)면 한 칸 반을 넘게 움직일 때까지 미루고, 그래도 애매하면 더 많이 간 쪽으로.
    if (!touch.axis && touch.moved) {
      if (Math.abs(tdx) > Math.abs(dy) * AXIS_RATIO) touch.axis = "x";
      else if (Math.abs(dy) >= Math.abs(tdx)) touch.axis = "y";
      else if (Math.hypot(tdx, dy) > cell * 1.5) touch.axis = Math.abs(tdx) > Math.abs(dy) ? "x" : "y";
    }
    // 세로로 잠근 뒤: 아래로 반 칸 넘게 나아가면 기준점을 따라 내린다(내려 쓰는 동안의 옆 흔들림은 쌓이지 않는다).
    // 기준점에서 더 내려가지 않고 가로로 한 칸 반 넘게 가면 밀어 넣기 → 그 자리에서 한 칸 움직이고 가로로 바꾼다.
    // (기준점부터 칸을 세면 한 칸 밀어 넣으려다 두 칸 가 버린다 — 휴대폰 점검에서 찾음)
    // 그 뒤로는 지금 자리부터 한 칸 폭마다 한 칸씩.
    if (touch.axis === "y") {
      const sx = e.clientX - touch.anchor.x;
      if (e.clientY - touch.anchor.y > cell / 2) touch.anchor = { x: e.clientX, y: e.clientY };
      else if (Math.abs(sx) > cell * TUCK_UNLOCK && Math.abs(e.clientY - touch.anchor.y) < cell) {
        touch.axis = "x";
        press(sx < 0 ? BTN.LEFT : BTN.RIGHT);
        touch.ax = e.clientX;
      }
    }
    // 가로: 가로로 잠갔을 때만, 댄 자리(또는 밀어 넣기를 시작한 자리)부터 한 칸씩
    if (touch.axis === "x") {
      while (Math.abs(e.clientX - touch.ax) >= cell) {
        const dir = Math.sign(e.clientX - touch.ax);
        press(dir < 0 ? BTN.LEFT : BTN.RIGHT);
        touch.ax += dir * cell;
      }
    }
    // 세로: 세로로 잠갔고 아래로 한 칸 반 넘게 내려가 있으면 소프트 드롭
    const soft = touch.axis === "y" && dy > cell * 1.5;
    if (soft !== touch.soft) {
      touch.soft = soft;
      held = soft ? held | BTN.SOFT : held & ~BTN.SOFT;
    }
    touch.trail.push({ y: e.clientY, t: e.timeStamp });
    while (touch.trail.length > 2 && e.timeStamp - touch.trail[0].t > 90) touch.trail.shift();
  };

  const up = e => {
    if (twoFingerTap) {
      const start = twoFingerTap.contacts.get(e.pointerId);
      if (!start) return;
      if (e.type !== "pointerup" || movedPastTap(start, e)) twoFingerTap.valid = false;
      twoFingerTap.contacts.delete(e.pointerId);
      // 두 손가락이 모두 떨어질 때 한 번만 입력한다. 취소된 탭도 남은 손가락을 일반 제스처로 넘기지 않는다.
      if (twoFingerTap.contacts.size === 0) {
        if (twoFingerTap.valid && e.timeStamp - twoFingerTap.t0 < TAP_MS) press(BTN.R180);
        twoFingerTap = null;
      }
      return;
    }
    if (!touch || e.pointerId !== touch.id) return;
    const t = touch;
    touch = null;
    held &= ~BTN.SOFT;
    if (e.type !== "pointerup") return;
    const cell = Math.max(8, cellSize());
    const dy = e.clientY - t.y0;
    const dx = e.clientX - t.x0;
    const first = t.trail[0];
    const speed = first ? (e.clientY - first.y) / Math.max(1, e.timeStamp - first.t) : 0;
    if (!t.moved && !movedPastTap(t, e) && e.timeStamp - t.t0 < TAP_MS) {
      const r = root.getBoundingClientRect();
      press(e.clientX >= r.left + r.width / 2 ? BTN.CW : BTN.CCW);
    } else if (t.axis !== "x" && dy > cell * 2 && speed > FLICK_SPEED && Math.abs(dx) < dy) {
      press(BTN.HARD);
    } else if (t.axis !== "x" && -dy > cell * 2 && Math.abs(dx) < -dy) {
      press(BTN.HOLD);
    }
  };

  root.addEventListener("pointerdown", down);
  root.addEventListener("pointermove", move);
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) root.addEventListener(type, up);

  const releaseAll = () => {
    touch = null;
    twoFingerTap = null;
    held = 0;
    pending.clear();
  };

  return {
    get held() {
      return held;
    },
    /** 게임 중이고 제스처 방식일 때만 켠다 */
    setEnabled(value) {
      if (enabled !== value) releaseAll();
      enabled = value;
      root.classList.toggle("gestures-on", value);
    },
    takePressed: pending.take,
    releaseAll,
  };
};
