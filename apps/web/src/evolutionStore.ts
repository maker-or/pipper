import { create } from "zustand";

/** A single entry in patch.md recording why a commit was made. */
export interface PatchEntry {
  readonly commit: string;
  readonly files_changed: readonly string[];
  readonly why: string;
}

/** Status of the local evolution workspace. */
export interface EvolutionWorkspaceStatus {
  readonly exists: boolean;
  readonly hasGit: boolean;
  readonly hasDependencies: boolean;
  readonly localVersion: string | null;
  readonly workspaceRoot: string;
}

export type EvolutionSetupStep =
  | "cloning"
  | "installing"
  | "initializing"
  | "complete"
  | "error";

/** Progress update during workspace setup. */
export interface EvolutionSetupProgress {
  readonly step: EvolutionSetupStep;
  readonly message: string;
  /** 0..1 progress fraction, null if indeterminate */
  readonly progress: number | null;
}

/** Result of checking for upstream updates. */
export interface EvolutionUpdateCheckResult {
  readonly updateAvailable: boolean;
  readonly localVersion: string | null;
  readonly latestVersion: string | null;
  readonly manifestUrl: string | null;
}

interface EvolutionStore {
  /** Current workspace status, null if not yet checked. */
  readonly workspaceStatus: EvolutionWorkspaceStatus | null;
  /** Setup progress during first-time onboarding. */
  readonly setupProgress: EvolutionSetupProgress | null;
  /** Result of the latest update check. */
  readonly updateCheckResult: EvolutionUpdateCheckResult | null;
  /** Whether workspace setup is in progress. */
  readonly isSettingUp: boolean;
  /** Whether an update check is in progress. */
  readonly isCheckingUpdate: boolean;
  /** Whether the update is being applied. */
  readonly isApplyingUpdate: boolean;
  /** Whether the update has been applied and redeploy is available. */
  readonly updateApplied: boolean;
  /** Parsed patch entries from patch.md. */
  readonly patchEntries: readonly PatchEntry[];

  readonly setWorkspaceStatus: (
    status: EvolutionWorkspaceStatus | null,
  ) => void;
  readonly setSetupProgress: (progress: EvolutionSetupProgress | null) => void;
  readonly setUpdateCheckResult: (
    result: EvolutionUpdateCheckResult | null,
  ) => void;
  readonly setIsSettingUp: (value: boolean) => void;
  readonly setIsCheckingUpdate: (value: boolean) => void;
  readonly setIsApplyingUpdate: (value: boolean) => void;
  readonly setUpdateApplied: (value: boolean) => void;
  readonly setPatchEntries: (entries: readonly PatchEntry[]) => void;
  readonly reset: () => void;
}

const INITIAL_STATE = {
  workspaceStatus: null,
  setupProgress: null,
  updateCheckResult: null,
  isSettingUp: false,
  isCheckingUpdate: false,
  isApplyingUpdate: false,
  updateApplied: false,
  patchEntries: [],
} as const;

export const useEvolutionStore = create<EvolutionStore>((set) => ({
  ...INITIAL_STATE,
  setWorkspaceStatus: (workspaceStatus) => set({ workspaceStatus }),
  setSetupProgress: (setupProgress) => set({ setupProgress }),
  setUpdateCheckResult: (updateCheckResult) => set({ updateCheckResult }),
  setIsSettingUp: (isSettingUp) => set({ isSettingUp }),
  setIsCheckingUpdate: (isCheckingUpdate) => set({ isCheckingUpdate }),
  setIsApplyingUpdate: (isApplyingUpdate) => set({ isApplyingUpdate }),
  setUpdateApplied: (updateApplied) => set({ updateApplied }),
  setPatchEntries: (patchEntries) => set({ patchEntries }),
  reset: () => set(INITIAL_STATE),
}));
