// 키보드 → 버튼 비트마스크. 엔진은 프레임마다 { held, pressed }를 받는다.
// pressed는 다음 프레임에 읽어 갈 때까지 모아 둔다(프레임 사이에 눌렀다 뗀 짧은 입력도 놓치지 않게).
// 같은 키가 한 프레임 안에 두 번 눌리면 두 번째는 다음 프레임으로 넘긴다(빠른 연타가 하나로 합쳐지지 않게).
// OS 키 반복(e.repeat)은 무시한다 — DAS/ARR은 엔진이 직접 센다.

/**
 * @param {{ keymap: Record<string, number>, systemKeys: Record<string, string>, onSystem: (action: string) => void }} options
 */
export const createKeyboard = ({ keymap, systemKeys, onSystem }) => {
  let held = 0;
  /** 프레임별로 넘겨줄 pressed 비트마스크 대기열. 맨 앞이 다음 프레임 몫. */
  let pending = [0];
  /** 같은 버튼에 키가 여러 개일 때(ArrowUp·X) 하나를 떼도 다른 키가 눌려 있으면 유지한다. */
  const down = new Set();

  const recompute = () => {
    held = 0;
    for (const code of down) held |= keymap[code] || 0;
  };

  const onKeyDown = e => {
    const bit = keymap[e.code];
    if (bit) {
      e.preventDefault();
      if (e.repeat) return;
      down.add(e.code);
      recompute();
      const last = pending.length - 1;
      if (pending[last] & bit) pending.push(bit);
      else pending[last] |= bit;
      return;
    }
    const action = systemKeys[e.code];
    if (action && !e.repeat) {
      e.preventDefault();
      onSystem(action);
    }
  };

  const onKeyUp = e => {
    if (!keymap[e.code]) return;
    e.preventDefault();
    down.delete(e.code);
    recompute();
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  return {
    get held() {
      return held;
    },
    /** 모아 둔 pressed를 꺼내고 비운다. */
    takePressed() {
      const p = pending.shift() || 0;
      if (!pending.length) pending.push(0);
      return p;
    },
    /** 창이 포커스를 잃으면 keyup이 오지 않으므로 전부 뗀 것으로 친다. */
    releaseAll() {
      down.clear();
      held = 0;
      pending = [0];
    },
  };
};
