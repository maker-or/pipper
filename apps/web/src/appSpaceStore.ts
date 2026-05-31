import { create } from "zustand";

export type AppSpace = "main" | "improve";

interface AppSpaceStore {
  readonly activeSpace: AppSpace;
  readonly setActiveSpace: (space: AppSpace) => void;
}

export const useAppSpaceStore = create<AppSpaceStore>((set) => ({
  activeSpace: "main",
  setActiveSpace: (activeSpace) => set({ activeSpace }),
}));
