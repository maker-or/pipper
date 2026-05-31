import { PauseIcon } from "lucide-react";
import type { CSSProperties } from "react";

export interface ImproveLaunchOrigin {
  readonly x: number;
  readonly y: number;
}

export interface ImproveLaunchTransitionProps {
  readonly origin: ImproveLaunchOrigin | null;
  readonly state: "idle" | "holding" | "entering";
}

export function ImproveLaunchTransition({ origin, state }: ImproveLaunchTransitionProps) {
  const isEntering = state === "entering";

  const style = {
    "--improve-origin-x": `${origin?.x ?? 0}px`,
    "--improve-origin-y": `${origin?.y ?? 0}px`,
  } as CSSProperties;

  return (
    <div
      aria-hidden="true"
      className="improve-launch-overlay"
      data-state={isEntering ? "entering" : "idle"}
      style={style}
    >
      <div className="improve-launch-overlay__mesh" aria-hidden="true" />
      <div className="improve-launch-overlay__scrim" aria-hidden="true" />
      <div className="improve-launch-overlay__ripple" aria-hidden="true" />
      <div className="improve-launch-overlay__panel">
        <div className="improve-launch-overlay__orb" aria-hidden="true">
          <PauseIcon className="improve-launch-overlay__icon size-7" />
        </div>
        <div className="improve-launch-overlay__prompt">What are you looking for?</div>
        <div className="improve-launch-overlay__caption">Entering Improve</div>
      </div>
    </div>
  );
}
