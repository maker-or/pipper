import { useEffect, useLayoutEffect, useState } from "react";

import { type ComponentRegistryEntry, findNearestRegisteredComponent } from "../componentSelection";

interface OverlayBox {
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
}

interface HoverTarget {
  readonly element: HTMLElement;
  readonly entry: ComponentRegistryEntry;
}

declare global {
  interface WindowEventMap {
    "pipper:component-selected": CustomEvent<ComponentRegistryEntry>;
  }
}

function isCtrlE(event: KeyboardEvent): boolean {
  return (
    event.key.toLowerCase() === "e" &&
    event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    !event.shiftKey
  );
}

function overlayBoxForElement(element: HTMLElement): OverlayBox {
  const rect = element.getBoundingClientRect();
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
}

export function ComponentSelectionOverlay() {
  const [selectionMode, setSelectionMode] = useState(false);
  const [hoverTarget, setHoverTarget] = useState<HoverTarget | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<ComponentRegistryEntry | null>(null);
  const [hoverBox, setHoverBox] = useState<OverlayBox | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isCtrlE(event)) {
        event.preventDefault();
        event.stopPropagation();
        setSelectionMode((current) => !current);
        return;
      }

      if (event.key === "Escape" && selectionMode) {
        event.preventDefault();
        setSelectionMode(false);
      }
    };

    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => {
      window.removeEventListener("keydown", onKeyDown, { capture: true });
    };
  }, [selectionMode]);

  useEffect(() => {
    if (!selectionMode) {
      setHoverTarget(null);
      setHoverBox(null);
      setSelectedEntry(null);
      return;
    }

    const onPointerMove = (event: PointerEvent) => {
      const nearestComponent = findNearestRegisteredComponent(event.target);
      setHoverTarget((current) => {
        if (
          current?.element === nearestComponent?.element &&
          current?.entry.id === nearestComponent?.entry.id
        ) {
          return current;
        }

        return nearestComponent;
      });
    };

    const onPointerLeave = () => {
      setHoverTarget(null);
    };

    const onClick = (event: MouseEvent) => {
      const nearestComponent = findNearestRegisteredComponent(event.target);
      if (!nearestComponent) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      setSelectedEntry(nearestComponent.entry);
      window.dispatchEvent(
        new CustomEvent("pipper:component-selected", { detail: nearestComponent.entry }),
      );
    };

    window.addEventListener("pointermove", onPointerMove, { capture: true });
    window.addEventListener("pointerleave", onPointerLeave);
    window.addEventListener("click", onClick, { capture: true });
    return () => {
      window.removeEventListener("pointermove", onPointerMove, { capture: true });
      window.removeEventListener("pointerleave", onPointerLeave);
      window.removeEventListener("click", onClick, { capture: true });
    };
  }, [selectionMode]);

  useLayoutEffect(() => {
    if (!selectionMode || !hoverTarget) {
      setHoverBox(null);
      return;
    }

    let frame = 0;
    const syncHoverBox = () => {
      setHoverBox(overlayBoxForElement(hoverTarget.element));
    };
    const requestSync = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(syncHoverBox);
    };

    syncHoverBox();
    window.addEventListener("resize", requestSync);
    window.addEventListener("scroll", requestSync, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", requestSync);
      window.removeEventListener("scroll", requestSync, true);
    };
  }, [hoverTarget, selectionMode]);

  if (!selectionMode || !hoverBox || !hoverTarget) {
    return null;
  }

  const selected = selectedEntry?.id === hoverTarget.entry.id;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[2147483647]"
      data-pipper-selection-overlay=""
    >
      <div
        className={[
          "absolute rounded-[7px] border-2 shadow-[0_0_0_9999px_rgb(0_0_0/0.02)] transition-[border-color,box-shadow] duration-100",
          selected
            ? "border-emerald-400 shadow-[0_0_0_1px_rgb(16_185_129/0.28),0_0_0_9999px_rgb(0_0_0/0.02)]"
            : "border-sky-400 shadow-[0_0_0_1px_rgb(56_189_248/0.24),0_0_0_9999px_rgb(0_0_0/0.02)]",
        ].join(" ")}
        style={{
          top: hoverBox.top,
          left: hoverBox.left,
          width: hoverBox.width,
          height: hoverBox.height,
        }}
      />
      <div
        className={[
          "absolute max-w-[min(320px,calc(100vw-16px))] rounded-md px-2 py-1 text-[11px] font-medium text-white shadow-lg",
          selected ? "bg-emerald-600" : "bg-sky-600",
        ].join(" ")}
        style={{
          top: Math.max(8, hoverBox.top - 28),
          left: Math.min(Math.max(8, hoverBox.left), window.innerWidth - 328),
        }}
      >
        {hoverTarget.entry.name}
      </div>
    </div>
  );
}
