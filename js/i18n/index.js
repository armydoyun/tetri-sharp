// 화면 글자 번역. 원문(한국어)을 그대로 열쇠로 쓴다: t("남은 줄") → 영어면 "Lines left".
// 매개변수는 {이름}으로 적는다: t("{n}줄", { n: 3 }). 사전에 없으면 원문을 보여 준다.
//
// 언어는 모듈을 읽는 순간 한 번 정한다(모드 이름처럼 시작할 때 만들어 두는 글자도 같은 언어가 되게).
// 설정에서 언어를 바꾸면 페이지를 다시 불러온다. Node(테스트)에서는 늘 한국어.
import { EN } from "./en.js";

export const LANG_OPTIONS = Object.freeze(["auto", "ko", "en"]);

/** 저장된 설정의 언어(auto · ko · en) — 저장소 모듈을 거치지 않고 직접 읽는다(가장 먼저 읽히는 모듈이라) */
const savedLang = () => {
  try {
    const raw = globalThis.localStorage?.getItem("tetrisharp:settings");
    const lang = raw ? JSON.parse(raw)?.lang : null;
    return LANG_OPTIONS.includes(lang) ? lang : "auto";
  } catch {
    return "auto";
  }
};

/** auto → 브라우저 언어가 한국어면 ko, 아니면 en */
export const resolveLang = (choice, browserLangs) => {
  if (choice === "ko" || choice === "en") return choice;
  const list = browserLangs?.length ? browserLangs : [];
  const first = list.find(l => typeof l === "string" && l) ?? "ko";
  return first.toLowerCase().startsWith("ko") ? "ko" : "en";
};

const detect = () => {
  if (typeof document === "undefined") return "ko";
  const nav = globalThis.navigator;
  return resolveLang(savedLang(), nav?.languages?.length ? nav.languages : [nav?.language]);
};

/** @type {"ko" | "en"} */
export let lang = detect();

/** 테스트용: 언어를 바꾼다(이미 만들어 둔 글자는 그대로) */
export const setLang = next => {
  lang = next === "en" ? "en" : "ko";
};

const fill = (text, params) =>
  params ? text.replace(/\{(\w+)\}/g, (m, k) => (params[k] === undefined ? m : String(params[k]))) : text;

/**
 * @param {string} ko  한국어 원문(열쇠)
 * @param {Record<string, string | number>} [params]
 */
export const t = (ko, params) => fill(lang === "en" ? (EN[ko] ?? ko) : ko, params);

/** 정적 HTML의 글자와 aria-label·title·placeholder를 번역한다. 사전에 있는 것만 바꾼다. */
export const translateDom = (root = document) => {
  if (lang === "ko") return;
  const doc = root.ownerDocument ?? root;
  const walker = doc.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */);
  /** @type {Text[]} */
  const texts = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) texts.push(/** @type {Text} */ (n));
  for (const node of texts) {
    if (/^(SCRIPT|STYLE)$/.test(node.parentElement?.tagName ?? "")) continue;
    const raw = node.nodeValue ?? "";
    const key = raw.trim();
    if (key && EN[key]) node.nodeValue = raw.replace(key, EN[key]);
  }
  for (const el of root.querySelectorAll("[aria-label], [title], [placeholder], meta[name=description]")) {
    for (const attr of ["aria-label", "title", "placeholder", "content"]) {
      const v = el.getAttribute(attr);
      if (v && EN[v]) el.setAttribute(attr, EN[v]);
    }
  }
};
