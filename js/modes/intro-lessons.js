import { HEIGHT, WIDTH, set } from "../core/board.js";
import { GARBAGE } from "../core/pieces.js";
import { MODERN } from "../rules/presets.js";
import { t } from "../i18n/index.js";

const steps = /** @type {const} */ ([
  ["한 칸 이동", "좌우 중 한 방향으로 피스를 옮겨 보세요.", "move"],
  ["피스 회전", "피스를 한 번 돌려 보세요.", "rotate"],
  ["홀드", "홀드로 현재 피스를 맡겨 보세요.", "hold"],
  ["첫 줄 지우기", "I 피스를 아래쪽 빈 네 칸에 놓아 한 줄을 채우세요.", "lock"],
]);

export const INTRO_LESSONS = Object.freeze(
  steps.map(([title, description, eventType], index) => {
    const last = index === steps.length - 1;
    const name = t(title);
    return Object.freeze({
      id: `intro-${index + 1}`,
      name,
      description: t(description),
      rules: MODERN,
      practice: true,
      intro: index + 1,
      noReplay: true,
      sequence: last ? ["I"] : ["T", "I"],
      hud: [],
      setup: state => {
        if (!last) return;
        for (let x = 0; x < WIDTH; x++) if (x < 3 || x > 6) set(state.board, x, HEIGHT - 1, GARBAGE);
      },
      gravityFor: () => 0,
      check: (_state, events) => {
        const event = events.find(event => event.type === eventType);
        if (event) return { result: !last || event.lines > 0 ? "clear" : "fail" };
        if (events.some(event => event.type === "lock")) return { result: "fail" };
        return null;
      },
      hudLines: () => ({ label: t("줄"), value: "0" }),
      hudTime: state => ({ label: t("시간"), frames: state.frame }),
      isRecordable: () => false,
      formatRecord: () => "",
      summary: state => ({ main: name, title: state.over === "clear" ? t("성공!") : t("실패") }),
    });
  })
);
