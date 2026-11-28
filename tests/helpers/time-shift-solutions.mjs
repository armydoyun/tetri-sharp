// [스폰에서 옮길 칸 수, 180도 회전 여부]. 생략한 기록 수는 제자리에서 하드 드롭한다.
export const timeShiftSolutions = [
  { record: [[-4]], play: [[-2]] },
  { record: [[0]], play: [[-3]] },
  { record: [[-3]], play: [[-4]] },
  { record: [[3]], play: [[3]] },
  {
    record: [[1], [-2, true], [3, true], [-4], [0, true], [3, true]],
    play: [[-3], [-3], [4], [0], [-1], [4]],
  },
];

export const timeShiftInputs = ([shift = 0, rotate = false] = []) => [
  ...Array(Math.abs(shift)).fill(shift < 0 ? "left" : "right"),
  ...(rotate ? ["rotate"] : []),
  "drop",
];
