// base64url(주소에 그대로 넣을 수 있는 base64: + → -, / → _, 끝의 = 없음). 링크 코드(규칙·리플레이·퍼즐)가 함께 쓴다.
// DOM 없이 돈다(btoa·atob는 브라우저·Worker·Node에 다 있다).

/** @param {Uint8Array} bytes */
export const toBase64Url = bytes => {
  let bin = "";
  // 한 번에 너무 많은 인자를 넘기지 않게 나눠 바꾼다(리플레이는 수십 KB)
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

/** 읽을 수 없는 글자가 있으면 atob가 던진다(부르는 쪽이 잡는다) @param {string} text */
export const fromBase64Url = text => {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4)), c => c.charCodeAt(0));
};
