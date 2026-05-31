import { useCallback, useEffect, useRef } from "react";

import { useEvolutionStore } from "../evolutionStore";

const UPDATE_REGISTRY_BASE_URL = "https://pipper.ai/updates";
const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface LatestResponse {
  version: string;
}

/**
 * Hook that manages evolution update checking.
 *
 * - Checks for updates on mount (startup).
 * - Re-checks every 24 hours.
 * - Provides a manual `checkNow()` trigger.
 */
export function useEvolutionUpdateCheck(opts?: {
  readonly localVersion: string | null;
  readonly enabled?: boolean;
}) {
  const localVersion = opts?.localVersion ?? null;
  const enabled = opts?.enabled ?? true;
  const isCheckingUpdate = useEvolutionStore((s) => s.isCheckingUpdate);
  const setIsCheckingUpdate = useEvolutionStore((s) => s.setIsCheckingUpdate);
  const setUpdateCheckResult = useEvolutionStore((s) => s.setUpdateCheckResult);
  const updateCheckResult = useEvolutionStore((s) => s.updateCheckResult);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkForUpdate = useCallback(async () => {
    if (isCheckingUpdate) return;
    setIsCheckingUpdate(true);

    try {
      const response = await fetch(`${UPDATE_REGISTRY_BASE_URL}/latest.json`);
      if (!response.ok) {
        setUpdateCheckResult({
          updateAvailable: false,
          localVersion,
          latestVersion: null,
          manifestUrl: null,
        });
        return;
      }

      const data = (await response.json()) as LatestResponse;
      const latestVersion = data.version;
      const updateAvailable =
        localVersion !== null && latestVersion !== null && localVersion !== latestVersion;

      setUpdateCheckResult({
        updateAvailable,
        localVersion,
        latestVersion,
        manifestUrl: updateAvailable
          ? `${UPDATE_REGISTRY_BASE_URL}/${latestVersion}/manifest.json`
          : null,
      });
    } catch {
      setUpdateCheckResult({
        updateAvailable: false,
        localVersion,
        latestVersion: null,
        manifestUrl: null,
      });
    } finally {
      setIsCheckingUpdate(false);
    }
  }, [isCheckingUpdate, localVersion, setIsCheckingUpdate, setUpdateCheckResult]);

  // Check on startup and every 24 hours
  useEffect(() => {
    if (!enabled || !localVersion) return;

    void checkForUpdate();

    intervalRef.current = setInterval(() => {
      void checkForUpdate();
    }, UPDATE_CHECK_INTERVAL_MS);

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, localVersion]);

  return {
    isCheckingUpdate,
    updateCheckResult,
    checkNow: checkForUpdate,
  };
}
