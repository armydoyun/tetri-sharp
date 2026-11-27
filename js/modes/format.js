// 화면 표시용 형식. 순수 함수라 모드·테스트에서 같이 쓴다.

/** 프레임 → "m:ss.cc" */
export const formatTime = frames => {
  const total = Math.max(0, frames) / 60;
  const m = Math.floor(total / 60);
  const s = total - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, "0")}`;
};

/** 날짜(ISO) → "2026.11.25"(이 기기 시간대). 읽을 수 없으면 "—" */
export const formatDate = iso => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
};

/** 점수 → "12,345" */
export const formatScore = n => Math.floor(n).toLocaleString("en-US");

export const gravityLabel = (gravity, t) =>
  gravity === 0
    ? t("0G (자동 낙하 없음)")
    : gravity >= 20
      ? t("20G (즉시 바닥)")
      : gravity === 1
        ? t("1G (60칸/초)")
        : t("{n}칸/초", { n: Math.round(gravity * 6000) / 100 });
