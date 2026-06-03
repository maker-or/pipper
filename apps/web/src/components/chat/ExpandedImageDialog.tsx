import { memo, useCallback, useEffect, useState, useRef, useLayoutEffect } from "react";
import gsap from "gsap";
import { ChevronLeftIcon, ChevronRightIcon, XIcon } from "lucide-react";
import { Button } from "../ui/button";
import type { ExpandedImagePreview } from "./ExpandedImagePreview";

interface ExpandedImageDialogProps {
  preview: ExpandedImagePreview;
  onClose: () => void;
}

export const ExpandedImageDialog = memo(function ExpandedImageDialog({
  preview: initialPreview,
  onClose,
}: ExpandedImageDialogProps) {
  const [preview, setPreview] = useState(initialPreview);

  // Sync when the parent hands us a new preview reference.
  useEffect(() => {
    setPreview(initialPreview);
  }, [initialPreview]);

  const imgContainerRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const initialMorphRef = useRef({ deltaX: 0, deltaY: 0, scaleX: 0, scaleY: 0 });
  const [isClosing, setIsClosing] = useState(false);

  useLayoutEffect(() => {
    const originRect = initialPreview.originRect;
    if (!originRect || !imgContainerRef.current) return;

    const el = imgContainerRef.current;

    // We want the final target to be established natively first.
    // GSAP will set the starting position to match the origin coordinates.
    const targetRect = el.getBoundingClientRect();

    const scaleX = originRect.width / targetRect.width;
    const scaleY = originRect.height / targetRect.height;

    // Calculate distance from center to center
    const deltaX =
      originRect.left + originRect.width / 2 - (targetRect.left + targetRect.width / 2);
    const deltaY =
      originRect.top + originRect.height / 2 - (targetRect.top + targetRect.height / 2);

    initialMorphRef.current = { deltaX, deltaY, scaleX, scaleY };

    gsap.fromTo(
      el,
      {
        x: deltaX,
        y: deltaY,
        scaleX: scaleX,
        scaleY: scaleY,
        opacity: 0,
        borderRadius: "24px",
      },
      {
        x: 0,
        y: 0,
        scaleX: 1,
        scaleY: 1,
        opacity: 1,
        borderRadius: "0px",
        duration: 0.4,
        ease: "power3.out",
      },
    );
  }, [initialPreview.originRect]);

  const handleClose = useCallback(() => {
    if (isClosing) return;
    setIsClosing(true);

    const el = imgContainerRef.current;
    const backdrop = backdropRef.current;

    if (initialPreview.originRect && el) {
      const { deltaX, deltaY, scaleX, scaleY } = initialMorphRef.current;
      gsap.to(el, {
        x: deltaX,
        y: deltaY,
        scaleX: scaleX,
        scaleY: scaleY,
        opacity: 0,
        borderRadius: "24px",
        duration: 0.25,
        ease: "power3.inOut",
      });
    } else if (el) {
      gsap.to(el, { scale: 0.95, opacity: 0, duration: 0.2 });
    }

    if (backdrop) {
      gsap.to(backdrop, {
        opacity: 0,
        duration: 0.25,
        ease: "power2.inOut",
        onComplete: onClose,
      });
    } else {
      onClose();
    }
  }, [isClosing, initialPreview.originRect, onClose]);

  const navigateImage = useCallback((direction: -1 | 1) => {
    setPreview((existing) => {
      if (existing.images.length <= 1) return existing;
      const nextIndex =
        (existing.index + direction + existing.images.length) % existing.images.length;
      if (nextIndex === existing.index) return existing;
      return { ...existing, index: nextIndex };
    });
  }, []);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (isClosing) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        handleClose();
        return;
      }
      if (preview.images.length <= 1) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        event.stopPropagation();
        navigateImage(-1);
        return;
      }
      if (event.key !== "ArrowRight") return;
      event.preventDefault();
      event.stopPropagation();
      navigateImage(1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigateImage, onClose, preview.images.length]);

  const item = preview.images[preview.index];
  if (!item) return null;

  return (
    <div
      data-pipper-id="expanded-image-dialog"
      ref={backdropRef}
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/75 px-4 py-6 [-webkit-app-region:no-drag] animate-in fade-in"
      style={{
        animationDuration: "300ms",
        animationTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)",
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Expanded image preview"
    >
      <button
        type="button"
        className="absolute inset-0 z-0 cursor-zoom-out"
        aria-label="Close image preview"
        onClick={handleClose}
      />
      {preview.images.length > 1 && (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="absolute left-2 top-1/2 z-20 -translate-y-1/2 text-white/90 hover:bg-white/10 hover:text-white sm:left-6"
          aria-label="Previous image"
          onClick={() => navigateImage(-1)}
        >
          <ChevronLeftIcon className="size-5" />
        </Button>
      )}
      <div ref={imgContainerRef} className="relative isolate z-10 max-h-[92vh] max-w-[92vw]">
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          className="absolute right-2 top-2"
          onClick={handleClose}
          aria-label="Close image preview"
        >
          <XIcon />
        </Button>
        <img
          src={item.src}
          alt={item.name}
          className="max-h-[86vh] max-w-[92vw] select-none rounded-lg border border-border/70 bg-background object-contain shadow-2xl"
          draggable={false}
        />
        <p className="mt-2 max-w-[92vw] truncate text-center text-xs text-muted-foreground/80">
          {item.name}
          {preview.images.length > 1 ? ` (${preview.index + 1}/${preview.images.length})` : ""}
        </p>
      </div>
      {preview.images.length > 1 && (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="absolute right-2 top-1/2 z-20 -translate-y-1/2 text-white/90 hover:bg-white/10 hover:text-white sm:right-6"
          aria-label="Next image"
          onClick={() => navigateImage(1)}
        >
          <ChevronRightIcon className="size-5" />
        </Button>
      )}
    </div>
  );
});
