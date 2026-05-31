import { useEffect, useSyncExternalStore } from "react";
import * as Schema from "effect/Schema";

import type { ScopedThreadRef, UpdateManifest } from "@t3tools/contracts";
import {
  UpdateManifestSchema,
  UpdateRegistryLatestSchema,
} from "@t3tools/contracts";

import { APP_VERSION } from "../branding";

const DEFAULT_UPDATE_REGISTRY_BASE_URL = "https://pipper.dev";
const UPDATE_POLL_INTERVAL_MS = 24 * 60 * 60 * 1000;

type AppUpdateStatus =
  | "checking"
  | "up-to-date"
  | "available"
  | "downloading-manifest"
  | "updating"
  | "ready-to-port"
  | "porting"
  | "error";

export interface AppUpdateState {
  readonly currentVersion: string;
  readonly latestVersion: string | null;
  readonly latestManifestUrl: string | null;
  readonly latestManifest: UpdateManifest | null;
  readonly checkedAt: string | null;
  readonly status: AppUpdateStatus;
  readonly message: string | null;
  readonly workflowThreadRef: ScopedThreadRef | null;
}

const listeners = new Set<() => void>();
let appUpdateState: AppUpdateState | null = null;
let pollingStarted = false;
let inFlightCheck: Promise<AppUpdateState | null> | null = null;
let inFlightUpdateWorkflow: Promise<AppUpdateState | null> | null = null;

function emitChange() {
  for (const listener of listeners) {
    listener();
  }
}

function setAppUpdateState(nextState: AppUpdateState | null) {
  appUpdateState = nextState;
  emitChange();
}

function normalizeVersion(version: string | null | undefined): string | null {
  const trimmed = version?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function resolveUpdateRegistryBaseUrl(): string | null {
  const configured =
    import.meta.env.VITE_UPDATE_REGISTRY_URL?.trim() || "https://pipper.dev";
  if (configured) {
    return configured;
  }
  if (import.meta.env.MODE === "test") {
    return null;
  }
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") {
      return null;
    }
  }
  return DEFAULT_UPDATE_REGISTRY_BASE_URL;
}

function resolveRegistryUrl(pathname: string): string | null {
  const baseUrl = resolveUpdateRegistryBaseUrl();
  if (!baseUrl) {
    return null;
  }
  return new URL(pathname, baseUrl).toString();
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}.`);
  }
  return response.json() as Promise<unknown>;
}

function buildUpdateState(
  next: Partial<AppUpdateState> & Pick<AppUpdateState, "status">,
): AppUpdateState {
  return {
    currentVersion: APP_VERSION,
    latestVersion: null,
    latestManifestUrl: null,
    latestManifest: null,
    checkedAt: new Date().toISOString(),
    message: null,
    workflowThreadRef: null,
    ...next,
  };
}

async function readLatestRegistryEntry(): Promise<{ version: string }> {
  const url = resolveRegistryUrl("/latest.json");
  if (!url) {
    throw new Error("Update registry is disabled.");
  }
  const latestJson = await fetchJson(url);
  return Schema.decodeUnknownSync(UpdateRegistryLatestSchema)(latestJson);
}

async function readUpdateManifest(version: string): Promise<UpdateManifest> {
  const url = resolveRegistryUrl(
    `/updates/${encodeURIComponent(version)}.json`,
  );
  if (!url) {
    throw new Error("Update registry is disabled.");
  }
  const manifestJson = await fetchJson(url);
  return Schema.decodeUnknownSync(UpdateManifestSchema)(manifestJson);
}

async function runUpdateCheck(): Promise<AppUpdateState | null> {
  if (inFlightCheck) {
    return inFlightCheck;
  }

  inFlightCheck = (async () => {
    const registryUrl = resolveUpdateRegistryBaseUrl();
    if (!registryUrl) {
      setAppUpdateState(null);
      return null;
    }

    setAppUpdateState(
      buildUpdateState({
        status: "checking",
        message: null,
      }),
    );

    try {
      const latest = await readLatestRegistryEntry();
      const currentVersion = normalizeVersion(APP_VERSION);
      const latestVersion = normalizeVersion(latest.version);

      if (!currentVersion || !latestVersion) {
        throw new Error("Update registry returned an invalid version.");
      }

      const updateAvailable = currentVersion !== latestVersion;
      const nextState = buildUpdateState({
        latestVersion,
        latestManifestUrl: updateAvailable
          ? resolveRegistryUrl(`/updates/${latestVersion}.json`)
          : null,
        status: updateAvailable ? "available" : "up-to-date",
      });
      setAppUpdateState(nextState);
      return nextState;
    } catch (error) {
      const nextState = buildUpdateState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Could not check for updates.",
      });
      setAppUpdateState(nextState);
      return nextState;
    } finally {
      inFlightCheck = null;
    }
  })();

  return inFlightCheck;
}

async function runUpdateWorkflow(): Promise<AppUpdateState | null> {
  if (inFlightUpdateWorkflow) {
    return inFlightUpdateWorkflow;
  }

  inFlightUpdateWorkflow = (async () => {
    const currentState = appUpdateState;
    const latestVersion = currentState?.latestVersion;

    if (
      !currentState ||
      currentState.status !== "available" ||
      !latestVersion
    ) {
      return currentState;
    }

    setAppUpdateState({
      ...currentState,
      status: "downloading-manifest",
      message: null,
    });

    try {
      const manifest = await readUpdateManifest(latestVersion);
      const nextState = buildUpdateState({
        latestVersion,
        latestManifestUrl: currentState.latestManifestUrl,
        latestManifest: manifest,
        status: "updating",
        message: "Update workflow started in the background.",
        workflowThreadRef: currentState.workflowThreadRef,
      });
      setAppUpdateState(nextState);
      return nextState;
    } catch (error) {
      const nextState = buildUpdateState({
        latestVersion,
        latestManifestUrl: currentState.latestManifestUrl,
        status: "available",
        message:
          error instanceof Error
            ? error.message
            : "Could not download the update manifest.",
      });
      setAppUpdateState(nextState);
      return nextState;
    } finally {
      inFlightUpdateWorkflow = null;
    }
  })();

  return inFlightUpdateWorkflow;
}

function startPolling() {
  if (pollingStarted) {
    return;
  }
  pollingStarted = true;
  void runUpdateCheck();
  const registryUrl = resolveUpdateRegistryBaseUrl();
  if (!registryUrl) {
    return;
  }
  setInterval(() => {
    void runUpdateCheck();
  }, UPDATE_POLL_INTERVAL_MS);
}

export function hasAppUpdateRegistry(): boolean {
  return resolveUpdateRegistryBaseUrl() !== null;
}

export function useAppUpdateBootstrap() {
  useEffect(() => {
    startPolling();
    return () => {
      // Keep the singleton poller alive for the lifetime of the app shell.
    };
  }, []);
}

export function useAppUpdateState(): AppUpdateState | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => appUpdateState,
    () => appUpdateState,
  );
}

export async function checkForAppUpdates(): Promise<AppUpdateState | null> {
  return runUpdateCheck();
}

export async function startAppUpdateWorkflow(): Promise<AppUpdateState | null> {
  return runUpdateWorkflow();
}

export function setAppUpdateWorkflowThreadRef(
  threadRef: ScopedThreadRef | null,
): void {
  const currentState = appUpdateState;
  if (!currentState) {
    return;
  }
  setAppUpdateState({
    ...currentState,
    workflowThreadRef: threadRef,
  });
}

export function markAppUpdateReadyToPort(): void {
  const currentState = appUpdateState;
  if (!currentState || currentState.status !== "updating") {
    return;
  }
  setAppUpdateState({
    ...currentState,
    status: "ready-to-port",
    message: "Update agent finished. Port the build to create the installer.",
  });
}

export function markAppUpdatePorting(): void {
  const currentState = appUpdateState;
  if (!currentState || currentState.status !== "ready-to-port") {
    return;
  }
  setAppUpdateState({
    ...currentState,
    status: "porting",
    message: "Building the macOS installer.",
  });
}

export function markAppUpdatePorted(): void {
  const currentState = appUpdateState;
  if (!currentState || currentState.status !== "porting") {
    return;
  }
  setAppUpdateState({
    ...currentState,
    status: "up-to-date",
    latestVersion: currentState.latestVersion,
    message: "Installer opened.",
    workflowThreadRef: null,
  });
}

export function shouldShowUpdateAvailableState(
  state: AppUpdateState | null,
): boolean {
  return (
    state?.status === "available" ||
    state?.status === "downloading-manifest" ||
    state?.status === "updating" ||
    state?.status === "ready-to-port" ||
    state?.status === "porting"
  );
}

export function resolveCheckForUpdatesButtonLabel(
  state: AppUpdateState | null,
): string {
  if (!state) {
    return "Check For Updates";
  }
  if (state.status === "checking") {
    return "Checking…";
  }
  if (state.status === "error") {
    return "Check Again";
  }
  return "Check For Updates";
}

export function resolveUpdateActionLabel(state: AppUpdateState | null): string {
  if (!state) {
    return "Update";
  }
  if (state.status === "downloading-manifest") {
    return "Downloading…";
  }
  if (state.status === "updating") {
    return "Updating…";
  }
  if (state.status === "ready-to-port") {
    return "Port";
  }
  if (state.status === "porting") {
    return "Porting…";
  }
  return "Update";
}

export function resolveUpdateSectionDescription(
  state: AppUpdateState | null,
): string {
  if (!state) {
    return "Check the current app version against the upstream registry.";
  }
  if (state.status === "available") {
    return "A newer upstream version is available.";
  }
  if (state.status === "updating") {
    return "The latest manifest has been downloaded and the background workflow is running.";
  }
  if (state.status === "ready-to-port") {
    return "The update agent is done. Build and open the installer.";
  }
  if (state.status === "porting") {
    return "The macOS installer is being built.";
  }
  if (state.status === "error") {
    return state.message ?? "Could not check for updates.";
  }
  return "Current version of the application.";
}
