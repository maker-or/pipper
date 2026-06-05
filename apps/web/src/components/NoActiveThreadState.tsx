import { useMemo } from "react";
import { LiquidMetal } from "@paper-design/shaders-react";
import { SidebarInset, SidebarTrigger } from "./ui/sidebar";
import { isElectron } from "../env";
import { useAppSpaceStore } from "../appSpaceStore";
import { useTheme } from "../hooks/useTheme";
import { THEMES } from "../themes";
import { cn } from "~/lib/utils";
import { EvolutionSpace } from "./EvolutionSpace";
import { ImproveEvolutionActions } from "./ImproveEvolutionActions";

function readBackgroundColor(resolvedTheme: "light" | "dark"): string {
  if (typeof document !== "undefined") {
    const value = getComputedStyle(document.documentElement)
      .getPropertyValue("--background")
      .trim();
    if (value) return value;
  }
  return THEMES[resolvedTheme]?.tokens["--background"] ?? "#070707";
}

export function NoActiveThreadState() {
  const activeSpace = useAppSpaceStore((store) => store.activeSpace);
  const isImproveSpace = activeSpace === "improve";
  const { resolvedTheme } = useTheme();
  const backgroundColor = useMemo(() => readBackgroundColor(resolvedTheme), [resolvedTheme]);

  if (isImproveSpace) {
    return <EvolutionSpace />;
  }

  return (
    <SidebarInset
      data-pipper-id="no-active-thread-state"
      className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground"
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden bg-background">
        <header
          className={cn(
            "border-b border-border px-3 sm:px-5",
            isElectron
              ? "drag-region flex h-[52px] items-center wco:h-[env(titlebar-area-height)]"
              : "py-2 sm:py-3",
          )}
        >
          {isElectron ? (
            <div className="flex w-full items-center justify-between gap-3 wco:pr-[calc(100vw-env(titlebar-area-width)-env(titlebar-area-x)+1em)]">
              <span className="text-xs text-muted-foreground/50 wco:pr-[calc(100vw-env(titlebar-area-width)-env(titlebar-area-x)+1em)]">
                No active thread
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <SidebarTrigger className="size-7 shrink-0 md:hidden" />
              <span className="text-sm font-medium text-foreground md:text-muted-foreground/60">
                No active thread
              </span>
            </div>
          )}
        </header>

        <div
          data-pipper-id="no-active-thread-shader"
          className="relative flex min-h-0 flex-1 items-center justify-center p-6 md:p-10"
        >
          <div className="relative aspect-video w-full max-w-5xl overflow-hidden ">
            <LiquidMetal
              width="100%"
              height="100%"
              image="/pipper.svg"
              colorBack={backgroundColor}
              colorTint="#93521582"
              repetition={10}
              softness={0.6}
              shiftRed={0.62}
              shiftBlue={0.62}
              distortion={1}
              contour={0}
              angle={70}
              speed={0.64}
              scale={0.76}
              fit="contain"
            />
          </div>
        </div>
      </div>
    </SidebarInset>
  );
}
