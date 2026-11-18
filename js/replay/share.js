// 리플레이 공유 코드: JSON → deflate 압축 → base64url, 앞에 "TD1-". 링크는 주소 뒤에 #daily=코드.
// 압축은 브라우저 내장 CompressionStream을 쓴다(라이브러리 없음).
const PREFIX = "TD1-";
const MAX_CODE = 200_000;

const toBase64Url = bytes => {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const fromBase64Url = text => {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
};

const pipe = async (bytes, stream) =>
  new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());

/** 리플레이(+ 보낸 사람 이름) → 코드 */
export const encodeReplayCode = async (replay, name = "") => {
  const json = JSON.stringify(name ? { ...replay, name } : replay);
  const packed = await pipe(new TextEncoder().encode(json), new CompressionStream("deflate-raw"));
  return PREFIX + toBase64Url(packed);
};

/** 코드나 링크(…#daily=코드) → 리플레이 원본 객체. 읽을 수 없으면 null(검증은 sanitizeReplay가 한다) */
export const decodeReplayCode = async text => {
  try {
    const raw = String(text ?? "").trim();
    const fromLink = /[#&]daily=([^&\s]+)/.exec(raw);
    const code = fromLink ? decodeURIComponent(fromLink[1]) : raw;
    if (!code.startsWith(PREFIX) || code.length > MAX_CODE) return null;
    const bytes = await pipe(fromBase64Url(code.slice(PREFIX.length)), new DecompressionStream("deflate-raw"));
    if (bytes.length > 5_000_000) return null;
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
};

/** 공유 링크: 지금 주소(해시 제외) + #daily=코드 */
export const replayLink = (code, href) => `${String(href).split("#")[0]}#daily=${code}`;
