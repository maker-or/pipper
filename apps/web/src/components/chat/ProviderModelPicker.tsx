import {
  type ProviderInstanceId,
  type ProviderDriverKind,
  type ResolvedKeybindingsConfig,
  type ScopedThreadRef,
} from "@t3tools/contracts";
import { memo, useEffect, useMemo, useState, useRef } from "react";
import type { VariantProps } from "class-variance-authority";
import { ChevronDownIcon } from "lucide-react";
import { gsap } from "gsap";
import { Button, buttonVariants } from "../ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { cn } from "~/lib/utils";
import { ModelPickerContent } from "./ModelPickerContent";
import { ProviderInstanceIcon } from "./ProviderInstanceIcon";
import {
  ModelEsque,
  getTriggerDisplayModelLabel,
  getTriggerDisplayModelName,
} from "./providerIconUtils";
import { setModelPickerOpen } from "../../modelPickerOpenState";
import type { ProviderInstanceEntry } from "../../providerInstances";
import { type DraftId } from "../../composerDraftStore";

export const ProviderModelPicker = memo(function ProviderModelPicker(props: {
  /**
   * The instance currently selected in the composer. Drives the trigger
   * icon, label and the default-highlighted combobox row.
   */
  activeInstanceId: ProviderInstanceId;
  model: string;
  lockedProvider: ProviderDriverKind | null;
  lockedContinuationGroupKey?: string | null;
  /** Instance entries rendered in the sidebar + used to resolve display name. */
  instanceEntries: ReadonlyArray<ProviderInstanceEntry>;
  keybindings?: ResolvedKeybindingsConfig;
  modelOptionsByInstance: ReadonlyMap<ProviderInstanceId, ReadonlyArray<ModelEsque>>;
  activeProviderIconClassName?: string;
  compact?: boolean;
  disabled?: boolean;
  terminalOpen?: boolean;
  open?: boolean;
  /**
   * Float the trigger to the bottom-center of the viewport. The popover
   * anchors above the trigger and is horizontally centered so the popup
   * sits directly above the floating pill. The trigger still lives inside
   * the caller's DOM tree (Portal-wrapped popover), but its containing
   * `div` is `position: fixed` and does not affect surrounding layout.
   */
  floating?: boolean;
  triggerVariant?: VariantProps<typeof buttonVariants>["variant"];
  triggerClassName?: string;
  composerDraftTarget?: ScopedThreadRef | DraftId;
  onOpenChange?: (open: boolean) => void;
  onInstanceModelChange: (instanceId: ProviderInstanceId, model: string) => void;
}) {
  const [uncontrolledIsMenuOpen, setUncontrolledIsMenuOpen] = useState(false);
  const isMenuOpen = props.open ?? uncontrolledIsMenuOpen;
  const popupRef = useRef<HTMLDivElement>(null);

  // Resolve the active instance entry by exact routing key. The composer
  // resolves fallbacks before rendering this component; if the selected
  // instance disappears, do not infer a replacement from its driver kind.
  const activeEntry = useMemo(() => {
    return (
      props.instanceEntries.find((entry) => entry.instanceId === props.activeInstanceId) ?? null
    );
  }, [props.activeInstanceId, props.instanceEntries]);

  const activeInstanceId = props.activeInstanceId;
  const selectedInstanceOptions = props.modelOptionsByInstance.get(activeInstanceId) ?? [];
  // If the current slug belongs to a different instance (for example after
  // a provider switch or disable), prefer the active instance's first
  // option so the trigger icon and label stay in sync instead of showing
  // a stale foreign slug.
  const selectedModel =
    selectedInstanceOptions.find((option) => option.slug === props.model) ??
    selectedInstanceOptions[0];
  const triggerTitle = selectedModel ? getTriggerDisplayModelName(selectedModel) : props.model;
  const triggerSubtitle = selectedModel?.subProvider;
  const triggerLabel = selectedModel ? getTriggerDisplayModelLabel(selectedModel) : props.model;
  const duplicateDriverCount = props.instanceEntries.filter(
    (entry) => activeEntry !== null && entry.driverKind === activeEntry.driverKind,
  ).length;
  const showInstanceBadge = Boolean(activeEntry?.accentColor) || duplicateDriverCount > 1;

  const setIsMenuOpen = (open: boolean) => {
    props.onOpenChange?.(open);
    if (props.open === undefined) {
      setUncontrolledIsMenuOpen(open);
    }
  };

  useEffect(() => {
    setModelPickerOpen(isMenuOpen);
    return () => {
      setModelPickerOpen(false);
    };
  }, [isMenuOpen]);

  useEffect(() => {
    const popup = popupRef.current;
    if (!popup) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
      if (isMenuOpen) {
        gsap.set(popup, { opacity: 1, scale: 1, filter: "blur(0px)" });
      }
      return;
    }

    if (isMenuOpen) {
      gsap.fromTo(
        popup,
        { opacity: 0, scale: 0.96, filter: "blur(4px)" },
        {
          opacity: 1,
          scale: 1,
          filter: "blur(0px)",
          duration: 0.25,
          ease: "power3.out",
        },
      );
    } else {
      gsap.to(popup, {
        opacity: 0,
        scale: 0.95,
        filter: "blur(4px)",
        duration: 0.15,
        ease: "power2.in",
      });
    }
  }, [isMenuOpen]);

  const handleInstanceModelChange = (instanceId: ProviderInstanceId, model: string) => {
    if (props.disabled) return;
    props.onInstanceModelChange(instanceId, model);
    setIsMenuOpen(false);
  };

  const isFloating = props.floating ?? false;

  return (
    <div
      data-pipper-id="provider-model-picker-anchor"
      data-provider-model-picker-floating={isFloating ? "true" : "false"}
      className={cn(
        isFloating && "pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center",
      )}
    >
      <Popover
        data-pipper-id="provider-model-picker"
        open={isMenuOpen}
        onOpenChange={(open) => {
          if (props.disabled) {
            setIsMenuOpen(false);
            return;
          }
          setIsMenuOpen(open);
        }}
      >
        <PopoverTrigger
          render={
            <Button
              data-pipper-id="provider-model-picker-trigger"
              size="sm"
              variant={props.triggerVariant ?? "ghost"}
              data-chat-provider-model-picker="true"
              className={cn(
                "min-w-0 justify-start overflow-hidden whitespace-nowrap px-2 text-muted-foreground/70 hover:text-foreground/80 [&_svg]:mx-0",
                "rounded-none before:rounded-none",
                props.compact ? "max-w-42 shrink-0" : "max-w-48 shrink sm:max-w-56 sm:px-3",
                isFloating &&
                  "pointer-events-auto rounded-full border border-border/40 bg-background/70 px-3 shadow-md shadow-black/5 backdrop-blur-md transition-colors hover:bg-background/85 dark:bg-zinc-900/70",
                props.triggerClassName,
              )}
              disabled={props.disabled}
            />
          }
        >
          <span
            className={cn(
              "flex min-w-0 w-full box-border items-center gap-2 overflow-hidden",
              props.compact ? "max-w-36 sm:pl-1" : undefined,
            )}
          >
            {activeEntry ? (
              <ProviderInstanceIcon
                driverKind={activeEntry.driverKind}
                displayName={activeEntry.displayName}
                accentColor={activeEntry.accentColor}
                showBadge={showInstanceBadge}
                className={showInstanceBadge ? "size-5" : "size-4"}
                iconClassName={cn("size-4", props.activeProviderIconClassName)}
                badgeClassName="right-[-0.125rem] bottom-[-0.125rem] h-3 min-w-3 text-[7px]"
              />
            ) : null}
            <Tooltip>
              <TooltipTrigger
                render={
                  <span
                    className={cn(
                      "min-w-0 flex-1 overflow-hidden",
                      triggerSubtitle
                        ? "grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1"
                        : "truncate",
                    )}
                  />
                }
              >
                {triggerSubtitle ? (
                  <>
                    <span className="min-w-0 truncate">{triggerSubtitle}</span>
                    <span aria-hidden="true" className="shrink-0 opacity-60">
                      ·
                    </span>
                    <span className="min-w-0 truncate">{triggerTitle}</span>
                  </>
                ) : (
                  triggerTitle
                )}
              </TooltipTrigger>
              <TooltipPopup side="top">{triggerLabel}</TooltipPopup>
            </Tooltip>
            <ChevronDownIcon aria-hidden="true" className="size-3 shrink-0 opacity-60" />
          </span>
        </PopoverTrigger>
        <PopoverPopup
          data-pipper-id="provider-model-picker-popup"
          ref={popupRef}
          align={isFloating ? "center" : "start"}
          side={isFloating ? "top" : "bottom"}
          sideOffset={isFloating ? 10 : 4}
          className="border-0 bg-transparent p-0 shadow-none before:hidden [--viewport-inline-padding:0] *:data-[slot=popover-viewport]:p-0"
        >
          <ModelPickerContent
            activeInstanceId={activeInstanceId}
            model={props.model}
            lockedProvider={props.lockedProvider}
            lockedContinuationGroupKey={props.lockedContinuationGroupKey ?? null}
            instanceEntries={props.instanceEntries}
            {...(props.keybindings ? { keybindings: props.keybindings } : {})}
            modelOptionsByInstance={props.modelOptionsByInstance}
            terminalOpen={props.terminalOpen ?? false}
            composerDraftTarget={props.composerDraftTarget}
            onRequestClose={() => setIsMenuOpen(false)}
            onInstanceModelChange={handleInstanceModelChange}
          />
        </PopoverPopup>
      </Popover>
    </div>
  );
});
