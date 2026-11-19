// 저장 데이터 백업: 설정·기록·리플레이를 한 파일로 내려받고, 그 파일을 다시 들인다.
import { createBackup, parseBackup, restoreBackup } from "../storage/backup.js";
import { downloadJson } from "./download.js";
import { t } from "../i18n/index.js";

/**
 * @param {{
 *   store: ReturnType<typeof import("../storage/store.js").createStore>,
 *   findMode: (id: string) => any,
 *   exportButton: HTMLElement,
 *   importButton: HTMLElement,
 *   fileInput: HTMLInputElement,
 *   canImport: () => boolean,
 *   confirmImport: (message: string) => boolean,
 *   notify: (text: string) => void,
 *   onRestored: () => void,
 * }} options  onRestored: 메모리에 들고 있던 값들을 저장소에서 다시 읽는다
 */
export const setupBackup = ({
  store,
  findMode,
  exportButton,
  importButton,
  fileInput,
  canImport,
  confirmImport,
  notify,
  onRestored,
}) => {
  exportButton.addEventListener("click", () => {
    const backup = createBackup(store);
    downloadJson(backup, `tetri-sharp-backup-${backup.date.slice(0, 10).replace(/-/g, "")}.json`);
    notify(t("설정·기록·리플레이를 백업 파일로 저장했어요."));
  });

  importButton.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    fileInput.value = "";
    if (!file || !canImport()) return;
    let parsed = null;
    try {
      parsed = parseBackup(JSON.parse(await file.text()), findMode);
    } catch {
      parsed = null;
    }
    if (!parsed) {
      notify(t("읽을 수 없는 백업 파일이에요."));
      return;
    }
    const { records: count, replays: replayCount } = parsed.summary;
    const when = parsed.date ? ` (${parsed.date.slice(0, 10)})` : "";
    const message =
      t("백업{when}에는 기록 {records}개, 리플레이 {replays}개가 있어요.", {
        when,
        records: count,
        replays: replayCount,
      }) +
      "\n" +
      t("지금 이 브라우저의 설정·기록·리플레이를 백업 내용으로 바꿀까요?");
    if (!confirmImport(message)) return;
    const ok = restoreBackup(store, parsed);
    onRestored();
    notify(
      ok
        ? t("백업을 불러왔어요 · 기록 {records}개, 리플레이 {replays}개", { records: count, replays: replayCount })
        : t("일부를 저장하지 못했어요. 저장 공간을 확인해 주세요.")
    );
  });
};
