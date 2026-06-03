import { useCallback, useState } from "react";
import { ArrowDownToLineIcon, RefreshCwIcon, RocketIcon } from "lucide-react";

import { useEvolutionStore } from "../evolutionStore";
import { Button } from "./ui/button";
import { stackedThreadToast, toastManager } from "./ui/toast";

export function EvolutionUpdateBanner() {
  const updateCheckResult = useEvolutionStore((s) => s.updateCheckResult);
  const isApplyingUpdate = useEvolutionStore((s) => s.isApplyingUpdate);
  const setIsApplyingUpdate = useEvolutionStore((s) => s.setIsApplyingUpdate);
  const updateApplied = useEvolutionStore((s) => s.updateApplied);
  const setUpdateApplied = useEvolutionStore((s) => s.setUpdateApplied);
  const [dismissed, setDismissed] = useState(false);

  const handleApplyUpdate = useCallback(async () => {
    if (isApplyingUpdate) return;
    setIsApplyingUpdate(true);

    try {
      const bridge = typeof window !== "undefined" ? window.desktopBridge : undefined;
      if (bridge && "applyEvolutionUpdate" in bridge && bridge.applyEvolutionUpdate) {
        await bridge.applyEvolutionUpdate();
      }

      setUpdateApplied(true);
      toastManager.add(
        stackedThreadToast({
          type: "success",
          title: "Update processed",
          description: "Click Redeploy to build and launch the updated version.",
        }),
      );
    } catch (error) {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "Update failed",
          description: error instanceof Error ? error.message : "An error occurred.",
        }),
      );
    } finally {
      setIsApplyingUpdate(false);
    }
  }, [isApplyingUpdate, setIsApplyingUpdate, setUpdateApplied]);

  const handleRedeploy = useCallback(() => {
    const bridge = typeof window !== "undefined" ? window.desktopBridge : undefined;
    if (bridge?.portEvolutionRelease) {
      void bridge.portEvolutionRelease().then(() => {
        toastManager.add(
          stackedThreadToast({
            type: "success",
            title: "Release built",
            description: "The new version has been launched.",
          }),
        );
      });
    }
  }, []);

  if (!updateCheckResult?.updateAvailable || dismissed) {
    return null;
  }

  return (
    <div
      data-pipper-id="evolution-update-banner"
      className="relative mx-auto mb-3 w-full max-w-2xl overflow-hidden rounded-xl border border-orange-300/20 bg-gradient-to-r from-orange-500/8 to-amber-500/6 px-4 py-3 shadow-md shadow-orange-900/10 backdrop-blur-sm"
    >
      <div className="flex items-center gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-orange-500/15 text-orange-300 ring-1 ring-orange-400/25">
          <ArrowDownToLineIcon className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">Update Available</p>
          <p className="text-xs text-muted-foreground">
            {updateCheckResult.latestVersion
              ? `Version ${updateCheckResult.latestVersion} is available`
              : "A new version is available"}
            {updateCheckResult.localVersion ? ` (current: ${updateCheckResult.localVersion})` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {updateApplied ? (
            <Button
              className="rounded-full border border-violet-300/30 bg-violet-500/12 px-3 font-medium text-violet-50 shadow-xs/5 hover:bg-violet-500/18"
              size="sm"
              variant="outline"
              onClick={handleRedeploy}
            >
              <RocketIcon className="size-3.5" />
              Redeploy
            </Button>
          ) : (
            <Button
              className="rounded-full border border-orange-300/30 bg-orange-500/12 px-3 font-medium text-orange-50 shadow-xs/5 hover:bg-orange-500/18"
              disabled={isApplyingUpdate}
              size="sm"
              variant="outline"
              onClick={() => void handleApplyUpdate()}
            >
              <RefreshCwIcon className={`size-3.5 ${isApplyingUpdate ? "animate-spin" : ""}`} />
              {isApplyingUpdate ? "Updating…" : "Update"}
            </Button>
          )}
          <button
            type="button"
            aria-label="Dismiss update notification"
            className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:text-foreground"
            onClick={() => setDismissed(true)}
          >
            <span className="text-xs">✕</span>
          </button>
        </div>
      </div>
    </div>
  );
}
