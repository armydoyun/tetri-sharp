// 도움말(처음 오신 분 안내): 조작법 · 추천 순서 · 편하게 하는 설정. 머리글 "도움말"과 첫 화면 안내 줄에서 연다.
// 키 이름은 지금 키 배치에서, 터치 기기면 터치 조작(버튼·제스처) 설명을 보여 준다.
import { ACTIONS } from "../input/keymap.js";
import { button, el, fillDialog } from "./dom.js";
import { keycap } from "./keycap.js";
import { t } from "../i18n/index.js";

/**
 * @param {{
 *   dialog: HTMLDialogElement,
 *   getSettings: () => any,
 *   isTouch: () => boolean,
 *   onOpenSettings: (tab: string) => void,
 * }} options
 */
export const createHelpUI = ({ dialog, getSettings, isTouch, onOpenSettings }) => {
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
          [t("보드 아래 버튼"), t("이동 · 회전 · 드롭 · 홀드")],
          [t("오른쪽 끝 버튼"), t("일시정지 · 다시 시작")],
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

  const render = () => {
    const toSettings = tab => {
      dialog.close();
      onOpenSettings(tab);
    };
    const control = button({
      text: t("조작감 바꾸기"),
      iconName: "sliders",
      className: "btn btn-small",
      id: "help-to-control",
    });
    control.addEventListener("click", () => toSettings("control"));
    const access = button({
      text: t("접근성 설정"),
      iconName: "sliders",
      className: "btn btn-small",
      id: "help-to-access",
    });
    access.addEventListener("click", () => toSettings("access"));

    const body = el(
      "div",
      {},
      section(
        t("이렇게 시작해요"),
        steps([
          t("위의 규칙에서 Modern을 고른 채로 두세요. 요즘 표준 규칙이에요."),
          t("플레이 모드에서 Marathon이나 Sprint 40L을 눌러 시작해요."),
          t("줄을 가득 채우면 지워져요. 블록이 위까지 차면 끝나요."),
          t("익숙해지면 연습에서 T-spin을, CPU 대전에서 공격과 방어를 익혀 보세요."),
        ])
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
    notice.textContent = t("이 안내는 머리글의 도움말에서 언제든 다시 볼 수 있어요.");
    fillDialog(dialog, { title: t("도움말"), body, notice, actions: [], closeId: "help-close" });
  };

  return {
    open() {
      render();
      dialog.showModal();
      /** @type {HTMLElement | null} */ (dialog.querySelector("#help-close"))?.focus();
    },
    get isOpen() {
      return dialog.open;
    },
  };
};
