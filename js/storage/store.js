// localStorage를 감싼 작은 저장소. 사생활 보호 모드·저장소 차단 등으로 접근이 막혀도 앱이 멈추지 않게
// 모든 읽기·쓰기를 try/catch로 감싸고, 실패하면 기본값으로 동작한다. 테스트에서는 가짜 backend를 넣는다.
const PREFIX = "tetrisharp:";

const defaultBackend = () => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

/**
 * @param {{ getItem(k: string): string | null, setItem(k: string, v: string): void } | null} [backend]
 */
export const createStore = (backend = defaultBackend()) => ({
  get(key, fallback) {
    try {
      const raw = backend?.getItem(PREFIX + key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      backend?.setItem(PREFIX + key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },
});

/** 테스트용 메모리 backend */
export const memoryBackend = () => {
  const map = new Map();
  return {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => void map.set(k, String(v)),
    map,
  };
};
