type Callback<T> = (error: unknown | null, result?: T) => void;

function hasLocalStorage(): boolean {
  try {
    if (typeof window === "undefined") return false;
    if (!window.localStorage) return false;

    const testKey = "__async_storage_test__";
    window.localStorage.setItem(testKey, "1");
    window.localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

const memoryStore = new Map<string, string>();

function getStore() {
  return hasLocalStorage() ? window.localStorage : null;
}

async function getItem(key: string, callback?: Callback<string | null>) {
  try {
    const store = getStore();
    const value = store ? store.getItem(key) : memoryStore.get(key) ?? null;
    callback?.(null, value);
    return value;
  } catch (error) {
    callback?.(error);
    throw error;
  }
}

async function setItem(key: string, value: string, callback?: Callback<void>) {
  try {
    const store = getStore();
    if (store) store.setItem(key, value);
    else memoryStore.set(key, value);
    callback?.(null);
  } catch (error) {
    callback?.(error);
    throw error;
  }
}

async function removeItem(key: string, callback?: Callback<void>) {
  try {
    const store = getStore();
    if (store) store.removeItem(key);
    else memoryStore.delete(key);
    callback?.(null);
  } catch (error) {
    callback?.(error);
    throw error;
  }
}

async function clear(callback?: Callback<void>) {
  try {
    const store = getStore();
    if (store) store.clear();
    else memoryStore.clear();
    callback?.(null);
  } catch (error) {
    callback?.(error);
    throw error;
  }
}

async function getAllKeys(callback?: Callback<string[]>) {
  try {
    const store = getStore();
    const keys = store ? Object.keys(store) : Array.from(memoryStore.keys());
    callback?.(null, keys);
    return keys;
  } catch (error) {
    callback?.(error);
    throw error;
  }
}

async function multiGet(
  keys: string[],
  callback?: Callback<[string, string | null][]>
) {
  try {
    const pairs = await Promise.all(
      keys.map(async (key) => [key, await getItem(key)] as [string, string | null])
    );
    callback?.(null, pairs);
    return pairs;
  } catch (error) {
    callback?.(error);
    throw error;
  }
}

async function multiSet(
  keyValuePairs: [string, string][],
  callback?: Callback<void>
) {
  try {
    await Promise.all(keyValuePairs.map(([k, v]) => setItem(k, v)));
    callback?.(null);
  } catch (error) {
    callback?.(error);
    throw error;
  }
}

async function multiRemove(keys: string[], callback?: Callback<void>) {
  try {
    await Promise.all(keys.map((k) => removeItem(k)));
    callback?.(null);
  } catch (error) {
    callback?.(error);
    throw error;
  }
}

const AsyncStorage = {
  getItem,
  setItem,
  removeItem,
  clear,
  getAllKeys,
  multiGet,
  multiSet,
  multiRemove,
};

export default AsyncStorage;
