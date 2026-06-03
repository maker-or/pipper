import {
  type ProviderInstanceId,
  type ProviderDriverKind,
  type ResolvedKeybindingsConfig,
  type ScopedThreadRef,
  type ProviderOptionDescriptor,
} from "@t3tools/contracts";
import {
  resolveSelectableModel,
  getProviderOptionDescriptors,
  buildProviderOptionSelectionsFromDescriptors,
  getProviderOptionCurrentValue,
} from "@t3tools/shared/model";
import { memo, useMemo, useState, useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { SearchIcon, ChevronLeftIcon, CheckIcon } from "lucide-react";
import { gsap } from "gsap";
import { ModelListRow } from "./ModelListRow";
import { ModelPickerSidebar } from "./ModelPickerSidebar";
import { isModelPickerNewModel } from "./modelPickerModelHighlights";
import { buildModelPickerSearchText, scoreModelPickerSearch } from "./modelPickerSearch";
import { Combobox, ComboboxEmpty, ComboboxInput, ComboboxList } from "../ui/combobox";
import { ModelEsque, PROVIDER_ICON_BY_PROVIDER } from "./providerIconUtils";
import {
  modelPickerJumpCommandForIndex,
  modelPickerJumpIndexFromCommand,
  resolveShortcutCommand,
  shortcutLabelForCommand,
} from "../../keybindings";
import { useSettings, useUpdateSettings } from "~/hooks/useSettings";
import { cn } from "~/lib/utils";
import { TooltipProvider } from "../ui/tooltip";
import type { ProviderInstanceEntry } from "../../providerInstances";
import { providerModelKey, sortProviderModelItems } from "../../modelOrdering";
import { shouldRenderTraitsControls } from "./TraitsPicker";
import { getProviderModelCapabilities } from "../../providerModels";
import {
  useComposerDraftStore,
  useComposerThreadDraft,
  type DraftId,
} from "../../composerDraftStore";
import { Switch } from "../ui/switch";
import { Button } from "../ui/button";

type ModelPickerItem = {
  slug: string;
  name: string;
  shortName?: string;
  subProvider?: string;
  instanceId: ProviderInstanceId;
  driverKind: ProviderDriverKind;
  instanceDisplayName: string;
  instanceAccentColor?: string | undefined;
  continuationGroupKey?: string | undefined;
};

const EMPTY_MODEL_JUMP_LABELS = new Map<string, string>();

// Split a `${instanceId}:${slug}` combobox key back into its pieces. Slugs
// can contain colons (e.g. some vendor model ids), so we only split on the
// first colon — anything after that is the slug.
function splitInstanceModelKey(key: string): { instanceId: ProviderInstanceId; slug: string } {
  const colonIndex = key.indexOf(":");
  if (colonIndex === -1) {
    return { instanceId: key as ProviderInstanceId, slug: "" };
  }
  return {
    instanceId: key.slice(0, colonIndex) as ProviderInstanceId,
    slug: key.slice(colonIndex + 1),
  };
}

function replaceDescriptorCurrentValue(
  descriptors: ReadonlyArray<ProviderOptionDescriptor>,
  descriptorId: string,
  currentValue: string | boolean | undefined,
): ReadonlyArray<ProviderOptionDescriptor> {
  return descriptors.map((descriptor) =>
    descriptor.id !== descriptorId
      ? descriptor
      : descriptor.type === "boolean"
        ? {
            ...descriptor,
            ...(typeof currentValue === "boolean" ? { currentValue } : {}),
          }
        : {
            ...descriptor,
            ...(typeof currentValue === "string" ? { currentValue } : {}),
          },
  );
}

export const ModelPickerContent = memo(function ModelPickerContent(props: {
  /** The instance currently selected in the composer (combobox "value"). */
  activeInstanceId: ProviderInstanceId;
  model: string;
  /**
   * When set, the picker is locked to the given driver kind — typically
   * because the user is editing a previously-sent message and can't change
   * which driver served the turn. Multiple instances of the same kind
   * remain selectable (e.g. locked to `codex` still lets the user switch
   * between the default Codex and a custom Codex Personal).
   */
  lockedProvider: ProviderDriverKind | null;
  lockedContinuationGroupKey?: string | null;
  /**
   * All configured provider instances in display order. Used to render
   * the sidebar (one button per instance) and to resolve display names
   * for the locked-mode header.
   */
  instanceEntries: ReadonlyArray<ProviderInstanceEntry>;
  keybindings?: ResolvedKeybindingsConfig;
  /**
   * Model options per instance. Keyed by `ProviderInstanceId` so the
   * default Codex instance and any custom Codex instances each have their
   * own list (custom instances typically start with the same built-in
   * model set but are free to diverge via customModels).
   */
  modelOptionsByInstance: ReadonlyMap<ProviderInstanceId, ReadonlyArray<ModelEsque>>;
  terminalOpen: boolean;
  composerDraftTarget?: ScopedThreadRef | DraftId | undefined;
  onRequestClose?: () => void;
  onInstanceModelChange: (instanceId: ProviderInstanceId, model: string) => void;
}) {
  const {
    keybindings: providedKeybindings,
    modelOptionsByInstance,
    instanceEntries,
    onInstanceModelChange,
  } = props;
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRegionRef = useRef<HTMLDivElement>(null);
  const highlightedModelKeyRef = useRef<string | null>(null);
  const favorites = useSettings((s) => s.favorites ?? []);
  const [selectedInstanceId, setSelectedInstanceId] = useState<ProviderInstanceId | "favorites">(
    () => {
      if (props.lockedProvider !== null) {
        // When locked, prime the sidebar to the currently-active instance
        // so jumping into the picker keeps the focused instance visible.
        return props.activeInstanceId;
      }
      return favorites.length > 0 ? "favorites" : props.activeInstanceId;
    },
  );
  const keybindings = useMemo<ResolvedKeybindingsConfig>(
    () => providedKeybindings ?? [],
    [providedKeybindings],
  );
  const { updateSettings } = useUpdateSettings();

  const focusSearchInput = useCallback(() => {
    searchInputRef.current?.focus({ preventScroll: true });
  }, []);

  const handleSelectInstance = useCallback(
    (instanceId: ProviderInstanceId | "favorites") => {
      setSelectedInstanceId(instanceId);
      window.requestAnimationFrame(() => {
        focusSearchInput();
      });
    },
    [focusSearchInput],
  );

  useLayoutEffect(() => {
    focusSearchInput();
    const frame = window.requestAnimationFrame(() => {
      focusSearchInput();
    });
    const timeout = window.setTimeout(() => {
      focusSearchInput();
    }, 0);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, [focusSearchInput]);

  // Create a Set for efficient lookup. Favorites are keyed by
  // `${instanceId}:${slug}`; the storage schema widened from ProviderDriverKind
  // to ProviderInstanceId so pre-migration favorites keyed by driver slugs
  // (e.g. `"codex:gpt-5"`) still resolve — the default instance id equals
  // the driver slug.
  const favoritesSet = useMemo(() => {
    return new Set(favorites.map((fav) => providerModelKey(fav.provider, fav.model)));
  }, [favorites]);

  /**
   * Lookup table keyed by `instanceId`. Used for display name + driver
   * kind enrichment and for `ready`/enabled filtering before flattening
   * models into the search list.
   */
  const entryByInstanceId = useMemo(
    () => new Map(instanceEntries.map((entry) => [entry.instanceId, entry])),
    [instanceEntries],
  );

  const [selectedModelForThinking, setSelectedModelForThinking] = useState<{
    instanceId: ProviderInstanceId;
    slug: string;
  } | null>(null);

  const dummyTarget = useMemo(() => "dummy-target" as DraftId, []);
  const composerDraft = useComposerThreadDraft(props.composerDraftTarget ?? dummyTarget);
  const setProviderModelOptions = useComposerDraftStore((store) => store.setProviderModelOptions);

  const thinkingModelEntry = useMemo(() => {
    if (!selectedModelForThinking) return null;
    return entryByInstanceId.get(selectedModelForThinking.instanceId) ?? null;
  }, [selectedModelForThinking, entryByInstanceId]);

  const currentModelOptions = useMemo(() => {
    if (!selectedModelForThinking || !props.composerDraftTarget) return null;
    return (
      composerDraft?.modelSelectionByProvider[selectedModelForThinking.instanceId]?.options ?? null
    );
  }, [selectedModelForThinking, props.composerDraftTarget, composerDraft]);

  const caps = useMemo(() => {
    if (!selectedModelForThinking || !thinkingModelEntry) return null;
    return getProviderModelCapabilities(
      thinkingModelEntry.models,
      selectedModelForThinking.slug,
      thinkingModelEntry.driverKind,
    );
  }, [selectedModelForThinking, thinkingModelEntry]);

  const descriptors = useMemo(() => {
    if (!selectedModelForThinking || !caps) return [];
    return getProviderOptionDescriptors({
      caps,
      selections: currentModelOptions,
    });
  }, [selectedModelForThinking, caps, currentModelOptions]);

  const updateModelOptions = useCallback(
    (nextOptions: ReadonlyArray<any> | undefined) => {
      if (props.composerDraftTarget && selectedModelForThinking && thinkingModelEntry) {
        setProviderModelOptions(
          props.composerDraftTarget,
          thinkingModelEntry.driverKind,
          nextOptions,
          {
            model: selectedModelForThinking.slug,
            persistSticky: true,
          },
        );
      }
    },
    [
      props.composerDraftTarget,
      selectedModelForThinking,
      thinkingModelEntry,
      setProviderModelOptions,
    ],
  );
  const thinkingPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = thinkingPanelRef.current;
    if (!el) return;

    if (selectedModelForThinking) {
      gsap.fromTo(
        el,
        { x: "100%", opacity: 0 },
        {
          x: "0%",
          opacity: 1,
          duration: 0.3,
          ease: "power3.out",
          pointerEvents: "auto",
          overwrite: "auto",
        },
      );
    } else {
      gsap.to(el, {
        x: "100%",
        opacity: 0,
        duration: 0.25,
        ease: "power2.in",
        pointerEvents: "none",
        overwrite: "auto",
      });
    }
  }, [selectedModelForThinking]);

  const matchesLockedProvider = useCallback(
    (entry: Pick<ProviderInstanceEntry, "driverKind" | "continuationGroupKey">): boolean => {
      if (props.lockedProvider === null) return true;
      if (entry.driverKind !== props.lockedProvider) return false;
      if (!props.lockedContinuationGroupKey) return true;
      return entry.continuationGroupKey === props.lockedContinuationGroupKey;
    },
    [props.lockedContinuationGroupKey, props.lockedProvider],
  );

  const readyInstanceSet = useMemo(() => {
    const ready = new Set<ProviderInstanceId>();
    for (const entry of instanceEntries) {
      if (entry.status === "ready") {
        ready.add(entry.instanceId);
      }
    }
    return ready;
  }, [instanceEntries]);

  // Flatten models into a searchable array. One pass over the
  // instance-keyed map; each model carries its instance id + driver kind
  // so the list row can render the right icon and display name without
  // another lookup.
  const flatModels = useMemo(() => {
    const out: ModelPickerItem[] = [];
    for (const [instanceId, models] of modelOptionsByInstance) {
      const entry = entryByInstanceId.get(instanceId);
      if (!entry) {
        // Instance disappeared between renders (configuration change). Skip
        // its models — stale options shouldn't appear in the picker.
        continue;
      }
      if (!readyInstanceSet.has(instanceId)) {
        continue;
      }
      for (const model of models) {
        out.push({
          slug: model.slug,
          name: model.name,
          ...(model.shortName ? { shortName: model.shortName } : {}),
          ...(model.subProvider ? { subProvider: model.subProvider } : {}),
          instanceId,
          driverKind: entry.driverKind,
          instanceDisplayName: entry.displayName,
          ...(entry.accentColor ? { instanceAccentColor: entry.accentColor } : {}),
          ...(entry.continuationGroupKey
            ? { continuationGroupKey: entry.continuationGroupKey }
            : {}),
        });
      }
    }
    return out;
  }, [modelOptionsByInstance, entryByInstanceId, readyInstanceSet]);

  const selectedModelItem = useMemo(() => {
    if (!selectedModelForThinking) return null;
    return flatModels.find(
      (m) =>
        m.instanceId === selectedModelForThinking.instanceId &&
        m.slug === selectedModelForThinking.slug,
    );
  }, [selectedModelForThinking, flatModels]);

  const selectedModelName = selectedModelItem?.name ?? selectedModelForThinking?.slug ?? "";

  const isLocked = props.lockedProvider !== null;
  const isSearching = searchQuery.trim().length > 0;
  const lockedInstanceEntries = useMemo(
    () =>
      props.lockedProvider ? instanceEntries.filter((entry) => matchesLockedProvider(entry)) : [],
    [instanceEntries, matchesLockedProvider, props.lockedProvider],
  );
  const showLockedInstanceSidebar = isLocked && lockedInstanceEntries.length > 1;
  const showSidebar = !isSearching && (!isLocked || showLockedInstanceSidebar);
  const sidebarInstanceEntries = showLockedInstanceSidebar
    ? lockedInstanceEntries
    : instanceEntries;
  const instanceOrder = useMemo(
    () => instanceEntries.map((entry) => entry.instanceId),
    [instanceEntries],
  );

  // Filter models based on search query and selected instance
  const filteredModels = useMemo(() => {
    let result = flatModels;

    // Apply tokenized fuzzy search across the combined provider/model search fields.
    if (searchQuery.trim()) {
      const rankedMatches = result
        .map((model) => ({
          model,
          score: scoreModelPickerSearch(
            {
              name: model.name,
              ...(model.shortName ? { shortName: model.shortName } : {}),
              ...(model.subProvider ? { subProvider: model.subProvider } : {}),
              driverKind: model.driverKind,
              providerDisplayName: model.instanceDisplayName,
              isFavorite: favoritesSet.has(providerModelKey(model.instanceId, model.slug)),
            },
            searchQuery,
          ),
          isFavorite: favoritesSet.has(providerModelKey(model.instanceId, model.slug)),
          tieBreaker: buildModelPickerSearchText({
            name: model.name,
            ...(model.shortName ? { shortName: model.shortName } : {}),
            ...(model.subProvider ? { subProvider: model.subProvider } : {}),
            driverKind: model.driverKind,
            providerDisplayName: model.instanceDisplayName,
          }),
        }))
        .filter(
          (
            rankedModel,
          ): rankedModel is {
            model: ModelPickerItem;
            score: number;
            isFavorite: boolean;
            tieBreaker: string;
          } => rankedModel.score !== null,
        );

      // When searching, we only respect locked provider (by driver kind),
      // ignoring sidebar selection so account-scoped searches can find a
      // model before the user chooses a specific instance rail item.
      if (props.lockedProvider !== null) {
        return rankedMatches
          .filter((rankedModel) => matchesLockedProvider(rankedModel.model))
          .toSorted((a, b) => {
            const scoreDelta = a.score - b.score;
            if (scoreDelta !== 0) {
              return scoreDelta;
            }
            if (a.isFavorite !== b.isFavorite) {
              return a.isFavorite ? -1 : 1;
            }
            return a.tieBreaker.localeCompare(b.tieBreaker);
          })
          .map((rankedModel) => rankedModel.model);
      }

      return rankedMatches
        .toSorted((a, b) => {
          const scoreDelta = a.score - b.score;
          if (scoreDelta !== 0) {
            return scoreDelta;
          }
          if (a.isFavorite !== b.isFavorite) {
            return a.isFavorite ? -1 : 1;
          }
          return a.tieBreaker.localeCompare(b.tieBreaker);
        })
        .map((rankedModel) => rankedModel.model);
    }

    if (props.lockedProvider !== null) {
      result = result.filter((m) => matchesLockedProvider(m));
      if (showLockedInstanceSidebar) {
        result = result.filter((m) => m.instanceId === selectedInstanceId);
      }
    } else if (selectedInstanceId === "favorites") {
      result = result.filter((m) => favoritesSet.has(providerModelKey(m.instanceId, m.slug)));
    } else {
      result = result.filter((m) => m.instanceId === selectedInstanceId);
    }

    return sortProviderModelItems(result, {
      favoriteModelKeys: favoritesSet,
      groupFavorites: selectedInstanceId !== "favorites",
      instanceOrder: selectedInstanceId === "favorites" ? instanceOrder : [],
    });
  }, [
    favoritesSet,
    flatModels,
    instanceOrder,
    matchesLockedProvider,
    props.lockedProvider,
    searchQuery,
    showLockedInstanceSidebar,
    selectedInstanceId,
  ]);

  const handleModelSelect = useCallback(
    (modelSlug: string, instanceId: ProviderInstanceId) => {
      const options = modelOptionsByInstance.get(instanceId);
      if (!options) {
        return;
      }
      const entry = entryByInstanceId.get(instanceId);
      if (!entry) {
        return;
      }
      // `resolveSelectableModel` uses the driver kind for normalization
      // (slug casing etc.). Custom instances share their driver's
      // normalization rules, so pass the driver kind here.
      const resolvedModel = resolveSelectableModel(entry.driverKind, modelSlug, options);
      if (resolvedModel) {
        const supportsTraits =
          props.composerDraftTarget &&
          shouldRenderTraitsControls({
            provider: entry.driverKind,
            models: entry.models,
            model: resolvedModel,
            prompt: "",
            modelOptions: null,
          });

        if (supportsTraits) {
          setSelectedModelForThinking({ instanceId, slug: resolvedModel });
        } else {
          onInstanceModelChange(instanceId, resolvedModel);
        }
      }
    },
    [entryByInstanceId, modelOptionsByInstance, onInstanceModelChange, props.composerDraftTarget],
  );

  const toggleFavorite = useCallback(
    (instanceId: ProviderInstanceId, model: string) => {
      const newFavorites = [...favorites];
      const index = newFavorites.findIndex((f) => f.provider === instanceId && f.model === model);
      if (index >= 0) {
        newFavorites.splice(index, 1);
      } else {
        newFavorites.push({ provider: instanceId, model });
      }
      updateSettings({ favorites: newFavorites });
    },
    [favorites, updateSettings],
  );

  const LockedProviderIcon =
    isLocked && props.lockedProvider ? PROVIDER_ICON_BY_PROVIDER[props.lockedProvider] : null;
  // Header label for locked mode. Use the active instance's displayName
  // when the lock narrows to exactly one instance (so "Codex Personal"
  // shows instead of the generic driver label); fall back to the first
  // matching entry otherwise.
  const lockedHeaderLabel = useMemo(() => {
    if (!isLocked || !props.lockedProvider) return null;
    const matches = instanceEntries.filter((entry) => matchesLockedProvider(entry));
    if (matches.length === 0) return null;
    const active = matches.find((entry) => entry.instanceId === props.activeInstanceId);
    return (active ?? matches[0])?.displayName ?? null;
  }, [
    isLocked,
    matchesLockedProvider,
    props.lockedProvider,
    props.activeInstanceId,
    instanceEntries,
  ]);
  const modelJumpCommandByKey = useMemo(() => {
    const mapping = new Map<
      string,
      NonNullable<ReturnType<typeof modelPickerJumpCommandForIndex>>
    >();
    for (const [visibleModelIndex, model] of filteredModels.entries()) {
      const jumpCommand = modelPickerJumpCommandForIndex(visibleModelIndex);
      if (!jumpCommand) {
        return mapping;
      }
      mapping.set(`${model.instanceId}:${model.slug}`, jumpCommand);
    }
    return mapping;
  }, [filteredModels]);
  const modelJumpModelKeys = useMemo(
    () => [...modelJumpCommandByKey.keys()],
    [modelJumpCommandByKey],
  );
  const allModelKeys = useMemo(
    (): string[] => flatModels.map((model) => `${model.instanceId}:${model.slug}`),
    [flatModels],
  );
  const filteredModelKeys = useMemo(
    (): string[] => filteredModels.map((model) => `${model.instanceId}:${model.slug}`),
    [filteredModels],
  );
  const filteredModelByKey = useMemo(
    (): ReadonlyMap<string, ModelPickerItem> =>
      new Map(filteredModels.map((model) => [`${model.instanceId}:${model.slug}`, model] as const)),
    [filteredModels],
  );
  const modelJumpShortcutContext = useMemo(
    () =>
      ({
        terminalFocus: false,
        terminalOpen: props.terminalOpen,
        modelPickerOpen: true,
      }) as const,
    [props.terminalOpen],
  );
  const modelJumpLabelByKey = useMemo((): ReadonlyMap<string, string> => {
    if (modelJumpCommandByKey.size === 0) {
      return EMPTY_MODEL_JUMP_LABELS;
    }
    const shortcutLabelOptions = {
      platform: navigator.platform,
      context: modelJumpShortcutContext,
    };
    const mapping = new Map<string, string>();
    for (const [modelKey, command] of modelJumpCommandByKey) {
      const label = shortcutLabelForCommand(keybindings, command, shortcutLabelOptions);
      if (label) {
        mapping.set(modelKey, label);
      }
    }
    return mapping.size > 0 ? mapping : EMPTY_MODEL_JUMP_LABELS;
  }, [keybindings, modelJumpCommandByKey, modelJumpShortcutContext]);

  useEffect(() => {
    const onWindowKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) {
        return;
      }

      const command = resolveShortcutCommand(event, keybindings, {
        platform: navigator.platform,
        context: modelJumpShortcutContext,
      });
      const jumpIndex = modelPickerJumpIndexFromCommand(command ?? "");
      if (jumpIndex === null) {
        return;
      }

      const targetModelKey = modelJumpModelKeys[jumpIndex];
      if (!targetModelKey) {
        return;
      }
      const { instanceId, slug } = splitInstanceModelKey(targetModelKey);
      event.preventDefault();
      event.stopPropagation();
      handleModelSelect(slug, instanceId);
    };

    window.addEventListener("keydown", onWindowKeyDown, true);

    return () => {
      window.removeEventListener("keydown", onWindowKeyDown, true);
    };
  }, [handleModelSelect, keybindings, modelJumpModelKeys, modelJumpShortcutContext]);

  useLayoutEffect(() => {
    const listRegion = listRegionRef.current;
    if (!listRegion) {
      return;
    }

    let cancelled = false;
    let frame = 0;
    let nestedFrame = 0;
    let timeout = 0;

    const measureScrollArea = () => {
      if (cancelled) {
        return;
      }
      const viewport = listRegion.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]');
      if (!viewport || viewport.scrollHeight <= viewport.clientHeight) {
        return;
      }
      const originalScrollTop = viewport.scrollTop;
      const maxScrollTop = viewport.scrollHeight - viewport.clientHeight;
      if (maxScrollTop <= 0) {
        return;
      }
      viewport.scrollTop = Math.min(originalScrollTop + 1, maxScrollTop);
      viewport.scrollTop = originalScrollTop;
    };

    queueMicrotask(measureScrollArea);
    frame = window.requestAnimationFrame(() => {
      measureScrollArea();
      nestedFrame = window.requestAnimationFrame(measureScrollArea);
    });
    timeout = window.setTimeout(measureScrollArea, 0);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      window.cancelAnimationFrame(nestedFrame);
      window.clearTimeout(timeout);
    };
  }, [filteredModelKeys]);

  useEffect(() => {
    const listRegion = listRegionRef.current;
    if (!listRegion) return;

    const rows = listRegion.querySelectorAll<HTMLDivElement>(
      "[data-slot] > div, .model-picker-row, [role='option']",
    );

    if (rows.length === 0) return;

    gsap.fromTo(
      rows,
      { opacity: 0, y: 16 },
      {
        opacity: 1,
        y: 0,
        duration: 0.35,
        stagger: 0.04,
        ease: "power3.out",
        overwrite: "auto",
      },
    );

    return () => {
      gsap.killTweensOf(rows);
    };
  }, [filteredModelKeys]);

  return (
    <TooltipProvider data-pipper-id="model-picker-content" delay={0}>
      <div
        data-pipper-id="model-picker-shell"
        className={cn(
          "relative flex h-screen max-h-96 w-screen max-w-100 overflow-hidden rounded-none border bg-popover not-dark:bg-clip-padding text-popover-foreground shadow-lg/5 before:pointer-events-none before:absolute before:inset-0 before:rounded-none before:shadow-[0_1px_--theme(--color-black/4%)] dark:before:shadow-[0_-1px_--theme(--color-white/6%)]",
          isLocked && !showLockedInstanceSidebar ? "flex-col" : "flex-row",
        )}
      >
        {/* Locked provider header (only shown in locked mode) */}
        {isLocked && !showLockedInstanceSidebar && LockedProviderIcon && lockedHeaderLabel && (
          <div
            data-pipper-id="model-picker-locked-header"
            className="flex items-center gap-2 px-4 py-3 border-b"
          >
            <LockedProviderIcon className="size-5 shrink-0" />
            <span className="font-medium text-sm">{lockedHeaderLabel}</span>
          </div>
        )}

        {/* Sidebar (only in unlocked mode) */}
        {showSidebar && (
          <ModelPickerSidebar
            selectedInstanceId={selectedInstanceId}
            onSelectInstance={handleSelectInstance}
            instanceEntries={sidebarInstanceEntries}
            showFavorites={!isLocked}
            showComingSoon={!isLocked}
          />
        )}

        {/* Main content area */}
        <Combobox
          inline
          items={allModelKeys}
          filteredItems={filteredModelKeys}
          filter={null}
          autoHighlight
          open
          value={`${props.activeInstanceId}:${props.model}`}
          onItemHighlighted={(modelKey) => {
            highlightedModelKeyRef.current = typeof modelKey === "string" ? modelKey : null;
          }}
          onValueChange={(modelKey) => {
            if (typeof modelKey !== "string") {
              return;
            }
            const { instanceId, slug } = splitInstanceModelKey(modelKey);
            handleModelSelect(slug, instanceId);
          }}
        >
          <div
            data-pipper-id="model-picker-main"
            className={cn(
              "flex min-h-0 flex-1 flex-col overflow-hidden",
              isLocked && !showLockedInstanceSidebar ? "min-w-0" : showSidebar && "border-l",
            )}
          >
            {/* Search bar */}
            <div
              data-pipper-id="model-picker-search"
              className="model-picker-search-container border-b px-3 py-2"
            >
              <ComboboxInput
                ref={searchInputRef}
                className="[&_input]:font-sans rounded-none"
                inputClassName="border-0 shadow-none ring-0 focus-visible:ring-0"
                placeholder="Search models..."
                showTrigger={false}
                startAddon={<SearchIcon className="size-4 shrink-0 text-muted-foreground/50" />}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.preventDefault();
                    e.stopPropagation();
                    props.onRequestClose?.();
                    return;
                  }
                  if (e.key === "Enter" && highlightedModelKeyRef.current) {
                    (
                      e as typeof e & { preventBaseUIHandler?: () => void }
                    ).preventBaseUIHandler?.();
                    e.preventDefault();
                    e.stopPropagation();
                    const { instanceId, slug } = splitInstanceModelKey(
                      highlightedModelKeyRef.current,
                    );
                    handleModelSelect(slug, instanceId);
                    return;
                  }
                  e.stopPropagation();
                }}
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
                size="sm"
              />
            </div>

            {/* Model list */}
            <div
              data-pipper-id="model-picker-list-region"
              ref={listRegionRef}
              className="relative min-h-0 flex-1 before:pointer-events-none before:absolute before:inset-0 before:bg-muted/40"
            >
              <ComboboxList
                data-pipper-id="model-picker-list"
                className="model-picker-list size-full divide-y px-2 py-1"
              >
                {filteredModelKeys.map((modelKey, index) => {
                  const model = filteredModelByKey.get(modelKey);
                  if (!model) {
                    return null;
                  }
                  return (
                    <ModelListRow
                      key={modelKey}
                      index={index}
                      model={model}
                      instanceId={model.instanceId}
                      driverKind={model.driverKind}
                      providerDisplayName={model.instanceDisplayName}
                      providerAccentColor={model.instanceAccentColor}
                      isFavorite={favoritesSet.has(modelKey)}
                      showProvider={!isLocked || showLockedInstanceSidebar}
                      preferShortName={!isLocked}
                      useTriggerLabel={isLocked && !showLockedInstanceSidebar}
                      showNewBadge={isModelPickerNewModel(model.driverKind, model.slug)}
                      jumpLabel={modelJumpLabelByKey.get(modelKey) ?? null}
                      onToggleFavorite={() => toggleFavorite(model.instanceId, model.slug)}
                    />
                  );
                })}
              </ComboboxList>
            </div>
            <ComboboxEmpty className="not-empty:py-6 empty:h-0 text-xs font-normal leading-snug">
              No models found
            </ComboboxEmpty>
          </div>
        </Combobox>

        {/* Thinking overlay panel */}
        <div
          data-pipper-id="model-picker-options-overlay"
          ref={thinkingPanelRef}
          className="absolute inset-0 z-50 flex flex-col bg-popover translate-x-full opacity-0 pointer-events-none"
        >
          {selectedModelForThinking && (
            <div
              data-pipper-id="model-picker-options-panel"
              className="flex flex-col h-full w-full bg-popover text-popover-foreground"
            >
              {/* Header */}
              <div
                data-pipper-id="model-picker-options-header"
                className="flex items-center gap-2 border-b px-4 py-3 bg-muted/20"
              >
                <button
                  onClick={() => setSelectedModelForThinking(null)}
                  className="p-1 -ml-1 rounded-none text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  aria-label="Back to models list"
                >
                  <ChevronLeftIcon className="size-4" />
                </button>
                <div className="flex flex-col min-w-0">
                  <span className="font-semibold text-sm truncate">{selectedModelName}</span>
                  <span className="text-xs text-muted-foreground truncate">
                    Choose reasoning level
                  </span>
                </div>
              </div>

              {/* Content */}
              <div
                data-pipper-id="model-picker-options-content"
                className="flex-1 overflow-y-auto px-4 py-3 space-y-4"
              >
                {descriptors.map((descriptor) => {
                  if (descriptor.type === "select") {
                    return (
                      <div
                        data-pipper-id="model-picker-options-select-group"
                        key={descriptor.id}
                        className="space-y-1.5"
                      >
                        <span className="text-xs font-medium text-muted-foreground">
                          {descriptor.label}
                        </span>
                        <div
                          data-pipper-id="model-picker-options-select-list"
                          className="grid grid-cols-1 gap-1"
                        >
                          {descriptor.options.map((option) => {
                            const isSelected =
                              getProviderOptionCurrentValue(descriptor) === option.id;
                            return (
                              <button
                                data-pipper-id="model-picker-options-select-option"
                                key={option.id}
                                onClick={() => {
                                  const nextDescriptors = replaceDescriptorCurrentValue(
                                    descriptors,
                                    descriptor.id,
                                    option.id,
                                  );
                                  const nextOptions =
                                    buildProviderOptionSelectionsFromDescriptors(nextDescriptors);
                                  updateModelOptions(nextOptions);
                                  onInstanceModelChange(
                                    selectedModelForThinking.instanceId,
                                    selectedModelForThinking.slug,
                                  );
                                }}
                                className={cn(
                                  "flex items-center justify-between px-3 py-2.5 rounded-none border text-left text-sm font-medium transition-all duration-200",
                                  isSelected
                                    ? "bg-primary/10 border-primary text-primary shadow-sm"
                                    : "bg-transparent border-border/60 hover:bg-muted hover:border-border text-foreground/80 hover:text-foreground",
                                )}
                              >
                                <span>{option.label}</span>
                                <div className="flex items-center gap-1.5">
                                  {option.isDefault && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-none bg-muted text-muted-foreground uppercase font-semibold tracking-wider">
                                      Default
                                    </span>
                                  )}
                                  {isSelected && (
                                    <CheckIcon className="size-4 text-primary shrink-0" />
                                  )}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  } else if (descriptor.type === "boolean") {
                    const isChecked = descriptor.currentValue === true;
                    return (
                      <div
                        data-pipper-id="model-picker-options-boolean-row"
                        key={descriptor.id}
                        className="flex items-center justify-between p-3 rounded-none border border-border/60 bg-transparent"
                      >
                        <div className="flex flex-col">
                          <span className="text-sm font-medium">{descriptor.label}</span>
                        </div>
                        <Switch
                          checked={isChecked}
                          onCheckedChange={(checked) => {
                            const nextDescriptors = replaceDescriptorCurrentValue(
                              descriptors,
                              descriptor.id,
                              checked,
                            );
                            const nextOptions =
                              buildProviderOptionSelectionsFromDescriptors(nextDescriptors);
                            updateModelOptions(nextOptions);
                          }}
                        />
                      </div>
                    );
                  }
                  return null;
                })}
              </div>

              {/* Footer */}
              <div
                data-pipper-id="model-picker-options-footer"
                className="border-t p-3 bg-muted/10 flex items-center justify-end gap-2"
              >
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    onInstanceModelChange(
                      selectedModelForThinking.instanceId,
                      selectedModelForThinking.slug,
                    );
                  }}
                >
                  Confirm
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
});
