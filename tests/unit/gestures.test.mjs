// 터치 제스처(js/input/gestures.js): 가짜 보드 요소에 포인터 이벤트를 흘려 넣어 어떤 버튼이 눌리는지 본다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { BTN } from "../../js/core/engine.js";
import { createGestures } from "../../js/input/gestures.js";

const CELL = 18; // iPhone 13 세로에서 보드 한 칸 폭쯤

const setup = () => {
  const listeners = {};
  const root = {
    addEventListener: (type, fn) => (listeners[type] = fn),
    setPointerCapture: () => {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 180, height: 360 }),
    classList: { toggle: () => {} },
  };
  const g = createGestures({ root: /** @type {any} */ (root), cellSize: () => CELL });
  g.setEnabled(true);
  const fire = (type, x, y, t) =>
    listeners[type]({
      type,
      pointerId: 1,
      pointerType: "touch",
      clientX: x,
      clientY: y,
      timeStamp: t,
      preventDefault() {},
    });
  /** 이번 제스처로 눌린 버튼을 모두 모은다(소프트 드롭처럼 누르고 있는 것도) */
  const swipe = points => {
    let pressed = 0;
    let held = 0;
    const [[x0, y0, t0], ...rest] = points;
    fire("pointerdown", x0, y0, t0);
    for (const [x, y, t] of rest.slice(0, -1)) {
      fire("pointermove", x, y, t);
      held |= g.held;
      for (let p = g.takePressed(); p; p = g.takePressed()) pressed |= p;
    }
    const [x, y, t] = rest.at(-1);
    fire("pointermove", x, y, t);
    fire("pointerup", x, y, t + 1);
    for (let p = g.takePressed(); p; p = g.takePressed()) pressed |= p;
    return { pressed, held };
  };
  return { swipe };
};

test("엄지로 내려 쓸며 옆으로 30px 흘러도 하드 드롭만 한다(좌우 이동 없음)", () => {
  const { swipe } = setup();
  // 100px를 80ms에 내려가며 손가락이 오른쪽으로 30px 호를 그린다
  const { pressed } = swipe([
    [100, 100, 0],
    [104, 125, 20],
    [112, 150, 40],
    [121, 175, 60],
    [130, 200, 80],
  ]);
  assert.equal(pressed & (BTN.LEFT | BTN.RIGHT), 0, "옆으로 움직이지 않는다");
  assert.ok(pressed & BTN.HARD, "하드 드롭");
});

test("위로 쓸며 옆으로 흘러도 홀드만 한다", () => {
  const { swipe } = setup();
  const { pressed } = swipe([
    [100, 300, 0],
    [95, 270, 40],
    [88, 240, 80],
    [80, 220, 120],
  ]);
  assert.equal(pressed & (BTN.LEFT | BTN.RIGHT), 0);
  assert.ok(pressed & BTN.HOLD);
});

test("가로로 밀면 지금처럼 한 칸 폭마다 한 칸 움직이고, 세로로 조금 흔들려도 드롭·홀드는 없다", () => {
  const { swipe } = setup();
  const { pressed, held } = swipe([
    [50, 200, 0],
    [70, 204, 40],
    [90, 209, 80],
    [110, 212, 120],
  ]);
  assert.ok(pressed & BTN.RIGHT);
  assert.equal(pressed & (BTN.HARD | BTN.HOLD), 0);
  assert.equal(held & BTN.SOFT, 0);
});

test("가로 이동 칸 수: 3칸 반을 밀면 3번 누른다", () => {
  const counts = [];
  // takePressed()는 같은 버튼이 여러 번이면 차례로 꺼낸다 → 직접 센다
  const listeners = {};
  const root = {
    addEventListener: (type, fn) => (listeners[type] = fn),
    setPointerCapture: () => {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 180, height: 360 }),
    classList: { toggle: () => {} },
  };
  const g = createGestures({ root: /** @type {any} */ (root), cellSize: () => CELL });
  g.setEnabled(true);
  const ev = (type, x, t) => ({
    type,
    pointerId: 1,
    pointerType: "touch",
    clientX: x,
    clientY: 200,
    timeStamp: t,
    preventDefault() {},
  });
  listeners.pointerdown(ev("pointerdown", 20, 0));
  for (const [x, t] of [
    [40, 30],
    [60, 60],
    [83, 90],
  ])
    listeners.pointermove(ev("pointermove", x, t));
  listeners.pointerup(ev("pointerup", 83, 100));
  for (let p = g.takePressed(); p; p = g.takePressed()) counts.push(p);
  assert.equal(counts.filter(p => p & BTN.RIGHT).length, 3);
});

test("천천히 아래로 끌면 소프트 드롭을 누르고 있고, 옆으로 흘러도 칸 이동은 없다", () => {
  const { swipe } = setup();
  const { pressed, held } = swipe([
    [100, 100, 0],
    [103, 130, 200],
    [110, 160, 400],
    [118, 190, 600],
  ]);
  assert.ok(held & BTN.SOFT);
  assert.equal(pressed & (BTN.LEFT | BTN.RIGHT | BTN.HARD), 0, "느리면 하드 드롭도 아니다");
});

test("짧게 두드리면 오른쪽 절반은 시계, 왼쪽 절반은 반시계 회전", () => {
  const { swipe } = setup();
  assert.equal(
    swipe([
      [150, 100, 0],
      [152, 101, 50],
    ]).pressed,
    BTN.CW
  );
  assert.equal(
    swipe([
      [30, 100, 0],
      [31, 102, 50],
    ]).pressed,
    BTN.CCW
  );
});

test("밀어 넣기: 천천히 내려 소프트 드롭한 뒤 더 내려가지 않고 옆으로 밀면 가로로 움직이고 하드 드롭은 없다", () => {
  const { swipe } = setup();
  const { pressed, held } = swipe([
    [60, 100, 0],
    [62, 140, 200],
    [64, 180, 400],
    [64, 185, 600], // 바닥에 닿아 멈춤
    [90, 186, 700],
    [110, 186, 800],
    [130, 186, 900],
  ]);
  assert.ok(held & BTN.SOFT, "내리는 동안 소프트 드롭");
  assert.ok(pressed & BTN.RIGHT, "멈춘 뒤 옆으로 밀면 이동");
  assert.equal(pressed & BTN.HARD, 0);
});
