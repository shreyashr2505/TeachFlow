import AsyncStorage from '@react-native-async-storage/async-storage';

type CacheEntry<T> = { value: T; updatedAt: number };

const prefix = 'teachflow.mobile.cache';

export const buildCacheKey = (parts: Array<string | undefined | null>) => [prefix, ...parts.filter(Boolean)].join(':');

export const readCache = async <T>(key: string): Promise<CacheEntry<T> | null> => {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as CacheEntry<T>;
  } catch {
    return null;
  }
};

export const writeCache = async <T>(key: string, value: T) => {
  try {
    await AsyncStorage.setItem(key, JSON.stringify({ value, updatedAt: Date.now() } satisfies CacheEntry<T>));
  } catch {
    return;
  }
};
