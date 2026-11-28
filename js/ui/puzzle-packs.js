import { decodePuzzle, goalLabel, puzzleId } from "../modes/custom-puzzle.js";
import { encodePack, MAX_PACK_STAGES, MAX_PACK_TITLE, MIN_PACK_STAGES, packLink } from "../modes/puzzle-pack.js";
import { MAX_PACKS } from "../storage/puzzle-packs.js";
import { copyText, revealForCopy } from "./clipboard.js";
import { button, confirmButton, iconButton, menuRow, textInput } from "./components.js";
import { el, fieldRow, fillDialog } from "./dom.js";
import { dropdown } from "./select.js";
import { t } from "../i18n/index.js";

/** @param {{ dialog: HTMLDialogElement, packs: ReturnType<typeof import("../storage/puzzle-packs.js").createPuzzlePacks>, customs: ReturnType<typeof import("../storage/custom-puzzles.js").createCustomPuzzles>, onPlay: (code: string, index: number) => void }} options */
export const createPuzzlePacksUI = ({ dialog, packs, customs, onPlay }) => {
  const notice = el("p", { class: "notice-slot", role: "status" });
  const title = textInput({ id: "pack-title", maxLength: MAX_PACK_TITLE });
  const count = (cleared, total) => t("{n} / {total}단계 완료", { n: cleared, total });
  const puzzleName = puzzle => puzzle.title || goalLabel(puzzle.goal);

  const show = (title, body, actions = [], focus = "", scroll = 0) => {
    fillDialog(dialog, { title, body, notice, actions, closeId: "pack-close" });
    if (!dialog.open) dialog.showModal();
    body.scrollTop = scroll;
    /** @type {HTMLElement | null} */ (dialog.querySelector(focus || "#pack-close"))?.focus({ preventScroll: true });
  };

  const open = (focus = "#pack-create") => {
    const list = packs.read();
    notice.textContent = "";
    const rows = list.map((entry, index) =>
      el(
        "div",
        { class: "custom-puzzle-row" },
        menuRow({
          id: `pack-open-${index}`,
          title: entry.pack.title,
          desc: count(entry.cleared.length, entry.pack.puzzles.length),
          onClick: () => details(entry.code),
        }),
        el(
          "div",
          { class: "custom-puzzle-actions" },
          confirmButton({
            label: t("퍼즐 팩 지우기"),
            confirmLabel: t("정말 지우기"),
            size: "s",
            onConfirm: () => {
              if (packs.remove(entry.code)) open();
              else notice.textContent = t("퍼즐 팩을 저장하지 못했어요.");
            },
          })
        )
      )
    );
    const create = button({
      id: "pack-create",
      label: t("퍼즐 팩 만들기"),
      icon: "plus",
      disabled: list.length >= MAX_PACKS,
      onClick: createPack,
    });
    if (list.length >= MAX_PACKS) notice.textContent = t("퍼즐 팩은 {n}개까지 저장할 수 있어요.", { n: MAX_PACKS });
    show(
      t("퍼즐 팩"),
      el(
        "div",
        {},
        el("div", { class: "menu-list" }, ...(rows.length ? rows : [el("p", { text: t("저장된 퍼즐 팩이 없어요.") })]))
      ),
      [create],
      focus === "#pack-create" && create.disabled ? "#pack-open-0" : focus
    );
  };

  const details = (code, focusedIndex = -1) => {
    const entry = packs.find(code);
    if (!entry) return open();
    notice.textContent = "";
    const { pack, cleared } = entry;
    const link = textInput({ type: "url", readOnly: true, hidden: true, "aria-label": t("공유 링크") });
    const share = button({
      id: "pack-share",
      label: t("링크 복사"),
      icon: "link",
      onClick: async () => {
        const url = packLink(code, location.href);
        if (await copyText(url)) {
          if (dialog.open && link.isConnected) notice.textContent = t("링크를 복사했어요.");
        } else if (dialog.open && link.isConnected) {
          revealForCopy(link, url);
        }
      },
    });
    const rows = pack.puzzles.map((puzzleCode, index) => {
      const puzzle = decodePuzzle(puzzleCode);
      return menuRow({
        index: index + 1,
        id: `pack-stage-${index}`,
        title: puzzleName(puzzle),
        desc: goalLabel(puzzle.goal),
        meta: cleared.includes(index) ? t("완료") : "",
        onClick: () => {
          dialog.close();
          onPlay(code, index);
        },
      });
    });
    const next = pack.puzzles.findIndex((_, index) => !cleared.includes(index));
    show(
      pack.title,
      el(
        "div",
        {},
        el(
          "div",
          { class: "field-section" },
          button({ label: t("퍼즐 팩 목록"), icon: "arrow-left", onClick: () => open() })
        ),
        el("p", { id: "pack-progress", text: count(cleared.length, rows.length) }),
        el("div", { class: "menu-list" }, ...rows),
        link
      ),
      [share],
      `#pack-stage-${focusedIndex >= 0 ? focusedIndex : Math.max(0, next)}`
    );
  };

  function createPack() {
    const available = customs.made().map(item => {
      const puzzle = decodePuzzle(item.code);
      return { ...item, name: puzzleName(puzzle), key: puzzleId(puzzle) };
    });
    const stages = [];
    title.value = "";
    notice.textContent = "";
    const render = (focus = "#pack-title") => {
      const scroll = dialog.querySelector(".dialog-body")?.scrollTop ?? 0;
      const remaining = available.filter(item => !stages.some(stage => stage.key === item.key));
      const pick = dropdown({
        id: "pack-add-stage",
        label: t("내 퍼즐 추가"),
        options: [
          { value: "", label: t("내 퍼즐 추가") },
          ...remaining.map(item => ({ value: item.id, label: item.name })),
        ],
        value: "",
        disabled: stages.length >= MAX_PACK_STAGES || !remaining.length,
        onChange: id => {
          const selected = remaining.find(item => item.id === id);
          if (!selected) return;
          stages.push(selected);
          const canAdd = stages.length < MAX_PACK_STAGES && remaining.some(item => item.key !== selected.key);
          render(
            canAdd
              ? "#pack-add-stage"
              : title.value.trim() && stages.length >= MIN_PACK_STAGES
                ? "#pack-save"
                : "#pack-title"
          );
        },
      });
      const save = button({
        id: "pack-save",
        label: t("저장"),
        variant: "primary",
        disabled: !title.value.trim() || stages.length < MIN_PACK_STAGES,
        onClick: () => {
          const code = encodePack({ title: title.value, puzzles: stages.map(item => item.code) });
          const entry = code && packs.add(code);
          if (entry) details(entry.code);
          else notice.textContent = t("퍼즐 팩을 저장하지 못했어요.");
        },
      });
      title.oninput = () => {
        save.disabled = !title.value.trim() || stages.length < MIN_PACK_STAGES;
      };
      const rows = stages.map((stage, index) => {
        const move = (offset, direction) => {
          stages.splice(index, 1);
          stages.splice(index + offset, 0, stage);
          render(`#pack-${direction}-${stage.id}:not(:disabled), #pack-remove-${stage.id}`);
        };
        return el(
          "div",
          { class: "custom-puzzle-row" },
          el("span", { text: `${index + 1}. ${stage.name}` }),
          el(
            "div",
            { class: "custom-puzzle-actions" },
            iconButton({
              id: `pack-up-${stage.id}`,
              icon: "arrow-up",
              label: t("위로 이동"),
              disabled: index === 0,
              onClick: () => move(-1, "up"),
            }),
            iconButton({
              id: `pack-down-${stage.id}`,
              icon: "arrow-down",
              label: t("아래로 이동"),
              disabled: index === stages.length - 1,
              onClick: () => move(1, "down"),
            }),
            iconButton({
              id: `pack-remove-${stage.id}`,
              icon: "close",
              label: t("팩에서 빼기"),
              onClick: () => {
                stages.splice(index, 1);
                render("#pack-add-stage");
              },
            })
          )
        );
      });
      show(
        t("퍼즐 팩 만들기"),
        el(
          "div",
          {},
          el(
            "div",
            { class: "field-section" },
            button({ label: t("퍼즐 팩 목록"), icon: "arrow-left", onClick: () => open() })
          ),
          fieldRow({ id: "pack-title", label: t("팩 이름"), control: title }),
          el("p", {
            text: t("내 퍼즐을 {min}~{max}개 골라 순서를 정하세요.", { min: MIN_PACK_STAGES, max: MAX_PACK_STAGES }),
          }),
          ...(available.length < MIN_PACK_STAGES
            ? [el("p", { text: t("먼저 내 퍼즐을 {n}개 이상 만들어 주세요.", { n: MIN_PACK_STAGES }) })]
            : []),
          el("div", { class: "field-section" }, pick),
          el("div", { class: "menu-list" }, ...rows)
        ),
        [save],
        focus,
        scroll
      );
    };
    render();
  }

  return { open, details };
};
