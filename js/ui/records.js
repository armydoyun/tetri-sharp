// 기록 화면(대화상자): 모드 × 규칙별 상위 10개, 1위 기록의 리플레이 보기.
// 표는 늘 10줄이라 고르는 조건이 바뀌어도 대화상자 크기가 그대로다(원칙 2).
import { PRESET_LIST } from "../rules/presets.js";
import { recordKey } from "../storage/records.js";
import { MAX_RANKED } from "../replay/replay.js";
import { button, el, fillDialog, fieldRow } from "./dom.js";

const ROWS = 10;

const formatDate = iso => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
};

/**
 * @param {{
 *   dialog: HTMLDialogElement,
 *   modes: readonly any[],
 *   records: ReturnType<typeof import("../storage/records.js").createRecords>,
 *   replayFor: (key: string, entry: any) => any,
 *   onWatch: (replay: any) => void,
 * }} options
 */
export const createRecordsUI = ({ dialog, modes, records, replayFor, onWatch }) => {
  let modeId = modes[0].id;
  let rulesId = "modern";
  const notice = el("p", { class: "notice-slot", role: "status", id: "records-notice" });

  /** 이 모드에서 고를 수 있는 규칙: 프리셋 + 기록이 있는 Custom 조합 */
  const ruleOptions = mode => {
    const customs = records.rulesIdsFor(mode).filter(id => !PRESET_LIST.some(p => p.id === id));
    return [...PRESET_LIST.map(p => [p.id, p.name]), ...customs.map(id => [id, `Custom ${id.slice(7)}`])];
  };

  const render = () => {
    const mode = modes.find(m => m.id === modeId) ?? modes[0];
    const options = ruleOptions(mode);
    if (!options.some(([id]) => id === rulesId)) rulesId = options[0][0];
    const rules = { id: rulesId };
    const list = records.list(mode, rules);
    const key = recordKey(mode, rules);
    const replays = list.slice(0, MAX_RANKED).map(e => replayFor(key, e));

    const modeSelect = el("select", { id: "records-mode", class: "select" });
    for (const m of modes) modeSelect.append(el("option", { value: m.id, text: m.name, selected: m.id === mode.id }));
    modeSelect.addEventListener("change", () => {
      modeId = modeSelect.value;
      render();
      /** @type {HTMLElement | null} */ (dialog.querySelector("#records-mode"))?.focus();
    });
    const rulesSelect = el("select", { id: "records-rules", class: "select" });
    for (const [id, name] of options)
      rulesSelect.append(el("option", { value: id, text: name, selected: id === rulesId }));
    rulesSelect.addEventListener("change", () => {
      rulesId = rulesSelect.value;
      render();
      /** @type {HTMLElement | null} */ (dialog.querySelector("#records-rules"))?.focus();
    });

    const nameInput = el("input", {
      id: "record-player-name",
      class: "text-input",
      type: "text",
      value: records.playerName,
      placeholder: "이름 없음",
      autocomplete: "off",
    });
    const nameSave = button({ type: "submit", text: "저장", "aria-label": "플레이어 이름 저장" });
    const nameForm = el("form", { class: "record-name-form" }, nameInput, nameSave);
    nameForm.addEventListener("submit", event => {
      event.preventDefault();
      const saved = records.setPlayerName(nameInput.value);
      nameInput.value = records.playerName;
      notice.textContent = !saved
        ? "이번 접속에만 이름을 적용했어요. 브라우저에 저장하지 못했어요."
        : records.playerName
          ? "새 기록에 이 이름을 사용해요."
          : "새 기록을 이름 없이 남겨요.";
    });

    const head = el(
      "tr",
      {},
      ...["순위", "이름", "기록", "줄", "피스", "PPS", "날짜", "리플레이"].map(t => el("th", { scope: "col", text: t }))
    );
    const rows = Array.from({ length: ROWS }, (_, i) => {
      const e = list[i];
      const replay = replays[i] ?? null;
      const watch =
        i < MAX_RANKED && e
          ? button({
              text: "보기",
              iconName: "play",
              className: "btn btn-small",
              id: i === 0 ? "records-watch" : `records-watch-${i + 1}`,
              disabled: !replay,
              "aria-label": `${i + 1}위 리플레이 보기`,
            })
          : null;
      if (watch && replay)
        watch.addEventListener("click", () => {
          dialog.close();
          onWatch(replay);
        });
      const cells = e
        ? [
            `${i + 1}`,
            mode.formatRecord(e),
            String(e.lines),
            String(e.pieces),
            e.frames ? (e.pieces / (e.frames / 60)).toFixed(2) : "—",
            formatDate(e.date),
          ]
        : [`${i + 1}`, "—", "", "", "", ""];
      return el(
        "tr",
        { class: e ? "" : "is-empty" },
        el("td", { class: "num", text: cells[0] }),
        el("td", { class: "record-player", text: e ? e.playerName || "이름 없음" : "", title: e?.playerName }),
        ...cells.slice(1).map(t => el("td", { class: "num", text: t })),
        el("td", {}, ...(watch ? [watch] : []))
      );
    });

    const body = el(
      "div",
      {},
      el(
        "section",
        { class: "field-section" },
        fieldRow({
          id: "record-player-name",
          label: "플레이어 이름",
          hint: "새 기록에 표시돼요. 최대 24자.",
          control: nameForm,
        }),
        fieldRow({ id: "records-mode", label: "모드", control: modeSelect }),
        fieldRow({ id: "records-rules", label: "규칙", control: rulesSelect })
      ),
      el("table", { class: "records-table" }, el("thead", {}, head), el("tbody", {}, ...rows))
    );
    const watchable = replays.filter(Boolean).length;
    notice.textContent = list.length
      ? watchable
        ? `${mode.name} · ${options.find(([id]) => id === rulesId)[1]} — 상위 ${MAX_RANKED}개 기록의 리플레이를 볼 수 있어요`
        : `상위 ${MAX_RANKED}개 기록의 리플레이는 이 기능이 생긴 뒤 세운 기록부터 남아요`
      : "아직 기록이 없어요";
    const scroll = dialog.querySelector(".dialog-body")?.scrollTop ?? 0;
    fillDialog(dialog, { title: "기록", body, notice, actions: [], closeId: "records-close" });
    body.scrollTop = scroll;
  };

  return {
    /** @param {{ modeId?: string, rulesId?: string }} [start] 처음 보여 줄 모드·규칙 */
    open(start = {}) {
      if (start.modeId) modeId = start.modeId;
      if (start.rulesId) rulesId = start.rulesId;
      render();
      dialog.showModal();
      /** @type {HTMLElement | null} */ (dialog.querySelector("#records-mode"))?.focus();
    },
    get isOpen() {
      return dialog.open;
    },
  };
};
