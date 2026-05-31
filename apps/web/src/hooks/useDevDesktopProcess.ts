import type { DesktopDevDesktopState } from "@t3tools/contracts";
import { useCallback, useEffect, useRef, useState } from "react";

const DEV_DESKTOP_POLL_INTERVAL_MS = 2_000;

export interface UseDevDesktopProcessResult {
  readonly state: DesktopDevDesktopState | null;
  readonly hasApi: boolean;
  readonly isBusy: boolean;
  readonly refresh: () => Promise<DesktopDevDesktopState | null>;
  readonly toggle: (cwd?: string) => Promise<void>;
}

function readDesktopBridge() {
  if (typeof window === "undefined") {
    return undefined;
  }
  return window.desktopBridge;
}

export function useDevDesktopProcess(): UseDevDesktopProcessResult {
  const bridge = readDesktopBridge();
  const isDevShell = bridge?.getAppBranding?.()?.stageLabel === "Dev";
  const hasApi = Boolean(
    isDevShell && bridge?.getDevDesktopState && bridge?.startDevDesktop && bridge?.stopDevDesktop,
  );
  const [state, setState] = useState<DesktopDevDesktopState | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const latestRefreshIdRef = useRef(0);

  const refresh = useCallback(async () => {
    const refreshId = latestRefreshIdRef.current + 1;
    latestRefreshIdRef.current = refreshId;
    if (!hasApi || !bridge?.getDevDesktopState) {
      if (refreshId === latestRefreshIdRef.current) {
        setState(null);
      }
      return null;
    }

    try {
      const next = await bridge.getDevDesktopState();
      if (refreshId === latestRefreshIdRef.current) {
        setState(next);
        return next;
      }
      return null;
    } catch {
      if (refreshId === latestRefreshIdRef.current) {
        setState(null);
      }
      return null;
    }
  }, [bridge, hasApi]);

  useEffect(() => {
    if (!hasApi || !bridge) {
      latestRefreshIdRef.current += 1;
      setState(null);
      return;
    }

    let cancelled = false;
    const unsubscribe = bridge.onDevDesktopStateChange?.((next) => {
      if (!cancelled) {
        setState(next);
      }
    });

    void refresh();
    const interval = window.setInterval(() => {
      void refresh();
    }, DEV_DESKTOP_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      latestRefreshIdRef.current += 1;
      window.clearInterval(interval);
      unsubscribe?.();
    };
  }, [bridge, hasApi, refresh]);

  const toggle = useCallback(
    async (cwd?: string) => {
      if (
        !hasApi ||
        !bridge?.getDevDesktopState ||
        !bridge.startDevDesktop ||
        !bridge.stopDevDesktop
      ) {
        return;
      }

      setIsBusy(true);
      try {
        const current = await bridge.getDevDesktopState();
        const next = current.running
          ? await bridge.stopDevDesktop()
          : await bridge.startDevDesktop(cwd ? { cwd } : undefined);
        setState(next);
      } finally {
        setIsBusy(false);
      }
    },
    [bridge, hasApi],
  );

  return {
    state,
    hasApi,
    isBusy,
    refresh,
    toggle,
  };
}
