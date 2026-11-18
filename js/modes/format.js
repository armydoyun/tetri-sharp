// 화면 표시용 형식. 순수 함수라 모드·테스트에서 같이 쓴다.

/** 프레임 → "m:ss.cc" */
export const formatTime = frames => {
  const total = Math.max(0, frames) / 60;
  const m = Math.floor(total / 60);
  const s = total - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, "0")}`;
};

/** 점수 → "12,345" */
export const formatScore = n => Math.floor(n).toLocaleString("en-US");
