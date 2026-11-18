// 키 입력 표시: 정보 칸 아래 작은 칸들에 지금 누르고 있는 동작을 밝힌다(설정에서 켠다).

/**
 * @param {{ root: HTMLElement, isOn: () => boolean }} options
 */
export const createInputDisplay = ({ root, isOn }) => {
  const cells = [...root.querySelectorAll("[data-bit]")].map(el => ({
    el,
    bit: Number(el.getAttribute("data-bit")),
  }));
  /** 누른 순간은 짧게 남겨 둔다(한 프레임만 눌린 탭도 보이게) @type {{ bits: number, until: number }[]} */
  let flash = [];
  let held = 0;
  return {
    /** 로직 프레임마다: 누르고 있는 비트와 이번에 새로 누른 비트 */
    show(nowHeld, pressed) {
      held = nowHeld;
      if (pressed) flash.push({ bits: pressed, until: performance.now() + 110 });
    },
    /** 화면 프레임마다 */
    paint() {
      if (!isOn()) return;
      const now = performance.now();
      flash = flash.filter(f => f.until > now);
      const lit = flash.reduce((b, f) => b | f.bits, held);
      for (const c of cells) c.el.classList.toggle("is-on", Boolean(lit & c.bit));
    },
  };
};
