import { t } from "../i18n/index.js";
import { MODERN } from "../rules/presets.js";
import { PUZZLES } from "./puzzles.js";

const tuck = PUZZLES.find(stage => stage.kind === "tuck");

export const GESTURE_LESSONS = Object.freeze(
  [
    {
      id: "gesture-lesson-1",
      name: t("두 손가락으로 180도 돌리기"),
      description: t("보드를 두 손가락으로 함께 두드려 T 피스를 뒤집으세요."),
      sequence: ["T"],
      setup: () => {},
      check: (_state, events) => {
        if (events.some(event => event.type === "rotate" && event.turn === 2)) return { result: "clear" };
        if (events.some(event => event.type === "lock")) return { result: "fail" };
        return null;
      },
    },
    {
      id: "gesture-lesson-2",
      name: t("손가락을 떼지 않고 밀어 넣기"),
      description: t(
        "오른쪽으로 한 칸 옮기고 아래로 끌어 내리세요. 손을 떼지 않고 왼쪽으로 밀어 넣은 뒤, 손을 뗐다가 아래로 튕겨 놓으세요."
      ),
      sequence: tuck.pieces,
      setup: state => tuck.build(state.board),
      check: (_state, events) => {
        const lock = events.find(event => event.type === "lock");
        return lock ? { result: lock.lines === 2 ? "clear" : "fail" } : null;
      },
    },
  ].map((lesson, index) =>
    Object.freeze({
      ...lesson,
      rules: MODERN,
      gestureLesson: index + 1,
      practice: true,
      noReplay: true,
      hud: [],
      gravityFor: () => 0,
      hudLines: () => ({ label: t("줄"), value: "0" }),
      hudTime: state => ({ label: t("시간"), frames: state.frame }),
      isRecordable: () => false,
      formatRecord: () => "",
      summary: state => ({ title: state.over === "clear" ? t("성공!") : t("실패") }),
    })
  )
);
