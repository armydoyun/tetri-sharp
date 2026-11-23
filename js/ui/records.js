// 기록 화면(대화상자): 모드 × 규칙별 상위 10개, 1위 기록의 리플레이 보기.
// 표는 늘 10줄이라 고르는 조건이 바뀌어도 대화상자 크기가 그대로다(원칙 2).
import { recentSprintMedian } from "../storage/sprint-history.js";
import { formatTime } from "../modes/format.js";
import { PRESET_LIST } from "../rules/presets.js";
import { recordKey } from "../storage/records.js";
import { MAX_RANKED } from "../replay/replay.js";
import { button, el, fillDialog, fieldRow } from "./dom.js";
import { dropdown } from "./select.js";
import { RANK_STEPS, nextRankStep, rankLabel, rankOf } from "../modes/ranks.js";
import { t } from "../i18n/index.js";

const ROWS = 10;

const formatDate = iso => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
};

const renderSprintHistory = (runs, personalBest) => {
  const median = recentSprintMedian(runs);
  const maximum = Math.max(1, ...runs.filter(run => run.cleared).map(run => run.frames));
  const bars = runs.map(({ frames, cleared }, index) => {
    const value = cleared ? formatTime(frames) : t("미완주");
    const label = t("{n}번째 판 · {value}", { n: index + 1, value });
    const bar = el(
      "li",
      { class: cleared ? "" : "sprint-dnf", title: label },
      el("span", { class: "sr-only", text: label })
    );
    bar.style.setProperty("--run-height", cleared ? `${Math.max(9, (frames / maximum) * 100)}%` : "9%");
    return bar;
  });
  return el(
    "details",
    { class: "field-section sprint-history", id: "sprint-history" },
    el("summary", { text: t("최근 20판") }),
    el("p", {
      text: t("개인 최고 {best} · 최근 완주 최대 5회의 중앙값 {median}", {
        best: personalBest ? formatTime(personalBest.frames) : "—",
        median: median === null ? "—" : formatTime(median),
      }),
    }),
    runs.length
      ? el(
          "div",
          {},
          el("ol", { class: "sprint-history-chart" }, ...bars),
          el("p", { text: t("왼쪽부터 오래된 순서 · 낮을수록 빠름 · 빈 막대는 미완주") })
        )
      : el("p", { text: t("이 기능이 추가된 뒤부터 최근 판이 쌓여요.") })
  );
};

/**
 * @param {{
 *   dialog: HTMLDialogElement,
 *   modes: readonly any[],
 *   records: ReturnType<typeof import("../storage/records.js").createRecords>,
 *   sprintHistory: ReturnType<typeof import("../storage/sprint-history.js").createSprintHistory>,
 *   replayFor: (key: string, entry: any) => any,
 *   onWatch: (replay: any) => void,
 *   canRace: (modeId: string, rulesId: string) => boolean,
 *   onRace: (modeId: string, rulesId: string) => void,
 * }} options
 */
export const createRecordsUI = ({ dialog, modes, records, sprintHistory, replayFor, onWatch, canRace, onRace }) => {
  let modeId = modes[0].id;
  let rulesId = "modern";
  const notice = el("p", { class: "notice-slot", role: "status", id: "records-notice" });

  /** 이 모드에서 고를 수 있는 규칙: 프리셋 + 기록이 있는 Custom 조합 */
  const ruleOptions = mode => {
    const ids =
      mode.id === "sprint40"
        ? [...new Set([...records.rulesIdsFor(mode), ...sprintHistory.rulesIds()])]
        : records.rulesIdsFor(mode);
    const customs = ids.filter(id => !PRESET_LIST.some(p => p.id === id));
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

    const modeSelect = dropdown({
      id: "records-mode",
      label: t("모드"),
      options: modes.map(m => ({ value: m.id, label: m.name })),
      value: mode.id,
      onChange: v => {
        modeId = v;
        render();
        /** @type {HTMLElement | null} */ (dialog.querySelector("#records-mode"))?.focus();
      },
    });
    const rulesSelect = dropdown({
      id: "records-rules",
      label: t("규칙"),
      options: options.map(([id, name]) => ({ value: id, label: name })),
      value: rulesId,
      onChange: v => {
        rulesId = v;
        render();
        /** @type {HTMLElement | null} */ (dialog.querySelector("#records-rules"))?.focus();
      },
    });
    const nameInput = el("input", {
      id: "record-player-name",
      class: "text-input",
      type: "text",
      value: records.playerName,
      placeholder: t("이름 없음"),
      autocomplete: "off",
    });
    const nameSave = button({ type: "submit", text: t("저장"), "aria-label": t("플레이어 이름 저장") });
    const nameForm = el("form", { class: "record-name-form" }, nameInput, nameSave);
    nameForm.addEventListener("submit", event => {
      event.preventDefault();
      const saved = records.setPlayerName(nameInput.value);
      nameInput.value = records.playerName;
      notice.textContent = !saved
        ? t("이번 접속에만 이름을 적용했어요. 브라우저에 저장하지 못했어요.")
        : records.playerName
          ? t("새 기록에 이 이름을 사용해요.")
          : t("새 기록을 이름 없이 남겨요.");
    });

    const head = el(
      "tr",
      {},
      ...[t("순위"), t("이름"), t("기록"), t("줄"), t("피스"), "PPS", t("날짜"), t("리플레이")].map(label =>
        el("th", { scope: "col", text: label })
      )
    );
    const rows = Array.from({ length: ROWS }, (_, i) => {
      const e = list[i];
      const replay = replays[i] ?? null;
      const watch =
        i < MAX_RANKED && e
          ? button({
              text: t("보기"),
              iconName: "play",
              className: "btn btn-small",
              id: i === 0 ? "records-watch" : `records-watch-${i + 1}`,
              disabled: !replay,
              "aria-label": t("{n}위 리플레이 보기", { n: i + 1 }),
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
        : [`${i + 1}`, "", "", "", "", ""];
      return el(
        "tr",
        { class: e ? "" : "is-empty" },
        el("td", { class: "num", text: cells[0] }),
        el("td", { class: "record-player", text: e ? e.playerName || t("이름 없음") : "", title: e?.playerName }),
        ...cells.slice(1).map(text => el("td", { class: "num", text })),
        el("td", {}, ...(watch ? [watch] : []))
      );
    });

    // 최고 기록의 랭크와 다음 랭크 기준(랭크가 있는 모드만)
    const rank = rankOf(mode, list[0]);
    const next = nextRankStep(mode, list[0]);
    const rankLine = rank
      ? el(
          "p",
          { class: "records-rank", id: "records-rank" },
          el("strong", { text: rankLabel(rank) }),
          " ",
          el("span", {
            text: next
              ? t("다음 {rank}: {record}", {
                  rank: next.rank,
                  record: mode.formatRecord({ [RANK_STEPS[mode.id].metric]: next.value }),
                })
              : t("가장 높은 랭크예요"),
          })
        )
      : null;
    const empty = el("p", {
      class: "records-empty",
      text: t("아직 기록이 없어요. 이 모드와 규칙으로 한 판을 끝내면 여기에 표시돼요."),
    });
    const body = el(
      "div",
      {},
      el(
        "section",
        { class: "field-section" },
        fieldRow({
          id: "record-player-name",
          label: t("플레이어 이름"),
          hint: t("새 기록에 표시돼요. 최대 24자."),
          control: nameForm,
        }),
        fieldRow({ id: "records-mode", label: t("모드"), control: modeSelect }),
        fieldRow({ id: "records-rules", label: t("규칙"), control: rulesSelect })
      ),
      ...(rankLine ? [rankLine] : []),
      ...(list.length
        ? [el("table", { class: "records-table" }, el("thead", {}, head), el("tbody", {}, ...rows))]
        : [empty]),
      ...(mode.id === "sprint40" ? [renderSprintHistory(sprintHistory.list(rulesId), list[0])] : [])
    );
    const watchable = replays.filter(Boolean).length;
    notice.textContent = list.length
      ? watchable
        ? `${mode.name} · ${options.find(([id]) => id === rulesId)[1]} — ${t("상위 {n}개 기록의 리플레이를 볼 수 있어요", { n: MAX_RANKED })}`
        : t("상위 {n}개 기록의 리플레이는 이 기능이 생긴 뒤 세운 기록부터 남아요", { n: MAX_RANKED })
      : "";
    const scroll = dialog.querySelector(".dialog-body")?.scrollTop ?? 0;
    // 이 모드·규칙의 최고 기록 리플레이와 같은 블록 순서로 달리기(달릴 수 있을 때만 보인다)
    const race = button({ text: t("최고 기록과 달리기"), iconName: "play", id: "records-race" });
    race.addEventListener("click", () => {
      dialog.close();
      onRace(mode.id, rulesId);
    });
    const actions = mode.race && canRace(mode.id, rulesId) ? [race] : [];
    fillDialog(dialog, { title: t("기록"), body, notice, actions, closeId: "records-close" });
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
