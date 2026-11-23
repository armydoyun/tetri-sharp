// 도움말(처음 오신 분 안내): 조작법 · 추천 순서 · 편하게 하는 설정. 머리글 "도움말"과 첫 화면 안내 줄에서 연다.
// 키 이름은 지금 키 배치에서, 터치 기기면 터치 조작(버튼·제스처) 설명을 보여 준다.
import { ACTIONS } from "../input/keymap.js";
import { el, fillDialog } from "./dom.js";
import { button } from "./components.js";
import { keycap } from "./keycap.js";
import { t } from "../i18n/index.js";

/**
 * @param {{
 *   dialog: HTMLDialogElement,
 *   getSettings: () => any,
 *   isTouch: () => boolean,
 *   onOpenSettings: (tab: string) => void,
 *   onStart: () => void,
 *   onIntro: () => void,
 *   canStart: () => boolean,
 * }} options
 */
export const createHelpUI = ({ dialog, getSettings, isTouch, onOpenSettings, onStart, onIntro, canStart }) => {
  const notice = el("p", { class: "notice-slot", role: "status" });

  const keyList = () => {
    const keymap = getSettings().keymap;
    return el(
      "dl",
      { class: "help-keys" },
      ...ACTIONS.filter(a => (keymap[a.id] ?? []).length).flatMap(a => [
        el("dt", { text: a.label }),
        el("dd", {}, ...keymap[a.id].map(code => keycap(code)), ...(a.id === "PAUSE" ? [keycap("Escape")] : [])),
      ])
    );
  };

  const touchList = () => {
    const gestures = getSettings().touchMode === "gestures";
    const rows = gestures
      ? [
          [t("좌우로 밀기"), t("한 칸씩 이동")],
          [t("두드리기"), t("회전 (오른쪽 절반은 시계, 왼쪽 절반은 반시계)")],
          [t("아래로 밀고 있기"), t("소프트 드롭")],
          [t("아래로 빠르게 튕기기"), t("하드 드롭")],
          [t("위로 밀기"), t("홀드")],
        ]
      : [
          [t("좌우 화살표"), t("한 칸씩 이동")],
          [t("아래 화살표"), t("누르는 동안 천천히 내리기")],
          [t("밑줄 있는 아래 화살표"), t("바닥으로 바로 내려놓기")],
          [t("원형 화살표"), t("반시계 · 180도 · 시계 방향 회전")],
          [t("겹친 사각형"), t("현재 피스 맡기기")],
        ];
    return el(
      "dl",
      { class: "help-keys" },
      ...rows.flatMap(([k, v]) => [el("dt", { text: k }), el("dd", { class: "help-touch", text: v })])
    );
  };

  const section = (title, ...children) =>
    el("section", { class: "help-section" }, el("h3", { text: title }), ...children);
  const steps = items => el("ol", { class: "help-steps" }, ...items.map(text => el("li", { text })));

  const render = (fromWelcome = false) => {
    const toSettings = tab => {
      dialog.close();
      onOpenSettings(tab);
    };
    const control = button({
      label: t("조작감 바꾸기"),
      icon: "sliders",
      size: "s",
      id: "help-to-control",
    });
    control.addEventListener("click", () => toSettings("control"));
    const access = button({
      label: t("접근성 설정"),
      icon: "sliders",
      size: "s",
      id: "help-to-access",
    });
    access.addEventListener("click", () => toSettings("access"));

    const start = button({ label: t("Sprint 40L 시작"), icon: "play", variant: "primary" });
    start.addEventListener("click", () => {
      dialog.close();
      onStart();
    });
    const intro = button({ label: t("기본 조작 연습"), icon: "play" });
    intro.addEventListener("click", () => {
      dialog.close();
      onIntro();
    });
    const body = el(
      "div",
      {},
      section(
        t("이렇게 시작해요"),
        steps([
          t("Sprint 40L은 40줄을 지우는 데 걸린 시간을 재요."),
          t("줄을 가득 채우면 지워져요. 블록이 위까지 차면 끝나요."),
          t("익숙해지면 연습에서 T-spin을, CPU 대전에서 공격과 방어를 익혀 보세요."),
        ]),
        ...(canStart() ? [el("div", { class: "help-actions" }, intro, start)] : [])
      ),
      section(isTouch() ? t("터치 조작") : t("키보드 조작"), isTouch() ? touchList() : keyList()),
      section(
        t("편하게 하기"),
        el(
          "ul",
          { class: "help-tips" },
          el("li", { text: t("블록이 너무 빨리 미끄러지거나 느리면 설정의 조작 탭에서 조작감을 고르세요.") }),
          el("li", { text: t("블록 무늬·진동·화면 읽기 알림·카운트다운 길이는 설정의 접근성 탭에 있어요.") }),
          el("li", { text: t("연습 모드에서는 되돌리기로 방금 놓은 피스를 취소할 수 있어요.") }),
          el("li", { text: t("게임 중 R을 누르면 다시 시작할지 먼저 물어요. 로고를 누르면 첫 화면으로 가요.") })
        ),
        el("div", { class: "help-actions" }, control, access)
      )
    );
    // 처음 오신 분 안내에서 열었을 때만: 머리글 도움말로 열었으면 같은 말을 되풀이하게 된다
    notice.textContent = fromWelcome ? t("이 안내는 머리글의 도움말에서 언제든 다시 볼 수 있어요.") : "";
    fillDialog(dialog, { title: t("도움말"), body, notice, actions: [], closeId: "help-close" });
  };

  return {
    /** @param {{ fromWelcome?: boolean }} [options] */
    open({ fromWelcome = false } = {}) {
      render(fromWelcome);
      dialog.showModal();
      /** @type {HTMLElement | null} */ (dialog.querySelector("#help-close"))?.focus();
    },
    get isOpen() {
      return dialog.open;
    },
  };
};
