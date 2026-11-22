// localStorage 접근이 막혀도 앱은 기본값으로 동작한다.
const PREFIX = "tetrisharp:";
const SNAPSHOT = `${PREFIX}restore`;
const revisionKey = (revision, key) => `${SNAPSHOT}:${revision}:${key}`;

const defaultBackend = () => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

/**
 * 백업은 한 키에 기록한 뒤에만 보이게 한다. 이후 개별 변경은 같은 복원 세대의 별도 키에 쓴다.
 * @param {{ getItem(k: string): string | null, setItem(k: string, v: string): void, removeItem?(k: string): void } | null} [backend]
 */
export const createStore = (backend = defaultBackend()) => {
  let cachedRaw = null;
  let cachedSnapshot = null;
  const snapshot = () => {
    const raw = backend?.getItem(SNAPSHOT) ?? null;
    if (raw !== cachedRaw) {
      const next = raw === null ? null : JSON.parse(raw);
      cachedSnapshot =
        typeof next?.revision === "string" && next.values && typeof next.values === "object" ? next : null;
      cachedRaw = raw;
    }
    return cachedSnapshot;
  };

  const read = (saved, key, fallback) => {
    if (saved && Object.hasOwn(saved.values, key)) {
      const raw = backend.getItem(revisionKey(saved.revision, key));
      if (raw !== null) return JSON.parse(raw);
      // 호출자가 값을 바꿔도 다른 읽기에는 저장한 뒤에만 반영된다.
      return structuredClone(saved.values[key]);
    }
    const raw = backend?.getItem(PREFIX + key);
    return raw == null ? fallback : JSON.parse(raw);
  };

  return {
    get(key, fallback) {
      try {
        return read(snapshot(), key, fallback);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      if (!backend) return false;
      try {
        const saved = snapshot();
        const name = saved && Object.hasOwn(saved.values, key) ? revisionKey(saved.revision, key) : PREFIX + key;
        backend.setItem(name, JSON.stringify(value));
        return true;
      } catch {
        return false;
      }
    },
    /** @param {Record<string, any>} values */
    setMany(values) {
      if (!backend) return false;
      let previous;
      let keys;
      try {
        previous = snapshot();
        keys = [...new Set([...Object.keys(previous?.values ?? {}), ...Object.keys(values)])];
        const next = Object.fromEntries(
          keys.map(key => [key, Object.hasOwn(values, key) ? values[key] : read(previous, key, null)])
        );
        const revision = Array.from(globalThis.crypto.getRandomValues(new Uint32Array(4)), word =>
          word.toString(16).padStart(8, "0")
        ).join("");
        // 할당량 초과 등으로 실패하면 이전 세대와 모든 개별 키가 그대로 유효하다.
        backend.setItem(SNAPSHOT, JSON.stringify({ revision, values: next }));
      } catch {
        return false;
      }

      // 공개 후에만 이전 값을 정리한다. 정리 실패는 이미 완료된 복원에 영향이 없다.
      for (const key of keys) {
        try {
          backend.removeItem?.(PREFIX + key);
          if (previous && Object.hasOwn(previous.values, key))
            backend.removeItem?.(revisionKey(previous.revision, key));
        } catch {
          /* 저장소가 정리를 허용하지 않으면 이전 값은 읽지 않고 그대로 둔다. */
        }
      }
      return true;
    },
  };
};

/** 테스트용 메모리 backend */
export const memoryBackend = () => {
  const map = new Map();
  return {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: k => void map.delete(k),
    map,
  };
};
