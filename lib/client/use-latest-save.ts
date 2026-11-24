"use client";

import { useCallback, useEffect, useRef } from "react";

type KeyState<V> = { inFlight: boolean; next: { value: V } | null };

export type LatestSaveHandlers<K, V, R> = {
  /**
   * Called after every successful request. `latest` is false when the user
   * has already asked for a newer value, which is about to be sent, so
   * callers should record the confirmed value but not overwrite the screen.
   */
  onSuccess?: (result: R, value: V, info: { key: K; latest: boolean }) => void;
  /**
   * Called when the newest value for a key failed. Older failures that were
   * superseded by a newer click are dropped: the newer value is sent instead.
   */
  onError: (error: unknown, value: V, info: { key: K }) => void;
};

/**
 * "Last click wins" saving, per key. The caller updates the screen on every
 * click and calls save(key, value); requests for one key go out one at a time,
 * and while one is in flight only the newest pending value is kept. Nothing
 * needs to be disabled while saving.
 */
export function useKeyedLatestSave<K, V, R>(
  send: (key: K, value: V) => Promise<R>,
  handlers: LatestSaveHandlers<K, V, R>
) {
  const statesRef = useRef(new Map<K, KeyState<V>>());
  const latestRef = useRef({ send, handlers });

  useEffect(() => {
    latestRef.current = { send, handlers };
  });

  const run = useCallback(async (key: K, firstValue: V) => {
    const states = statesRef.current;
    const state: KeyState<V> = { inFlight: true, next: null };
    states.set(key, state);

    let value = firstValue;

    // Keep sending until no newer value was queued while a request was out.
    for (;;) {
      let outcome: { ok: true; result: R } | { ok: false; error: unknown };

      try {
        outcome = { ok: true, result: await latestRef.current.send(key, value) };
      } catch (error) {
        outcome = { ok: false, error };
      }

      const queued = state.next;
      state.next = null;

      // Settle the key before the handlers run, so isSaving() inside them
      // only reports other keys' work.
      if (!queued) {
        state.inFlight = false;
        states.delete(key);
      }

      if (outcome.ok) {
        latestRef.current.handlers.onSuccess?.(outcome.result, value, { key, latest: !queued });
      } else if (!queued) {
        latestRef.current.handlers.onError(outcome.error, value, { key });
      }

      if (!queued) {
        return;
      }

      value = queued.value;
    }
  }, []);

  const save = useCallback(
    (key: K, value: V) => {
      const state = statesRef.current.get(key);

      if (state?.inFlight) {
        state.next = { value };
        return;
      }

      void run(key, value);
    },
    [run]
  );

  /** True while any key has a request in flight or queued. */
  const isSaving = useCallback((key?: K) => {
    if (key === undefined) {
      return statesRef.current.size > 0;
    }

    return statesRef.current.has(key);
  }, []);

  return { save, isSaving };
}

const SINGLE_KEY = "value";

/** Single-value form of useKeyedLatestSave, for a control that saves one thing. */
export function useLatestSave<V, R>(
  send: (value: V) => Promise<R>,
  handlers: {
    onSuccess?: (result: R, value: V, info: { latest: boolean }) => void;
    onError: (error: unknown, value: V) => void;
  }
) {
  const { save, isSaving } = useKeyedLatestSave<typeof SINGLE_KEY, V, R>((_key, value) => send(value), {
    onSuccess: handlers.onSuccess
      ? (result, value, { latest }) => handlers.onSuccess?.(result, value, { latest })
      : undefined,
    onError: (error, value) => handlers.onError(error, value),
  });

  return {
    save: useCallback((value: V) => save(SINGLE_KEY, value), [save]),
    isSaving: useCallback(() => isSaving(SINGLE_KEY), [isSaving]),
  };
}
