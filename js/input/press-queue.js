// 눌린 버튼 대기열: 엔진은 프레임마다 { held, pressed }를 받는다. pressed는 다음 프레임에 읽어 갈 때까지 모아 둔다
// (프레임 사이에 눌렀다 뗀 짧은 입력도 놓치지 않게). 같은 버튼이 한 프레임 안에 두 번 눌리면 두 번째는 다음 프레임으로
// 넘긴다(빠른 연타가 하나로 합쳐지지 않게). 키보드·터치 버튼·제스처가 함께 쓴다.

export const createPressQueue = () => {
  /** 프레임별로 넘겨줄 pressed 비트마스크. 맨 앞이 다음 프레임 몫 */
  let pending = [0];
  return {
    /** @param {number} bit */
    press(bit) {
      const last = pending.length - 1;
      if (pending[last] & bit) pending.push(bit);
      else pending[last] |= bit;
    },
    /** 다음 프레임 몫을 꺼내고 비운다 */
    take() {
      const p = pending.shift() || 0;
      if (!pending.length) pending.push(0);
      return p;
    },
    clear() {
      pending = [0];
    },
  };
};
