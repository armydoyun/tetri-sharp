import { t } from "../i18n/index.js";
import { makeTheme, THEMES } from "../render/themes.js";

export const CANDIDATES = Object.freeze({
  porcelain: {
    reference: "white",
    sound: t("마른 도자기 타격음"),
    theme: makeTheme({
      name: t("포슬린"),
      description: t("회청색 바탕과 안쪽 선이 찍힌 도자기 타일"),
      palette: ["#296e75", "#3e518e", "#a95538", "#8b701b", "#4d713f", "#795386", "#9b3d53", "#858b8c"],
      board: { bg: "#dce8e9", grid: "#b4c3c5", edge: "#a3b6b9", ink: "#435d64" },
      gridStyle: "dots",
      finish: "inset",
      gap: 0.06,
      radius: 0.11,
      motion: { ...THEMES.modern.motion, clear: "rails", clearMs: 174, landMs: 118, rebound: 0, trailCells: 1.4 },
    }),
  },
  relay: {
    reference: "frame",
    sound: t("스위치 클릭과 짧은 전자음"),
    theme: makeTheme({
      name: t("릴레이"),
      description: t("암갈색 패널과 색 테두리가 있는 각진 블록"),
      palette: ["#6fb5b9", "#859dc7", "#cb916d", "#c7b66b", "#93b07b", "#b098be", "#c7808c", "#807068"],
      board: { bg: "#2a211d", grid: "#493a31", edge: "#594638", ink: "#e1bf99" },
      gridStyle: "dots",
      finish: "frame",
      gap: 0.065,
      radius: 0.035,
      motion: { ...THEMES.modern.motion, clear: "pop", clearMs: 205, accent: "chip", landMs: 140, trailCells: 1.8 },
    }),
  },
  tide: {
    reference: "midnight",
    sound: t("작은 기포와 공기음"),
    theme: makeTheme({
      name: t("타이드"),
      description: t("격자 없는 잿빛 청록 보드와 얇은 색 테두리"),
      palette: ["#7ccbd0", "#9aade2", "#e3a485", "#dfca84", "#a6c194", "#c3a2d5", "#e491a3", "#64888a"],
      board: { bg: "#22383c", grid: "#304a4e", edge: "#507077", ink: "#b6dbd9" },
      gridStyle: "none",
      finish: "frame",
      gap: 0.05,
      radius: 0.16,
      motion: { ...THEMES.modern.motion, clear: "spread", clearMs: 226, landMs: 158, depth: 0.1, trailCells: 1.7 },
    }),
  },
  velvet: {
    reference: "graphite",
    sound: t("천을 스치는 소리와 짧은 현음"),
    theme: makeTheme({
      name: t("벨벳"),
      description: t("잿빛 자두색 보드와 안쪽 윤곽이 있는 블록"),
      palette: ["#8ec3be", "#94a7d1", "#db9f81", "#d2be79", "#a5ba88", "#c7a5cf", "#d6849e", "#867989"],
      board: { bg: "#302633", grid: "#483844", edge: "#604a61", ink: "#e4cadd" },
      gridStyle: "none",
      finish: "inset",
      gap: 0.07,
      radius: 0.2,
      motion: { ...THEMES.modern.motion, clear: "fade", clearMs: 195, landMs: 130, rebound: 0, trailCells: 1 },
    }),
  },
});
