import type { ReactNode } from "react";
import { PlayIcon, SquareIcon } from "lucide-react";

import { cn } from "~/lib/utils";
import { Button } from "./ui/button";
import { stackedThreadToast, toastManager } from "./ui/toast";
import { useDevDesktopProcess } from "../hooks/useDevDesktopProcess";
import { IMPROVE_WORKSPACE_ROOT } from "../hooks/useOpenImproveSpace";

export function ImproveDevDesktopButton({ className }: { readonly className?: string }) {
  const { state, hasApi, isBusy, toggle } = useDevDesktopProcess();

  if (!hasApi) {
    return null;
  }

  const running = state?.running ?? false;
  const cwd = running ? (state?.cwd ?? IMPROVE_WORKSPACE_ROOT) : IMPROVE_WORKSPACE_ROOT;
  const title = running
    ? `Stop bun run dev:desktop in ${cwd}`
    : `Run bun run dev:desktop in ${cwd}`;
  const label = running ? "Running" : "Run desktop";
  const icon: ReactNode = running ? (
    <SquareIcon aria-hidden="true" className="size-4" />
  ) : (
    <PlayIcon aria-hidden="true" className="size-4" fill="currentColor" />
  );

  return (
    <Button
      aria-label={title}
      aria-pressed={running}
      className={cn(
        "no-drag rounded-full border px-3 font-medium shadow-xs/5",
        running
          ? "border-emerald-300/35 bg-emerald-500/15 text-emerald-50 hover:bg-emerald-500/20"
          : "border-orange-300/35 bg-orange-500/12 text-orange-50 hover:bg-orange-500/18",
        className,
      )}
      disabled={isBusy}
      size="sm"
      title={title}
      variant="outline"
      onClick={() => {
        void (async () => {
          try {
            await toggle(cwd);
          } catch (error) {
            toastManager.add(
              stackedThreadToast({
                type: "error",
                title: running ? "Failed to stop dev desktop" : "Failed to start dev desktop",
                description: error instanceof Error ? error.message : "An unknown error occurred.",
              }),
            );
          }
        })();
      }}
    >
      {icon}
      <span className="min-w-0 truncate">{label}</span>
    </Button>
  );
}
