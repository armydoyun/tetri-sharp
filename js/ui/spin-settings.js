import { PIECE_TYPES } from "../core/pieces.js";
import { t } from "../i18n/index.js";
import { ALL_SPINS, spinBit, spinMask, T_SPIN } from "../rules/spins.js";
import { toggle } from "./components.js";
import { el, fieldRow } from "./dom.js";
import { dropdown } from "./select.js";

const presets = [
  { value: 0, label: t("스핀 없음") },
  { value: T_SPIN, label: t("T스핀만") },
  { value: ALL_SPINS, label: t("올스핀") },
];

export const spinChoiceLabel = mask =>
  presets.find(option => option.value === mask)?.label ??
  t("직접 선택 · {pieces}", { pieces: PIECE_TYPES.filter(piece => mask & spinBit(piece)).join(", ") });

/** @param {{ prefix: string, rules: any, expanded?: boolean, onChange: (mask: number, focusId: string) => void }} options */
export const spinControls = ({ prefix, rules, expanded = false, onChange }) => {
  const mask = spinMask(rules);
  const id = `${prefix}-spin`;
  const label = t("스핀 판정");
  const options = presets.some(option => option.value === mask)
    ? presets
    : [...presets, { value: mask, label: spinChoiceLabel(mask) }];
  const preset = fieldRow({
    id,
    label,
    control: dropdown({ id, label, options, value: mask, onChange: value => onChange(value, id) }),
  });
  const details = el(
    "details",
    { class: "spin-settings", id: `${id}-details`, open: expanded },
    el("summary", { text: t("미노별 스핀 설정") }),
    el(
      "div",
      { class: "spin-settings-pieces" },
      ...PIECE_TYPES.map(piece => {
        const key = `${id}-${piece}`;
        const bit = spinBit(piece);
        const input = toggle({
          id: key,
          checked: Boolean(mask & bit),
          onChange: enabled => onChange(enabled ? mask | bit : mask & ~bit, key),
        });
        input.setAttribute("aria-label", t("{piece} 스핀", { piece }));
        return el("div", { class: "spin-settings-piece" }, el("label", { htmlFor: key, text: piece }), input);
      })
    ),
    el("p", {
      class: "field-help",
      text: t(
        "T는 세 모서리로 판정해요. 다른 미노는 마지막 회전 뒤 상하좌우가 막혀야 하고, O는 대각선으로 포켓에 들어가야 해요."
      ),
    })
  );
  return { preset, details };
};
