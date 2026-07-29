import { useEffect, useMemo, useRef, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { buildCacheKey, readCache, writeCache } from '../services/cache';

type LiveCollectionState<T> = {
  data: T[];
  isLoading: boolean;
  isOffline: boolean;
  refreshedAt?: number;
};

export const useLiveCollection = <T,>(
  keyParts: Array<string | undefined | null>,
  subscribe: (next: (value: T[]) => void, onError?: (error: Error) => void) => () => void
) => {
  const keySignature = keyParts.map((part) => part ?? '').join('|');
  const cacheKey = useMemo(() => buildCacheKey(keyParts), [keySignature]);
  const subscribeRef = useRef(subscribe);
  const [state, setState] = useState<LiveCollectionState<T>>({ data: [], isLoading: true, isOffline: false });

  useEffect(() => {
    subscribeRef.current = subscribe;
  }, [subscribe]);

  useEffect(() => {
    let mounted = true;
    let unsubscribe: (() => void) | undefined;

    const load = async () => {
      if (keyParts.some((part) => !part)) {
        if (!mounted) return;
        setState({ data: [], isLoading: false, isOffline: false });
        return;
      }

      const net = await NetInfo.fetch();
      if (!mounted) return;

      const offline = !net.isConnected && !net.isInternetReachable;
      if (offline) {
        const cached = await readCache<T[]>(cacheKey);
        if (!mounted) return;
        setState({
          data: cached?.value ?? [],
          isLoading: false,
          isOffline: true,
          refreshedAt: cached?.updatedAt,
        });
        return;
      }

      unsubscribe = subscribeRef.current(
        async (next) => {
          if (!mounted) return;
          setState({ data: next, isLoading: false, isOffline: false, refreshedAt: Date.now() });
          await writeCache(cacheKey, next);
        },
        async () => {
          const cached = await readCache<T[]>(cacheKey);
          if (!mounted) return;
          setState({
            data: cached?.value ?? [],
            isLoading: false,
            isOffline: true,
            refreshedAt: cached?.updatedAt,
          });
        }
      );
    };

    void load();
    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, [cacheKey, keySignature]);

  return state;
};
