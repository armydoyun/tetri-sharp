// Custom 규칙 공유: 규칙 내용 → 짧은 코드 ("TS1-" + base64url(JSON)) → 다시 규칙.
// 불러올 때는 항상 sanitizeRuleBody를 거치므로 손으로 고친 코드도 허용된 값으로만 들어온다.
// 링크는 주소 뒤에 "#rules=코드"를 붙인 것 — 열면 그 규칙이 Custom으로 들어온다.
import { sanitizeRuleBody } from "./sanitize.js";

const PREFIX = "TS1-";
const MAX_CODE = 4000;

const toBase64Url = text => btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromBase64Url = code => {
  const b64 = code.replace(/-/g, "+").replace(/_/g, "/");
  return atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
};

/** @returns {string} 공유 코드 */
export const encodeRules = body => PREFIX + toBase64Url(JSON.stringify(sanitizeRuleBody(body)));

/**
 * 코드(또는 "#rules=코드"가 든 주소)를 규칙 내용으로. 읽을 수 없으면 null.
 * @param {string} input
 */
export const decodeRules = input => {
  if (typeof input !== "string") return null;
  let code = input.trim();
  const inLink = /[#&]rules=([\w-]+)/.exec(code);
  if (inLink) code = `${PREFIX}${inLink[1].replace(/^TS1-/, "")}`;
  if (!code.startsWith(PREFIX) || code.length > MAX_CODE) return null;
  const payload = code.slice(PREFIX.length);
  if (!/^[A-Za-z0-9_-]+$/.test(payload)) return null;
  try {
    const raw = JSON.parse(fromBase64Url(payload));
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    return sanitizeRuleBody(raw);
  } catch {
    return null;
  }
};

/** 공유 링크: 지금 주소(해시 제외) + "#rules=코드의 본문" */
export const rulesLink = (body, href) => `${href.split("#")[0]}#rules=${encodeRules(body).slice(PREFIX.length)}`;
