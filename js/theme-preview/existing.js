import { ALL_THEME_IDS, THEMES } from "../render/themes.js";

/** @type {Record<string, import("../render/clear-sweep.js").ClearSweep>} */
const sweeps = {
  modern: {
    shape: "sweep",
    from: "center",
    pace: "easeOut",
    travel: 0.69,
    ink: "#c3d77a",
    edge: "#e1efae",
    bands: [
      [0, 0.14, 0.86],
      [0, 0.32, 0.22],
    ],
  },
  retro: {
    shape: "slide",
    slide: -1,
    pace: "even",
    travel: 0.68,
    ink: "#74695a",
    edge: "#514438",
    bands: [
      [0, 0.08, 0.86],
      [0.08, 0.04, 0.4],
    ],
  },
  minimal: {
    shape: "split",
    pace: "even",
    travel: 0.74,
    ink: "#a8c6ef",
    edge: "#e2efff",
    bands: [
      [-0.19, 0.065, 0.86],
      [0.19, 0.065, 0.86],
    ],
  },
  graphite: {
    shape: "fade",
    pace: "easeOut",
    travel: 0.57,
    ink: "#adb1b6",
    edge: "#d6d9dc",
    bands: [[0, 0.105, 0.73]],
  },
  frame: {
    shape: "sweep",
    from: "right",
    pace: "even",
    travel: 0.76,
    ink: "#a8bac4",
    edge: "#e0ebf0",
    bands: [
      [0, 0.077, 0.8],
      [-0.16, 0.045, 0.5],
    ],
  },
  stone: {
    shape: "chip",
    groups: 10,
    beat: "scatter",
    pace: "easeIn",
    travel: 0.62,
    ink: "#9a6551",
    edge: "#814a34",
    bands: [
      [0, 0.16, 0.77],
      [-0.14, 0.06, 0.34],
      [0.12, 0.078, 0.45],
    ],
  },
  midnight: {
    shape: "shutter",
    groups: 2,
    pace: "easeIn",
    travel: 0.76,
    ink: "#8fb1da",
    edge: "#cbd9fa",
    bands: [
      [0, 0.083, 0.86],
      [0, 0.31, 0.2],
    ],
  },
  forest: {
    shape: "fade",
    groups: 5,
    beat: "scatter",
    settle: 0.09,
    pace: "easeOut",
    travel: 0.66,
    ink: "#93b58d",
    edge: "#bed3a9",
    bands: [
      [0, 0.12, 0.72],
      [-0.13, 0.085, 0.32],
      [0.16, 0.06, 0.36],
    ],
  },
  white: {
    shape: "sink",
    pace: "easeIn",
    travel: 0.72,
    ink: "#6a7679",
    edge: "#46595c",
    bands: [[0, 0.09, 0.84]],
    settle: 0.21,
  },
  sharp: {
    shape: "sweep",
    from: "ends",
    pace: "easeOut",
    travel: 0.74,
    ink: "#bbd581",
    edge: "#e0f1a9",
    bands: [
      [-0.15, 0.065, 0.83],
      [0.15, 0.065, 0.83],
    ],
    crossbars: true,
  },
};

export const EXISTING_PREVIEWS = Object.freeze(
  Object.fromEntries(
    ALL_THEME_IDS.map(id => {
      const theme = THEMES[id];
      return [
        id,
        {
          reference: id,
          theme: { ...theme, motion: { ...theme.motion, clearMs: theme.motion.clearMs + 100, clearSweep: sweeps[id] } },
        },
      ];
    })
  )
);
