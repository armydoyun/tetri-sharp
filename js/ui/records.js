// 기록 화면(대화상자): 모드 × 규칙별 상위 10개, 1위 기록의 리플레이 보기.
// 표는 늘 10줄이라 고르는 조건이 바뀌어도 대화상자 크기가 그대로다(원칙 2).
import { PRESET_LIST } from "../rules/presets.js";
import { recordKey } from "../storage/records.js";
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
 *   bestReplay: (key: string) => any,
 *   onWatch: (replay: any) => void,
 * }} options
 */
export const createRecordsUI = ({ dialog, modes, records, bestReplay, onWatch }) => {
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
    const replay = bestReplay(recordKey(mode, rules));

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

    const head = el(
      "tr",
      {},
      ...["순위", "기록", "줄", "피스", "PPS", "날짜", "리플레이"].map(t => el("th", { scope: "col", text: t }))
    );
    const rows = Array.from({ length: ROWS }, (_, i) => {
      const e = list[i];
      const watch =
        i === 0 && e
          ? button({
              text: "보기",
              iconName: "play",
              className: "btn btn-small",
              id: "records-watch",
              disabled: !replay,
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
        ...cells.map(t => el("td", { class: "num", text: t })),
        el("td", {}, ...(watch ? [watch] : []))
      );
    });

    const body = el(
      "div",
      {},
      el(
        "section",
        { class: "field-section" },
        fieldRow({ id: "records-mode", label: "모드", control: modeSelect }),
        fieldRow({ id: "records-rules", label: "규칙", control: rulesSelect })
      ),
      el("table", { class: "records-table" }, el("thead", {}, head), el("tbody", {}, ...rows))
    );
    notice.textContent = list.length
      ? replay
        ? `${mode.name} · ${options.find(([id]) => id === rulesId)[1]} — 1위 리플레이를 볼 수 있어요`
        : "1위 리플레이는 이 기능이 생긴 뒤 세운 기록부터 남아요"
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
