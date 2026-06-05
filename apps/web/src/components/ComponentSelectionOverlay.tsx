import { useEffect, useLayoutEffect, useState, useRef, useCallback, useMemo } from "react";
import { CheckIcon, GripVertical, Loader2Icon, X, XIcon } from "lucide-react";
import { scopeThreadRef } from "@t3tools/client-runtime";
import { ProviderInstanceId, type ModelSelection, type ScopedThreadRef } from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import { useShallow } from "zustand/react/shallow";

import { type ComponentRegistryEntry, findNearestRegisteredComponent } from "../componentSelection";
import { readEnvironmentApi } from "../environmentApi";
import { useEvolutionStore } from "../evolutionStore";
import { usePrimaryEnvironmentId } from "../environments/primary";
import { useSettings } from "../hooks/useSettings";
import { IMPROVE_WORKSPACE_ROOT } from "../hooks/useOpenImproveSpace";
import { findProjectByPath, inferProjectTitleFromPath } from "../lib/projectPaths";
import { getAppModelOptionsForInstance, type AppModelOption } from "../modelSelection";
import { deriveProviderInstanceEntries, sortProviderInstanceEntries } from "../providerInstances";
import { selectEnvironmentState, selectProjectsAcrossEnvironments, useStore } from "../store";
import { createThreadSelectorByRef } from "../storeSelectors";
import { useServerProviders } from "../rpc/serverState";
import { cn, newCommandId, newMessageId, newProjectId, newThreadId } from "~/lib/utils";
import { ProviderModelPicker } from "./chat/ProviderModelPicker";
import { EvolutionOnboarding } from "./EvolutionOnboarding";
import { ImproveEvolutionActions } from "./ImproveEvolutionActions";
import { toastManager, stackedThreadToast } from "./ui/toast";

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

type SelectionRunStatus = "idle" | "running" | "completed" | "failed";

interface SelectedTarget {
  readonly element: HTMLElement;
  readonly entry: ComponentRegistryEntry;
}

interface PromptAnchor {
  readonly x: number;
  readonly y: number;
}

declare global {
  interface WindowEventMap {
    "pipper:component-selected": CustomEvent<ComponentRegistryEntry>;
    "pipper:set-improve-mode": CustomEvent<{ active: boolean }>;
  }
}

function buildComponentImprovePrompt(input: {
  readonly userPrompt: string;
  readonly entry: ComponentRegistryEntry;
  readonly workspaceRoot: string;
}): string {
  const { userPrompt, entry, workspaceRoot } = input;
  return [
    "Improve the selected Pipper UI component.",
    "",
    "User request:",
    userPrompt,
    "",
    "Selected component metadata:",
    "```json",
    JSON.stringify(
      {
        dataPipperId: entry.id,
        name: entry.name,
        location: entry.location,
        usedIn: entry.usedIn,
        children: entry.children,
        workspaceRoot,
      },
      null,
      2,
    ),
    "```",
    "",
    "Work only on the selected component target and the directly related files needed for that request. Keep the change scoped, preserve existing behavior, and do not commit changes.",
  ].join("\n");
}

function readDesktopBridge() {
  if (typeof window === "undefined") {
    return undefined;
  }
  return window.desktopBridge;
}

async function checkWorkspaceExists(): Promise<boolean> {
  const bridge = readDesktopBridge();
  if (bridge && "getEvolutionWorkspaceStatus" in bridge && bridge.getEvolutionWorkspaceStatus) {
    const status = await bridge.getEvolutionWorkspaceStatus();
    return status.exists;
  }

  if (bridge?.ensureEvolutionWorkspace) {
    const result = await bridge.ensureEvolutionWorkspace();
    return result.existed;
  }

  return false;
}

async function waitForEnvironmentBootstrap(environmentId: string): Promise<void> {
  if (selectEnvironmentState(useStore.getState(), environmentId as any).bootstrapComplete) {
    return;
  }

  await new Promise<void>((resolve) => {
    const unsubscribe = useStore.subscribe((state) => {
      if (selectEnvironmentState(state, environmentId as any).bootstrapComplete) {
        unsubscribe();
        resolve();
      }
    });
  });
}

function isToggleImproveShortcut(event: KeyboardEvent): boolean {
  const key = event.key.toLowerCase();
  return (
    (key === "e" && event.altKey && !event.metaKey && !event.ctrlKey && !event.shiftKey) ||
    (key === "b" && event.altKey && !event.metaKey && !event.ctrlKey && !event.shiftKey) ||
    (key === "e" && event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey)
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

function isSelectionOverlayUiTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }
  return (
    target.closest("[data-pipper-selection-ui]") !== null ||
    target.closest(
      [
        "[data-pipper-id='provider-model-picker']",
        "[data-pipper-id='provider-model-picker-trigger']",
        "[data-pipper-id='provider-model-picker-popup']",
        "[data-pipper-id^='model-picker']",
      ].join(","),
    ) !== null
  );
}

function displayTextForSelectionRunMessage(text: string): string {
  const userRequestMatch = text.match(
    /(?:^|\n)User request:\n([\s\S]*?)(?:\n\nSelected component metadata:|$)/,
  );
  return userRequestMatch?.[1]?.trim() ?? text;
}

export function ComponentSelectionOverlay() {
  const [selectionMode, setSelectionMode] = useState(false);
  const [hoverTarget, setHoverTarget] = useState<HoverTarget | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<SelectedTarget | null>(null);
  const [hoverBox, setHoverBox] = useState<OverlayBox | null>(null);
  const [selectedBox, setSelectedBox] = useState<OverlayBox | null>(null);
  const [promptAnchor, setPromptAnchor] = useState<PromptAnchor | null>(null);
  const [componentPrompt, setComponentPrompt] = useState("");
  const [selectionFollowUpPrompt, setSelectionFollowUpPrompt] = useState("");
  const [isSendingSelectionFollowUp, setIsSendingSelectionFollowUp] = useState(false);
  const [isSelectionRunPanelHidden, setIsSelectionRunPanelHidden] = useState(false);
  const [selectionRunStatus, setSelectionRunStatus] = useState<SelectionRunStatus>("idle");
  const [selectionRunMessage, setSelectionRunMessage] = useState<string | null>(null);
  const [selectionRunThreadRef, setSelectionRunThreadRef] = useState<ScopedThreadRef | null>(null);
  const [componentModelSelection, setComponentModelSelection] = useState<ModelSelection | null>(
    null,
  );
  const selectionRunPanelScrollRef = useRef<HTMLDivElement | null>(null);
  const selectionRunFailureToastKeyRef = useRef<string | null>(null);

  const settings = useSettings();
  const workspaceStatus = useEvolutionStore((s) => s.workspaceStatus);
  const setWorkspaceStatus = useEvolutionStore((s) => s.setWorkspaceStatus);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isCheckingWorkspace, setIsCheckingWorkspace] = useState(false);
  const [isDraggingFloatingBar, setIsDraggingFloatingBar] = useState(false);
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const projects = useStore(useShallow(selectProjectsAcrossEnvironments));
  const providers = useServerProviders();
  const selectionRunThreadSelector = useMemo(
    () => createThreadSelectorByRef(selectionRunThreadRef),
    [selectionRunThreadRef],
  );
  const selectionRunThread = useStore(selectionRunThreadSelector);
  const selectionRunSessionStatus = selectionRunThread?.session?.status ?? null;
  const selectionRunMessages = selectionRunThread?.messages ?? [];
  const selectionRunActivities = selectionRunThread?.activities ?? [];
  const latestSelectionRunTurnState = selectionRunThread?.latestTurn?.state ?? null;
  const latestSelectionRunMessageText =
    selectionRunMessages[selectionRunMessages.length - 1]?.text ?? "";
  const hasStreamingSelectionRunMessage = selectionRunMessages.some((message) => message.streaming);
  const hasAssistantSelectionRunMessage = selectionRunMessages.some(
    (message) => message.role === "assistant",
  );
  const selectionRunFailureMessage =
    selectionRunThread?.error ??
    selectionRunThread?.session?.lastError ??
    (latestSelectionRunTurnState === "error" ? "The background agent run failed." : null);
  const selectionRunPendingStart =
    selectionRunStatus === "running" &&
    selectionRunThreadRef !== null &&
    (selectionRunThread === undefined ||
      (selectionRunThread.latestTurn === null &&
        selectionRunMessages.length === 0 &&
        selectionRunActivities.length === 0));
  const selectionRunActivelyWorking =
    selectionRunPendingStart ||
    latestSelectionRunTurnState === "running" ||
    selectionRunSessionStatus === "running" ||
    selectionRunSessionStatus === "connecting" ||
    hasStreamingSelectionRunMessage;
  const canSendSelectionFollowUp =
    selectionRunThreadRef !== null &&
    selectionRunThread !== undefined &&
    !selectionRunActivelyWorking &&
    !isSendingSelectionFollowUp;
  const selectionRunModelSelection = useMemo(() => {
    const improveProject = findProjectByPath(projects, IMPROVE_WORKSPACE_ROOT);
    if (improveProject?.defaultModelSelection) {
      return improveProject.defaultModelSelection;
    }

    const codexProvider =
      providers.find((provider) => provider.enabled && provider.driver === "codex") ??
      providers.find((provider) => provider.enabled);
    const model = codexProvider?.models?.[0]?.name;
    if (codexProvider && model) {
      return createModelSelection(codexProvider.instanceId, model);
    }
    return createModelSelection(ProviderInstanceId.make("codex"), "gpt-5");
  }, [projects, providers]);
  const providerInstanceEntries = useMemo(
    () =>
      sortProviderInstanceEntries(deriveProviderInstanceEntries(providers)).filter(
        (entry) => entry.enabled && entry.isAvailable,
      ),
    [providers],
  );
  const modelOptionsByInstance = useMemo<
    ReadonlyMap<ProviderInstanceId, ReadonlyArray<AppModelOption>>
  >(() => {
    const out = new Map<ProviderInstanceId, ReadonlyArray<AppModelOption>>();
    for (const entry of providerInstanceEntries) {
      out.set(entry.instanceId, getAppModelOptionsForInstance(settings, entry));
    }
    return out;
  }, [providerInstanceEntries, settings]);
  const effectiveSelectionRunModelSelection = useMemo(() => {
    const requestedSelection = componentModelSelection ?? selectionRunModelSelection;
    const requestedOptions = modelOptionsByInstance.get(requestedSelection.instanceId) ?? [];
    if (requestedOptions.some((option) => option.slug === requestedSelection.model)) {
      return requestedSelection;
    }

    const requestedEntry = providerInstanceEntries.find(
      (entry) => entry.instanceId === requestedSelection.instanceId,
    );
    if (requestedEntry && requestedOptions[0]) {
      return createModelSelection(requestedEntry.instanceId, requestedOptions[0].slug);
    }

    for (const entry of providerInstanceEntries) {
      const options = modelOptionsByInstance.get(entry.instanceId) ?? [];
      if (options[0]) {
        return createModelSelection(entry.instanceId, options[0].slug);
      }
    }

    return requestedSelection;
  }, [
    componentModelSelection,
    modelOptionsByInstance,
    providerInstanceEntries,
    selectionRunModelSelection,
  ]);
  const activeModelPickerEntry =
    providerInstanceEntries.find(
      (entry) => entry.instanceId === effectiveSelectionRunModelSelection.instanceId,
    ) ?? providerInstanceEntries[0];
  const activeModelPickerInstanceId =
    activeModelPickerEntry?.instanceId ?? effectiveSelectionRunModelSelection.instanceId;
  const activeModelPickerModelOptions =
    modelOptionsByInstance.get(activeModelPickerInstanceId) ?? [];
  const activeModelPickerModel = activeModelPickerModelOptions.some(
    (option) => option.slug === effectiveSelectionRunModelSelection.model,
  )
    ? effectiveSelectionRunModelSelection.model
    : (activeModelPickerModelOptions[0]?.slug ?? effectiveSelectionRunModelSelection.model);

  const ensureImproveProject = useCallback(async () => {
    if (!primaryEnvironmentId) {
      throw new Error("Connect a local environment before starting Component Improve.");
    }

    await window.desktopBridge?.ensureEvolutionWorkspace?.();
    await waitForEnvironmentBootstrap(primaryEnvironmentId);

    const existing = findProjectByPath(
      selectProjectsAcrossEnvironments(useStore.getState()).filter(
        (project) => project.environmentId === primaryEnvironmentId,
      ),
      IMPROVE_WORKSPACE_ROOT,
    );
    if (existing) {
      return existing;
    }

    const api = readEnvironmentApi(primaryEnvironmentId);
    if (!api) {
      throw new Error("Local environment API is unavailable.");
    }

    const projectId = newProjectId();
    await api.orchestration.dispatchCommand({
      type: "project.create",
      commandId: newCommandId(),
      projectId,
      title: inferProjectTitleFromPath(IMPROVE_WORKSPACE_ROOT),
      workspaceRoot: IMPROVE_WORKSPACE_ROOT,
      createWorkspaceRootIfMissing: true,
      defaultModelSelection: effectiveSelectionRunModelSelection,
      createdAt: new Date().toISOString(),
    });

    return {
      id: projectId,
      environmentId: primaryEnvironmentId,
      name: inferProjectTitleFromPath(IMPROVE_WORKSPACE_ROOT),
      cwd: IMPROVE_WORKSPACE_ROOT,
      defaultModelSelection: effectiveSelectionRunModelSelection,
      scripts: [],
    };
  }, [effectiveSelectionRunModelSelection, primaryEnvironmentId]);

  // Keybindings listener
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isToggleImproveShortcut(event)) {
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

  // Global event listener to set improve mode explicitly
  useEffect(() => {
    const handleSetEvent = (event: Event) => {
      const customEvent = event as CustomEvent<{ active: boolean }>;
      setSelectionMode(customEvent.detail.active);
    };

    window.addEventListener("pipper:set-improve-mode" as any, handleSetEvent);
    return () => {
      window.removeEventListener("pipper:set-improve-mode" as any, handleSetEvent);
    };
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    const active = selectionMode && !showOnboarding;
    document.documentElement.classList.toggle("improve-space-cursor", active);
    return () => {
      document.documentElement.classList.remove("improve-space-cursor");
    };
  }, [selectionMode, showOnboarding]);

  useEffect(() => {
    if (selectionMode) {
      return;
    }
    setPromptAnchor(null);
  }, [selectionMode]);

  // Check evolution workspace exists when mode is active
  useEffect(() => {
    if (!selectionMode) {
      setShowOnboarding(false);
      setIsCheckingWorkspace(false);
      return;
    }

    let cancelled = false;
    setIsCheckingWorkspace(true);

    void (async () => {
      try {
        const exists = await checkWorkspaceExists();
        if (cancelled) return;

        if (exists) {
          setWorkspaceStatus({
            exists: true,
            hasGit: true,
            hasDependencies: true,
            localVersion: null,
            workspaceRoot: IMPROVE_WORKSPACE_ROOT,
          });
          setShowOnboarding(false);
        } else {
          setWorkspaceStatus({
            exists: false,
            hasGit: false,
            hasDependencies: false,
            localVersion: null,
            workspaceRoot: IMPROVE_WORKSPACE_ROOT,
          });
          setShowOnboarding(true);
        }
      } catch (error) {
        if (!cancelled) {
          toastManager.add(
            stackedThreadToast({
              type: "error",
              title: "Failed to initialize Improve Space",
              description: error instanceof Error ? error.message : "An error occurred.",
            }),
          );
          setSelectionMode(false);
        }
      } finally {
        if (!cancelled) {
          setIsCheckingWorkspace(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectionMode, setWorkspaceStatus]);

  // Handle onboarding complete
  const handleSetupComplete = useCallback(() => {
    setShowOnboarding(false);
    setWorkspaceStatus({
      exists: true,
      hasGit: true,
      hasDependencies: true,
      localVersion: null,
      workspaceRoot: IMPROVE_WORKSPACE_ROOT,
    });
  }, [setWorkspaceStatus]);

  const selectionRunLocked = selectionRunStatus === "running" || selectionRunStatus === "completed";

  // Mouse hover tracking (temporarily disabled when dragging the floating bar)
  useEffect(() => {
    if (!selectionMode || showOnboarding || isDraggingFloatingBar) {
      setHoverTarget(null);
      setHoverBox(null);
      return;
    }

    const onPointerMove = (event: PointerEvent) => {
      if (isSelectionOverlayUiTarget(event.target)) {
        setHoverTarget(null);
        return;
      }
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
      if (isSelectionOverlayUiTarget(event.target)) {
        return;
      }
      const nearestComponent = findNearestRegisteredComponent(event.target);
      if (!nearestComponent) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      if (selectionRunLocked) {
        return;
      }
      setSelectedTarget({
        element: nearestComponent.element,
        entry: nearestComponent.entry,
      });
      setSelectedBox(overlayBoxForElement(nearestComponent.element));
      setPromptAnchor({ x: event.clientX, y: event.clientY });
      setComponentPrompt("");
      setSelectionFollowUpPrompt("");
      setIsSelectionRunPanelHidden(false);
      selectionRunFailureToastKeyRef.current = null;
      setSelectionRunStatus("idle");
      setSelectionRunMessage(null);
      setSelectionRunThreadRef(null);
      window.dispatchEvent(
        new CustomEvent("pipper:component-selected", {
          detail: nearestComponent.entry,
        }),
      );
    };

    window.addEventListener("pointermove", onPointerMove, { capture: true });
    window.addEventListener("pointerleave", onPointerLeave);
    window.addEventListener("click", onClick, { capture: true });
    return () => {
      window.removeEventListener("pointermove", onPointerMove, {
        capture: true,
      });
      window.removeEventListener("pointerleave", onPointerLeave);
      window.removeEventListener("click", onClick, { capture: true });
    };
  }, [selectionMode, showOnboarding, isDraggingFloatingBar, selectionRunLocked]);

  useLayoutEffect(() => {
    if (!selectionMode || !hoverTarget || showOnboarding || isDraggingFloatingBar) {
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
  }, [hoverTarget, selectionMode, showOnboarding, isDraggingFloatingBar]);

  useLayoutEffect(() => {
    if (!selectionMode || !selectedTarget || showOnboarding) {
      setSelectedBox(null);
      return;
    }

    let frame = 0;
    const syncSelectedBox = () => {
      setSelectedBox(overlayBoxForElement(selectedTarget.element));
    };
    const requestSync = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(syncSelectedBox);
    };

    syncSelectedBox();
    window.addEventListener("resize", requestSync);
    window.addEventListener("scroll", requestSync, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", requestSync);
      window.removeEventListener("scroll", requestSync, true);
    };
  }, [selectedTarget, selectionMode, showOnboarding]);

  useEffect(() => {
    if (selectionRunStatus !== "running") {
      return;
    }
    if (selectionRunFailureMessage) {
      setSelectionRunStatus("failed");
      setSelectionRunMessage(selectionRunFailureMessage);
      return;
    }
    if (selectionRunThread === undefined || selectionRunActivelyWorking) {
      return;
    }
    if (selectionRunThread.latestTurn === null && !hasAssistantSelectionRunMessage) {
      return;
    }
    setSelectionRunStatus("completed");
    setSelectionRunMessage("Agent run finished. Review the changes before accepting.");
  }, [
    hasAssistantSelectionRunMessage,
    selectionRunActivelyWorking,
    selectionRunFailureMessage,
    selectionRunStatus,
    selectionRunThread,
  ]);

  useEffect(() => {
    if (!selectionRunFailureMessage) {
      return;
    }
    const toastKey = `${selectionRunThreadRef?.environmentId ?? "unknown"}:${selectionRunThreadRef?.threadId ?? "unknown"}:${selectionRunFailureMessage}`;
    if (selectionRunFailureToastKeyRef.current === toastKey) {
      return;
    }
    selectionRunFailureToastKeyRef.current = toastKey;
    setSelectionRunStatus("failed");
    setSelectionRunMessage(selectionRunFailureMessage);
    toastManager.add(
      stackedThreadToast({
        type: "error",
        title: "Component Improve failed",
        description: selectionRunFailureMessage,
      }),
    );
  }, [selectionRunFailureMessage, selectionRunThreadRef]);

  useLayoutEffect(() => {
    const panel = selectionRunPanelScrollRef.current;
    if (!panel) {
      return;
    }
    panel.scrollTop = panel.scrollHeight;
  }, [
    latestSelectionRunMessageText,
    selectionRunActivities.length,
    selectionRunMessages.length,
    selectionRunThreadRef,
  ]);

  const startSelectionRun = useCallback(async () => {
    const trimmedPrompt = componentPrompt.trim();
    if (!selectedTarget || !trimmedPrompt) {
      return;
    }
    const createdAt = new Date().toISOString();
    setIsSelectionRunPanelHidden(false);
    selectionRunFailureToastKeyRef.current = null;
    setSelectionRunStatus("running");
    setSelectionRunMessage("Starting background agent run in the Improve workspace.");
    try {
      const project = await ensureImproveProject();
      const api = readEnvironmentApi(project.environmentId);
      if (!api) {
        throw new Error("Improve environment is not connected.");
      }

      const threadId = newThreadId();
      const threadRef = scopeThreadRef(project.environmentId, threadId);
      const title = `Improve ${selectedTarget.entry.name}`;

      await api.orchestration.dispatchCommand({
        type: "thread.create",
        commandId: newCommandId(),
        threadId,
        projectId: project.id,
        title,
        modelSelection: effectiveSelectionRunModelSelection,
        runtimeMode: "full-access",
        interactionMode: "default",
        branch: null,
        worktreePath: null,
        createdAt,
      });

      setSelectionRunThreadRef(threadRef);
      setSelectionRunMessage("Thread created. Sending request to the selected model.");

      await api.orchestration.dispatchCommand({
        type: "thread.turn.start",
        commandId: newCommandId(),
        threadId,
        message: {
          messageId: newMessageId(),
          role: "user",
          text: buildComponentImprovePrompt({
            userPrompt: trimmedPrompt,
            entry: selectedTarget.entry,
            workspaceRoot: workspaceStatus?.workspaceRoot ?? IMPROVE_WORKSPACE_ROOT,
          }),
          attachments: [],
        },
        modelSelection: effectiveSelectionRunModelSelection,
        titleSeed: title,
        runtimeMode: "full-access",
        interactionMode: "default",
        createdAt,
      });
      setSelectionRunMessage("Agent is editing the selected component in the background.");
    } catch (error) {
      setSelectionRunStatus("failed");
      setSelectionRunMessage(error instanceof Error ? error.message : "Failed to start agent run.");
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "Failed to start component Improve",
          description: error instanceof Error ? error.message : "An unknown error occurred.",
        }),
      );
    }
  }, [
    componentPrompt,
    ensureImproveProject,
    effectiveSelectionRunModelSelection,
    selectedTarget,
    workspaceStatus?.workspaceRoot,
  ]);

  const rejectSelectionRun = useCallback(() => {
    setSelectionRunStatus("idle");
    setSelectionRunMessage(null);
    setSelectionRunThreadRef(null);
    setSelectionFollowUpPrompt("");
    setIsSelectionRunPanelHidden(false);
    setPromptAnchor(null);
    selectionRunFailureToastKeyRef.current = null;
  }, []);

  const sendSelectionFollowUp = useCallback(async () => {
    const trimmedPrompt = selectionFollowUpPrompt.trim();
    if (!trimmedPrompt || !selectionRunThreadRef || !selectionRunThread) {
      return;
    }
    if (selectionRunActivelyWorking || isSendingSelectionFollowUp) {
      return;
    }

    const api = readEnvironmentApi(selectionRunThreadRef.environmentId);
    if (!api) {
      setSelectionRunMessage("Improve environment is not connected.");
      return;
    }

    setIsSendingSelectionFollowUp(true);
    setIsSelectionRunPanelHidden(false);
    setSelectionRunStatus("running");
    setSelectionRunMessage("Sending follow-up to the background agent.");
    try {
      await api.orchestration.dispatchCommand({
        type: "thread.turn.start",
        commandId: newCommandId(),
        threadId: selectionRunThreadRef.threadId,
        message: {
          messageId: newMessageId(),
          role: "user",
          text: trimmedPrompt,
          attachments: [],
        },
        modelSelection: selectionRunThread.modelSelection,
        titleSeed: selectionRunThread.title,
        runtimeMode: selectionRunThread.runtimeMode,
        interactionMode: selectionRunThread.interactionMode,
        createdAt: new Date().toISOString(),
      });
      setSelectionFollowUpPrompt("");
      setSelectionRunMessage("Agent is continuing in the background.");
    } catch (error) {
      setSelectionRunStatus("failed");
      setSelectionRunMessage(
        error instanceof Error ? error.message : "Failed to send the follow-up prompt.",
      );
    } finally {
      setIsSendingSelectionFollowUp(false);
    }
  }, [
    isSendingSelectionFollowUp,
    selectionRunActivelyWorking,
    selectionFollowUpPrompt,
    selectionRunThread,
    selectionRunThreadRef,
  ]);

  const activeHover =
    selectionMode && hoverBox && hoverTarget && !showOnboarding && !isDraggingFloatingBar;
  const showFloatingBar = selectionMode && !showOnboarding && !isCheckingWorkspace;
  const selectionRunUserPromptText =
    selectionRunMessages.find((message) => message.role === "user")?.text ?? componentPrompt;
  const selectionRunAssistantText = selectionRunMessages
    .filter((message) => message.role === "assistant")
    .map((message) => displayTextForSelectionRunMessage(message.text))
    .filter((text) => text.trim().length > 0)
    .join("\n\n");
  const selectionRunPanelStatusText =
    selectionRunFailureMessage || selectionRunStatus === "failed"
      ? (selectionRunFailureMessage ?? "The background agent run failed.")
      : selectionRunAssistantText ||
        (selectionRunActivelyWorking
          ? selectionRunPendingStart
            ? "Starting request..."
            : "The agent is working..."
          : selectionRunStatus === "completed"
            ? "Agent run finished. Review the changes before accepting."
            : "Waiting for the agent response...");

  return (
    <>
      {/* Selection Onboarding Modal */}
      {showOnboarding && (
        <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/60 backdrop-blur-md">
          <div className="w-full max-w-lg p-4 relative">
            <button
              onClick={() => setSelectionMode(false)}
              className="absolute top-8 right-8 text-muted-foreground/60 hover:text-foreground z-10 p-2 rounded-full hover:bg-white/10"
              aria-label="Close onboarding"
            >
              <XIcon className="size-5" />
            </button>
            <EvolutionOnboarding
              onSetupComplete={handleSetupComplete}
              onRetry={() => setShowOnboarding(true)}
            />
          </div>
        </div>
      )}

      {/* Hover Highlighter */}
      {activeHover && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-[2147483647]"
          data-pipper-selection-overlay=""
        >
          <div
            className={[
              "absolute rounded-[7px] border-2 shadow-[0_0_0_9999px_rgb(0_0_0/0.02)] transition-[border-color,box-shadow] duration-100",
              selectedTarget?.entry.id === hoverTarget.entry.id
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
              selectedTarget?.entry.id === hoverTarget.entry.id ? "bg-emerald-600" : "bg-sky-600",
            ].join(" ")}
            style={{
              top: Math.max(8, hoverBox.top - 28),
              left: Math.min(Math.max(8, hoverBox.left), window.innerWidth - 328),
            }}
          >
            {hoverTarget.entry.name}
          </div>
        </div>
      )}

      {selectionMode && selectedTarget && selectedBox && !showOnboarding ? (
        <div className="fixed inset-0 z-[2147483647] pointer-events-none">
          <div
            className={cn(
              "absolute rounded-[7px] border-2 transition-[border-color,box-shadow] duration-150",
              selectionRunStatus === "running"
                ? "border-amber-300 shadow-[0_0_0_1px_rgb(252_211_77/0.35),0_0_18px_rgb(252_211_77/0.28)]"
                : selectionRunStatus === "completed"
                  ? "border-emerald-400 shadow-[0_0_0_1px_rgb(16_185_129/0.35)]"
                  : selectionRunStatus === "failed"
                    ? "border-red-400 shadow-[0_0_0_1px_rgb(248_113_113/0.32)]"
                    : "border-emerald-400 shadow-[0_0_0_1px_rgb(16_185_129/0.28)]",
            )}
            style={{
              top: selectedBox.top,
              left: selectedBox.left,
              width: selectedBox.width,
              height: selectedBox.height,
            }}
          />
          {selectionRunStatus === "running" ? (
            <div
              className="absolute flex size-7 items-center justify-center rounded-full border border-amber-200/70 bg-amber-500 text-amber-950 shadow-lg"
              style={{
                top: Math.max(8, selectedBox.top + 8),
                left: Math.min(
                  Math.max(8, selectedBox.left + selectedBox.width - 36),
                  window.innerWidth - 36,
                ),
              }}
              aria-label={`Editing ${selectedTarget.entry.name}`}
            >
              <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
            </div>
          ) : null}

          {(selectionRunStatus === "idle" || selectionRunStatus === "failed") && promptAnchor ? (
            <form
              data-pipper-selection-ui=""
              className="pointer-events-auto absolute flex w-[min(300px,calc(100vw-32px))] flex-col items-start gap-1.5"
              style={{
                top: Math.min(window.innerHeight - 104, Math.max(12, promptAnchor.y + 18)),
                left: Math.min(
                  window.innerWidth - Math.min(300, window.innerWidth - 32) - 12,
                  Math.max(12, promptAnchor.x + 30),
                ),
              }}
              onSubmit={(event) => {
                event.preventDefault();
                void startSelectionRun();
              }}
            >
              <div className="flex h-12 w-full items-center rounded-[999px] border border-[#50617f] bg-[#7284aa] px-5 text-zinc-50 shadow-[0_14px_30px_rgb(0_0_0/0.28),inset_0_0_0_2px_rgb(34_47_73/0.24)]">
                <input
                  value={componentPrompt}
                  onChange={(event) => setComponentPrompt(event.target.value)}
                  autoFocus
                  placeholder="Say something"
                  className="h-full min-w-0 flex-1 border-0 bg-transparent text-[21px] font-normal leading-none text-zinc-100 outline-none placeholder:text-zinc-200/80"
                />
              </div>
              {activeModelPickerEntry ? (
                <div className="rounded-full border border-zinc-800 bg-zinc-950/95 px-1 py-1 shadow-lg">
                  <ProviderModelPicker
                    compact
                    activeInstanceId={activeModelPickerInstanceId}
                    model={activeModelPickerModel}
                    lockedProvider={null}
                    instanceEntries={providerInstanceEntries}
                    modelOptionsByInstance={modelOptionsByInstance}
                    triggerVariant="ghost"
                    triggerClassName="h-7 max-w-[280px] rounded-full px-2 text-xs text-zinc-300 hover:bg-zinc-900 hover:text-zinc-50"
                    onInstanceModelChange={(instanceId, model) => {
                      setComponentModelSelection(createModelSelection(instanceId, model));
                    }}
                  />
                </div>
              ) : null}
              {selectionRunMessage ? (
                <div
                  className={cn(
                    "max-w-[min(300px,calc(100vw-32px))] rounded-md px-2 py-1 text-[11px] shadow-lg",
                    selectionRunStatus === "failed"
                      ? "bg-red-950/90 text-red-200"
                      : "bg-zinc-950/90 text-zinc-400",
                  )}
                >
                  {selectionRunMessage}
                </div>
              ) : null}
              <button
                type="submit"
                disabled={componentPrompt.trim().length === 0}
                className="sr-only"
                aria-label="Start component Improve"
              />
            </form>
          ) : null}
        </div>
      ) : null}

      {selectionMode &&
      selectedTarget &&
      selectionRunThreadRef &&
      !isSelectionRunPanelHidden &&
      !showOnboarding ? (
        <div
          data-pipper-selection-ui=""
          className="fixed right-5 top-5 z-[2147483647] flex h-[min(560px,calc(100vh-40px))] w-[min(420px,calc(100vw-40px))] flex-col overflow-hidden rounded-2xl border border-border/70 bg-card/95 px-6 pb-5 pt-6 text-card-foreground shadow-2xl shadow-black/20 backdrop-blur-md"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 break-words pr-4 text-sm font-normal leading-6 text-card-foreground [overflow-wrap:anywhere]">
              {displayTextForSelectionRunMessage(selectionRunUserPromptText) || "the users prompt"}
            </div>
            <button
              type="button"
              className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              onClick={() => setIsSelectionRunPanelHidden(true)}
              aria-label="Hide component Improve stream"
            >
              <XIcon className="size-4" aria-hidden="true" />
            </button>
          </div>
          <div
            ref={selectionRunPanelScrollRef}
            className="flex min-h-0 flex-1 items-center justify-end overflow-y-auto overflow-x-hidden py-8"
          >
            <div
              className={cn(
                "max-w-[320px] whitespace-pre-wrap break-words text-right text-sm font-normal leading-6 text-muted-foreground/75 [overflow-wrap:anywhere]",
                selectionRunStatus === "failed" && "text-destructive",
              )}
            >
              {selectionRunActivelyWorking && !selectionRunAssistantText ? (
                <Loader2Icon
                  className="ml-auto mb-4 size-4 animate-spin text-muted-foreground"
                  aria-hidden="true"
                />
              ) : null}
              {selectionRunPanelStatusText}
            </div>
          </div>
          <form
            className="shrink-0"
            onSubmit={(event) => {
              event.preventDefault();
              void sendSelectionFollowUp();
            }}
          >
            <div className="flex h-10 items-center rounded-full border border-border/70 bg-muted px-4">
              <input
                value={selectionFollowUpPrompt}
                onChange={(event) => setSelectionFollowUpPrompt(event.target.value)}
                placeholder={
                  canSendSelectionFollowUp
                    ? "start here"
                    : selectionRunActivelyWorking
                      ? "agent is working"
                      : "start here"
                }
                className="h-full min-w-0 flex-1 border-0 bg-transparent text-sm font-normal leading-none text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!canSendSelectionFollowUp}
              />
              <button
                type="submit"
                disabled={!canSendSelectionFollowUp || selectionFollowUpPrompt.trim().length === 0}
                className="sr-only"
                aria-label="Send follow-up to component Improve agent"
              >
                Send follow-up
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {selectionMode && selectedTarget && selectionRunStatus === "completed" && !showOnboarding ? (
        <div
          data-pipper-selection-ui=""
          className="fixed bottom-[92px] left-1/2 z-[2147483647] flex -translate-x-1/2 items-center gap-1.5 rounded-md bg-zinc-900 px-1.5 py-1.5 text-zinc-50 shadow-lg/5"
        >
          <button
            type="button"
            className="inline-flex size-7 items-center justify-center rounded-md text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-zinc-50"
            onClick={rejectSelectionRun}
            aria-label="Reject component Improve result"
          >
            <XIcon className="size-4" />
          </button>
          <button
            type="button"
            className="inline-flex size-7 items-center justify-center rounded-md bg-emerald-500 text-white transition-colors hover:bg-emerald-400"
            onClick={() => {
              toastManager.add(
                stackedThreadToast({
                  type: "success",
                  title: "Component Improve accepted",
                  description: "Use Apply Change to commit the accepted Improve workspace edits.",
                }),
              );
            }}
            aria-label="Accept component Improve result"
          >
            <CheckIcon className="size-4" />
          </button>
        </div>
      ) : null}

      {/* Floating Bar */}
      {showFloatingBar && (
        <ImproveFloatingBar
          onClose={() => setSelectionMode(false)}
          onDragStart={() => setIsDraggingFloatingBar(true)}
          onDragEnd={() => setIsDraggingFloatingBar(false)}
        />
      )}
    </>
  );
}

interface ImproveFloatingBarProps {
  onClose: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}

export function ImproveFloatingBar({ onClose, onDragStart, onDragEnd }: ImproveFloatingBarProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const posRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const rafRef = useRef<number | null>(null);
  const [initialized, setInitialized] = useState(false);

  // Snap the bar to its bottom-center resting position, then lock it into absolute
  // coords using `transform: translate3d` (composited, no layout/paint) for drag.
  // `useLayoutEffect` runs before paint, so the user never sees a position jump.
  useLayoutEffect(() => {
    if (initialized || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    posRef.current = { x: rect.left, y: rect.top };
    setInitialized(true);
  }, [initialized]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!initialized) return;
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const target = e.target as HTMLElement;
    if (target.closest("button") || target.closest("input") || target.closest("a")) return;

    const el = containerRef.current;
    if (!el) return;

    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    onDragStart();

    const startX = e.clientX;
    const startY = e.clientY;
    const posStartX = posRef.current.x;
    const posStartY = posRef.current.y;
    const containerWidth = el.offsetWidth;
    const containerHeight = el.offsetHeight;
    const maxX = Math.max(10, window.innerWidth - containerWidth - 10);
    const maxY = Math.max(10, window.innerHeight - containerHeight - 10);

    const commit = () => {
      rafRef.current = null;
      el.style.transform = `translate3d(${posRef.current.x}px, ${posRef.current.y}px, 0)`;
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const nextX = Math.min(Math.max(10, posStartX + (moveEvent.clientX - startX)), maxX);
      const nextY = Math.min(Math.max(10, posStartY + (moveEvent.clientY - startY)), maxY);
      posRef.current = { x: nextX, y: nextY };
      // Throttle DOM writes to one per animation frame.
      if (rafRef.current === null) rafRef.current = requestAnimationFrame(commit);
    };

    const handlePointerEnd = (endEvent: PointerEvent) => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
        commit();
      }
      el.removeEventListener("pointermove", handlePointerMove);
      el.removeEventListener("pointerup", handlePointerEnd);
      el.removeEventListener("pointercancel", handlePointerEnd);
      if (el.hasPointerCapture(endEvent.pointerId)) el.releasePointerCapture(endEvent.pointerId);
      onDragEnd();
    };

    el.addEventListener("pointermove", handlePointerMove);
    el.addEventListener("pointerup", handlePointerEnd);
    el.addEventListener("pointercancel", handlePointerEnd);
  };

  return (
    <div
      data-pipper-selection-ui=""
      ref={containerRef}
      style={
        initialized
          ? {
              left: 0,
              top: 0,
              transform: `translate3d(${posRef.current.x}px, ${posRef.current.y}px, 0)`,
              touchAction: "none",
            }
          : {
              // Bottom-center resting position. The init layout effect captures the
              // resulting `getBoundingClientRect()` and the next render takes over
              // with `transform: translate3d` for drag-time compositing.
              left: "50%",
              bottom: "40px",
              transform: "translateX(-50%)",
              touchAction: "none",
            }
      }
      className="fixed z-[2147483647] flex items-center gap-1.5 px-2 py-1.5 rounded-md bg-zinc-900 backdrop-blur-md shadow-lg/5 select-none will-change-transform improve-bar-enter"
    >
      {/* Drag handle grip */}
      <div
        onPointerDown={handlePointerDown}
        className="improve-bar-child cursor-grab active:cursor-grabbing touch-none p-1.5 hover:bg-accent active:bg-accent/80 rounded-md text-muted-foreground/60 hover:text-foreground transition-[background-color,color] duration-150 ease-out shrink-0"
        data-stagger="1"
        aria-label="Drag floating bar"
      >
        <GripVertical className="size-4" />
      </div>

      {/* Action buttons wrapper */}
      <div className="improve-bar-child flex items-center min-w-0" data-stagger="2">
        <ImproveEvolutionActions className="flex-row items-center gap-1.5" iconOnly />
      </div>

      <div className="w-px h-5 bg-border/40 shrink-0" />

      {/* Exit/Close Button */}
      <button
        onClick={onClose}
        className="improve-bar-child p-1.5 hover:bg-accent active:bg-accent/80 rounded-md text-muted-foreground/60 hover:text-foreground transition-[background-color,color] duration-150 ease-out shrink-0"
        data-stagger="3"
        aria-label="Exit Improve Mode"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
