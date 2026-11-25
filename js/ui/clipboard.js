// 클립보드 복사(공유 링크·코드). 막혀 있으면(권한·http·오래된 브라우저) false — 부르는 쪽이 직접 복사할 칸을 보여 준다.

/**
 * @param {string} text
 * @param {HTMLInputElement | null} [fallback]  막혔을 때 이 칸을 골라 두고 옛 방식(execCommand)으로 한 번 더 해 본다
 * @returns {Promise<boolean>} 복사했으면 true
 */
export const copyText = async (text, fallback = null) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    if (!fallback) return false;
    fallback.select();
    try {
      return document.execCommand("copy");
    } catch {
      return false;
    }
  }
};

/**
 * 자동 복사가 막혔을 때: 숨겨 둔 칸에 글을 넣어 보이고 골라 둔다(사용자가 바로 복사하게)
 * @param {HTMLInputElement} input @param {string} text
 */
export const revealForCopy = (input, text) => {
  input.value = text;
  input.hidden = false;
  input.focus();
  input.select();
};
