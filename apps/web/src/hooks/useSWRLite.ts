import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Listener<T> = (value: T) => void;

const cache = new Map<string, unknown>();
const listeners = new Map<string, Set<Listener<unknown>>>();

function emit<T>(key: string, value: T) {
  const subs = listeners.get(key);
  if (!subs) return;
  subs.forEach((fn) => {
    try {
      (fn as Listener<T>)(value);
    } catch (err) {
      console.error("useSWRLite listener failed", err);
    }
  });
}

export type SWRLiteResponse<T> = {
  data: T | undefined;
  error: Error | null;
  isLoading: boolean;
  mutate: (value?: T | Promise<T>) => Promise<T | undefined>;
  revalidate: () => Promise<T | undefined>;
};

/**
 * Minimal SWR-like hook for offline environments.
 * Provides shared cache, revalidation and imperative mutate.
 */
export function useSWRLite<T>(
  key: string | null,
  fetcher: (() => Promise<T>) | null,
  options: { revalidateOnMount?: boolean } = {},
): SWRLiteResponse<T> {
  const [data, setData] = useState<T | undefined>(() =>
    key && cache.has(key) ? (cache.get(key) as T) : undefined,
  );
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(Boolean(key && !cache.has(key)));
  const fetcherRef = useRef(fetcher);
  const keyRef = useRef(key);
  fetcherRef.current = fetcher;
  keyRef.current = key;

  const subscribe = useCallback(
    (targetKey: string, handler: Listener<T>) => {
      let subs = listeners.get(targetKey);
      if (!subs) {
        subs = new Set();
        listeners.set(targetKey, subs);
      }
      subs.add(handler as Listener<unknown>);
      return () => {
        subs?.delete(handler as Listener<unknown>);
        if (subs && subs.size === 0) listeners.delete(targetKey);
      };
    },
    [],
  );

  const runFetch = useCallback(async (): Promise<T | undefined> => {
    const currentKey = keyRef.current;
    const fn = fetcherRef.current;
    if (!currentKey || !fn) return undefined;
    setIsLoading(true);
    setError(null);
    try {
      const result = await fn();
      cache.set(currentKey, result);
      setData(result);
      emit(currentKey, result);
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      return undefined;
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!key) {
      setData(undefined);
      setError(null);
      setIsLoading(false);
      return;
    }

    const unsubscribe = subscribe(key, (value) => {
      setData(value);
    });

    const hasCache = cache.has(key);
    if (hasCache) {
      setData(cache.get(key) as T);
      setIsLoading(false);
      if (options.revalidateOnMount) {
        void runFetch();
      }
    } else if (fetcherRef.current) {
      void runFetch();
    }

    return () => {
      unsubscribe();
    };
  }, [key, options.revalidateOnMount, runFetch, subscribe]);

  const mutate = useCallback(async (value?: T | Promise<T>) => {
    const currentKey = keyRef.current;
    if (!currentKey) return undefined;
    if (value === undefined) {
      const fresh = await runFetch();
      return fresh;
    }
    const resolved = value instanceof Promise ? await value : value;
    cache.set(currentKey, resolved);
    setData(resolved);
    emit(currentKey, resolved);
    return resolved;
  }, [runFetch]);

  return useMemo(
    () => ({
      data,
      error,
      isLoading,
      mutate,
      revalidate: runFetch,
    }),
    [data, error, isLoading, mutate, runFetch],
  );
}

export function clearSWRLiteCache(key?: string) {
  if (key) {
    cache.delete(key);
    listeners.delete(key);
    return;
  }
  cache.clear();
  listeners.clear();
}
