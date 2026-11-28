import { HEIGHT, set } from "../core/board.js";
import { GARBAGE } from "../core/pieces.js";
import { MODERN } from "../rules/presets.js";
import { t } from "../i18n/index.js";
import { buildWell } from "./practice.js";
import { applyBattleLock, setupBattleGarbage } from "./versus.js";

const rules = Object.freeze({ ...MODERN, hold: Object.freeze({ enabled: false }), previewCount: 0 });
const lessons = /** @type {const} */ ([
  ["공격 보내기", "I 피스로 4줄을 지워 공격을 보내세요.", 4, 0, 4],
  ["쓰레기 상쇄", "4줄을 지워 올라올 쓰레기 4줄을 모두 막으세요.", 1, 4, 0],
  ["상쇄 후 반격", "쓰레기 2줄을 막고 남은 공격 2줄을 보내세요.", 8, 2, 2],
]);

export const BATTLE_LESSONS = Object.freeze(
  lessons.map(([title, instruction, column, pending, sent], index) => {
    const name = t(title);
    return Object.freeze({
      id: `battle-lesson-${index + 1}`,
      name,
      description: t(instruction),
      rules,
      practice: true,
      battleLesson: index + 1,
      noReplay: true,
      fixedSeed: index + 1,
      hud: ["lines"],
      sequence: ["I"],
      setup: (state, rng) => {
        setupBattleGarbage(state, rng, pending);
        buildWell(state.board, column);
        // 한 블록을 남겨 4줄 기본 공격을 퍼펙트 클리어 보너스와 분리한다.
        set(state.board, 0, HEIGHT - 5, GARBAGE);
      },
      gravityFor: () => 0,
      onLock: applyBattleLock,
      check: (state, events) => {
        if (!events.some(event => event.type === "lock")) return null;
        const g = state.garbage;
        return { result: g.blocked === pending && g.sent === sent ? "clear" : "fail" };
      },
      hudLines: state => ({ label: t("받을 쓰레기"), value: String(state.garbage.pending) }),
      hudTime: state => ({ label: t("시간"), frames: state.frame }),
      isRecordable: () => false,
      formatRecord: () => "",
      summary: state => ({ title: state.over === "clear" ? t("성공!") : t("실패") }),
    });
  })
);
