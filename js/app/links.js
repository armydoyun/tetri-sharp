// 공유 링크의 해시(#daily=… · #replay=… · #rules=… · #puzzle=… · #pack=… · #time-shift=…)를 한 번만 꺼내 쓴다.
// 꺼낸 뒤에는 주소에서 해시를 지워서, 새로 고침해도 같은 링크를 다시 들이지 않는다.

/**
 * @param {"daily" | "replay" | "rules" | "puzzle" | "pack" | "time-shift"} key
 * @returns {string | null} 해시 전체(#로 시작), 그 열쇠가 없으면 null
 */
export const takeLinkHash = key => {
  if (!new RegExp(`[#&]${key}=`).test(location.hash)) return null;
  const hash = location.hash;
  try {
    history.replaceState(null, "", location.pathname + location.search);
  } catch {
    /* file:// 등에서 막혀도 괜찮다 */
  }
  return hash;
};
