// 리플레이 공유 코드: JSON → deflate 압축 → base64url, 앞에 "TD1-". 링크는 주소 뒤에 #daily=코드.
// 압축은 브라우저 내장 CompressionStream을 쓴다(라이브러리 없음).
import { fromBase64Url, toBase64Url } from "../core/base64url.js";

const PREFIX = "TD1-";
const MAX_CODE = 200_000;

const pipe = async (bytes, stream) =>
  new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());

/** 리플레이(+ 보낸 사람 이름) → 코드 */
export const encodeReplayCode = async (replay, name = "") => {
  const json = JSON.stringify(name ? { ...replay, name } : replay);
  const packed = await pipe(new TextEncoder().encode(json), new CompressionStream("deflate-raw"));
  return PREFIX + toBase64Url(packed);
};

/** 코드나 링크(…#daily=코드 또는 #replay=코드) → 리플레이 원본 객체. 읽을 수 없으면 null(검증은 sanitizeReplay가 한다) */
export const decodeReplayCode = async text => {
  try {
    const raw = String(text ?? "").trim();
    const fromLink = /[#&](?:daily|replay)=([^&\s]+)/.exec(raw);
    const code = fromLink ? decodeURIComponent(fromLink[1]) : raw;
    if (!code.startsWith(PREFIX) || code.length > MAX_CODE) return null;
    const bytes = await pipe(fromBase64Url(code.slice(PREFIX.length)), new DecompressionStream("deflate-raw"));
    if (bytes.length > 5_000_000) return null;
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
};

/** 공유 링크: 지금 주소(해시 제외) + #daily=코드(오늘의 도전) 또는 #replay=코드(그 밖의 리플레이) */
export const replayLink = (code, href, key = "daily") => `${String(href).split("#")[0]}#${key}=${code}`;
