// 값을 JSON 파일로 내려받게 한다(리플레이 파일, 백업 파일).

/** @param {unknown} value @param {string} filename */
export const downloadJson = (value, filename) => {
  const blob = new Blob([JSON.stringify(value)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
