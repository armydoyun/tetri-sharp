// 저장 데이터 백업: 설정·기록·리플레이를 한 파일로 내려받고, 그 파일을 다시 들인다.
import { createBackup, parseBackup, restoreBackup } from "../storage/backup.js";
import { EXPEDITION_PROGRESS_KEY } from "../storage/expedition-progress.js";
import { downloadJson } from "./download.js";
import { t } from "../i18n/index.js";

/**
 * @param {{
 *   store: ReturnType<typeof import("../storage/store.js").createStore>,
 *   findMode: (id: string) => any,
 *   fileInput: HTMLInputElement,
 *   canImport: () => boolean,
 *   confirmImport: (message: string) => boolean | Promise<boolean>,
 *   notify: (text: string) => void,
 *   onRestored: () => void,
 * }} options  onRestored: 메모리에 들고 있던 값들을 저장소에서 다시 읽는다
 * @returns {{ exportBackup: () => void, importBackup: () => void }}  설정의 데이터 탭 버튼이 부른다
 */
export const setupBackup = ({ store, findMode, fileInput, canImport, confirmImport, notify, onRestored }) => {
  const exportBackup = () => {
    const backup = createBackup(store);
    downloadJson(backup, `tetri-sharp-backup-${backup.date.slice(0, 10).replace(/-/g, "")}.json`);
    notify(t("설정·기록·리플레이를 백업 파일로 저장했어요."));
  };
  const importBackup = () => fileInput.click();
  let request = 0;
  fileInput.addEventListener("change", async () => {
    const current = ++request;
    const file = fileInput.files?.[0];
    fileInput.value = "";
    if (!file || !canImport()) return;
    let parsed = null;
    try {
      parsed = parseBackup(JSON.parse(await file.text()), findMode);
    } catch {
      parsed = null;
    }
    if (current !== request || !canImport()) return;
    if (!parsed) {
      notify(t("읽을 수 없는 백업 파일이에요."));
      return;
    }
    const { records: count, replays: replayCount, puzzles, practice, attempts } = parsed.summary;
    const expedition = Object.keys(parsed.data[EXPEDITION_PROGRESS_KEY] ?? {}).length;
    const when = parsed.date ? ` (${parsed.date.slice(0, 10)})` : "";
    const message =
      t("백업{when}에는 기록 {records}개, 리플레이 {replays}개가 있어요.", {
        when,
        records: count,
        replays: replayCount,
      }) +
      "\n" +
      t("퍼즐 완료 {puzzles}개 · 훈련 완료 {practice}개 · Sprint 시도 {attempts}개", { puzzles, practice, attempts }) +
      "\n" +
      (expedition ? t("규칙 원정 완료 {n}단계", { n: expedition }) + "\n" : "") +
      t("설정·기록·리플레이는 교체돼요. 백업에 없으면 설정은 기본값으로, 기록과 리플레이는 빈 상태로 돌아가요.") +
      "\n" +
      t("내 퍼즐, 받은 퍼즐, 퍼즐 팩은 이 기기의 목록과 합쳐요.") +
      "\n" +
      t("연습·기본 퍼즐·Sprint·규칙 원정 진행도, 달성한 업적과 내 규칙은 백업에 있을 때만 바뀌어요.");
    if (!(await confirmImport(message))) return;
    if (current !== request || !canImport()) return;
    if (!restoreBackup(store, parsed)) {
      notify(t("백업을 저장하지 못했어요. 기존 데이터는 그대로예요."));
      return;
    }
    onRestored();
    notify(t("백업을 불러왔어요 · 기록 {records}개, 리플레이 {replays}개", { records: count, replays: replayCount }));
  });
  return { exportBackup, importBackup };
};
