// 게임 이벤트에 대한 반응: 보드 위 큰 글씨(액션 표시), 진동, 화면 읽기 알림.
import { clearName } from "../rules/scoring/guideline.js";
import { formatScore } from "../modes/format.js";
import { t } from "../i18n/index.js";

const describeAttack = ({ cleared, tspin, lines, blocked, base, backToBack, combo, perfect }) => {
  const outcome = [];
  if (blocked) outcome.push(t("{n}줄 상쇄", { n: blocked }));
  if (lines) outcome.push(t("{n}줄 보냄", { n: lines }));
  if (!outcome.length) outcome.push(t("공격 0줄"));
  const clear =
    tspin === "mini"
      ? t("미니 T스핀 {n}줄", { n: cleared })
      : tspin === "full"
        ? t("T스핀 {n}줄", { n: cleared })
        : t("일반 {n}줄", { n: cleared });
  const parts = [`${clear} +${base}`];
  if (backToBack) parts.push(t("백투백 +{n}", { n: backToBack }));
  if (combo) parts.push(t("콤보 +{n}", { n: combo }));
  if (perfect) parts.push(t("퍼펙트 클리어 +{n}", { n: perfect }));
  return { outcome, parts };
};

/**
 * @param {{
 *   actionEl: HTMLElement,
 *   versusEl: HTMLElement,
 *   srStatus: HTMLElement,
 *   getSettings: () => any,
 *   describeLeft: () => { label: string, value: string } | null,
 * }} options  describeLeft: 줄을 지웠을 때 함께 읽을 "남은 양"(모드의 줄 칸)
 */
export const createFeedback = ({ actionEl, versusEl, srStatus, getSettings, describeLeft }) => {
  const attackOutcome = versusEl.querySelector(".versus-feedback-outcome");
  const attackParts = versusEl.querySelector(".versus-feedback-parts");
  let explainedSingle = false;

  /** 보드 위에 큰 글씨로 잠깐 띄운다 @param {string[]} lines */
  const announceText = lines => {
    if (!lines.length) return;
    actionEl.replaceChildren(
      ...lines.map((text, i) => {
        const div = document.createElement("div");
        div.textContent = text;
        if (i === 0) div.className = "action-main";
        return div;
      })
    );
    // 애니메이션을 처음부터 다시 돌린다.
    actionEl.classList.remove("is-shown");
    void actionEl.offsetWidth;
    actionEl.classList.add("is-shown");
  };

  /** 액션 표시 (T-SPIN DOUBLE, B2B, 콤보, 퍼펙트 클리어, 레벨업) */
  const announce = e => {
    /** @type {string[]} */
    let lines = [];
    if (e.type === "lock") {
      const name = clearName(e);
      const showName = e.tspin !== "none" || e.lines >= 4;
      if (e.perfect) lines.push("PERFECT CLEAR");
      if (e.b2b) lines.push("BACK-TO-BACK");
      if (showName && name) lines.push(name);
      if (e.combo >= 1) lines.push(`${e.combo} COMBO`);
      if (lines.length && e.points) lines.push(`+${formatScore(e.points)}`);
    } else if (e.type === "practice" && !e.reset) {
      lines = [e.success ? t("성공") : t("다시")];
    } else if (e.type === "levelUp") {
      lines = [`LEVEL ${e.level}`];
    }
    announceText(lines);
  };

  /** 진동(설정이 켜져 있고 지원하는 기기만) */
  const buzz = pattern => {
    if (getSettings().access.vibrate !== "on") return;
    try {
      navigator.vibrate?.(pattern);
    } catch {
      /* 무시 */
    }
  };

  /** 화면 읽기 프로그램에 알린다(설정이 켜져 있을 때). 같은 글을 연달아 보내도 읽도록 비웠다가 넣는다 */
  const say = text => {
    if (getSettings().access.announce !== "on" || !text) return;
    srStatus.textContent = "";
    requestAnimationFrame(() => (srStatus.textContent = text));
  };

  const announceAttack = e => {
    // 매번 싱글이 나올 때 알릴 필요는 없다. 미니 T스핀과 상쇄처럼 다른 결과는 매번 설명한다.
    if (e.tspin === "none" && !e.lines && !e.blocked) {
      if (explainedSingle) return "";
      explainedSingle = true;
    }
    const { outcome, parts } = describeAttack(e);
    attackOutcome.textContent = outcome.join(" · ");
    attackParts.replaceChildren(
      ...parts.map(part => {
        const span = document.createElement("span");
        span.textContent = part;
        return span;
      })
    );
    versusEl.classList.remove("is-shown");
    void versusEl.offsetWidth;
    versusEl.classList.add("is-shown");
    return [...outcome, ...parts].join(" · ");
  };

  /** 이벤트 → 진동·읽기 */
  const react = events => {
    const attack = events.find(e => e.type === "attack");
    const detail = attack ? announceAttack(attack) : "";
    for (const e of events) {
      if (e.type === "lock") {
        if (e.lines > 0) {
          buzz(e.lines >= 4 || e.tspin !== "none" ? [25, 30, 25] : 15);
          const name = clearName(e);
          const left = describeLeft();
          say(
            [detail || name || t("{n}줄 지움", { n: e.lines }), left ? `${left.label} ${left.value}` : ""]
              .filter(Boolean)
              .join(" · ")
          );
        } else buzz(6);
      } else if (e.type === "levelUp") say(t("레벨 {n}", { n: e.level }));
      else if (e.type === "garbage") buzz(20);
      else if (e.type === "gameOver") buzz([60, 40, 90]);
      else if (e.type === "finish") buzz([30, 30, 30]);
    }
  };

  /** 떠 있는 액션 표시를 지운다(새 판·리플레이 이동 때) */
  const clearAction = () => {
    actionEl.classList.remove("is-shown");
    versusEl.classList.remove("is-shown");
    explainedSingle = false;
  };

  return { announce, announceText, clearAction, buzz, say, react };
};
