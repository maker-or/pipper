"use client";
import { useEffect, useRef } from "react";
import { type ServerProvider } from "@t3tools/contracts";

import { formatProviderDriverKindLabel } from "../../providerModels";
import { stackedThreadToast, toastManager, type ThreadToastData } from "../ui/toast";

type ToastId = ReturnType<typeof toastManager.add>;

type ActiveProviderToastKey = string;

export type ActiveProviderToastDescriptor = {
  readonly type: "error" | "warning";
  readonly title: string;
  readonly description: string;
};

export function resolveProviderLabel(provider: ServerProvider): string {
  return provider.displayName?.trim() || formatProviderDriverKindLabel(provider.driver);
}

export function buildProviderStatusToastCopy(
  provider: ServerProvider,
): ActiveProviderToastDescriptor | null {
  if (provider.status === "ready" || provider.status === "disabled") {
    return null;
  }
  const providerLabel = resolveProviderLabel(provider);
  const defaultMessage =
    provider.status === "error"
      ? `${providerLabel} provider is unavailable.`
      : `${providerLabel} provider has limited availability.`;
  return {
    type: provider.status === "error" ? "error" : "warning",
    title: `${providerLabel} provider status`,
    description: provider.message ?? defaultMessage,
  };
}

function activeProviderToastKey(provider: ServerProvider | null): ActiveProviderToastKey | null {
  if (!provider) return null;
  return `${provider.instanceId}::${provider.status}::${provider.message ?? ""}`;
}

function buildProviderStatusToastPayload(descriptor: ActiveProviderToastDescriptor) {
  return stackedThreadToast({
    type: descriptor.type,
    title: descriptor.title,
    description: descriptor.description,
    data: {
      tooltipStyle: false,
    } satisfies Partial<ThreadToastData>,
  });
}

/**
 * Surface the active provider's health status as a sticky toast notification.
 *
 * The previous inline banner was removed in favor of a toast so the same
 * information (provider label + status message) reaches the user without
 * taking up chat real estate. A toast is shown/updated whenever the status
 * transitions to `error` or `warning` and dismissed the moment the active
 * provider becomes healthy (or the route unmounts).
 */
export function useProviderStatusToast(provider: ServerProvider | null): void {
  const toastIdRef = useRef<ToastId | null>(null);
  const lastKeyRef = useRef<ActiveProviderToastKey | null>(null);

  useEffect(() => {
    const currentKey = activeProviderToastKey(provider);
    const descriptor = provider ? buildProviderStatusToastCopy(provider) : null;

    if (!descriptor) {
      if (toastIdRef.current) {
        toastManager.close(toastIdRef.current);
        toastIdRef.current = null;
      }
      lastKeyRef.current = currentKey;
      return;
    }

    if (lastKeyRef.current === currentKey && toastIdRef.current) {
      return;
    }

    const payload = buildProviderStatusToastPayload(descriptor);
    if (toastIdRef.current) {
      toastManager.update(toastIdRef.current, payload);
    } else {
      toastIdRef.current = toastManager.add(payload);
    }
    lastKeyRef.current = currentKey;
  }, [provider]);

  useEffect(() => {
    return () => {
      if (toastIdRef.current) {
        toastManager.close(toastIdRef.current);
        toastIdRef.current = null;
      }
    };
  }, []);
}
