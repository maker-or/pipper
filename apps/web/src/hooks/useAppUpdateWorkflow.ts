import { scopeThreadRef } from "@t3tools/client-runtime";
import { ProviderInstanceId } from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import { useCallback, useEffect, useMemo, useState } from "react";

import { readEnvironmentApi } from "../environmentApi";
import { usePrimaryEnvironmentId } from "../environments/primary";
import { IMPROVE_WORKSPACE_ROOT } from "./useOpenImproveSpace";
import { inferProjectTitleFromPath, findProjectByPath } from "../lib/projectPaths";
import {
  markAppUpdatePorted,
  markAppUpdatePorting,
  markAppUpdateReadyToPort,
  setAppUpdateWorkflowThreadRef,
  startAppUpdateWorkflow,
  useAppUpdateState,
} from "../lib/appUpdateStore";
import { newCommandId, newMessageId, newProjectId, newThreadId } from "../lib/utils";
import {
  selectEnvironmentState,
  selectProjectsAcrossEnvironments,
  selectThreadByRef,
  useStore,
} from "../store";
import { useServerProviders } from "../rpc/serverState";
import { stackedThreadToast, toastManager } from "../components/ui/toast";

function buildUpdatePrompt(manifest: unknown): string {
  return `Port the changes from the upstream Pipper update into the current Improve workspace.

Use the update metadata to identify the upstream git information and changed files. Read the local patch.md file first so previous local customizations are preserved while merging the upstream changes.

Update Metadata:
${JSON.stringify(manifest, null, 2)}

Resolve any conflicts or regressions needed for this local app to run correctly. Do not push to any remote repository.`;
}

export function useAppUpdateWorkflow() {
  const updateState = useAppUpdateState();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const providers = useServerProviders();
  const projects = useStore(selectProjectsAcrossEnvironments);
  const workflowThreadRef = updateState?.workflowThreadRef ?? null;
  const workflowThread = useStore((state) => selectThreadByRef(state, workflowThreadRef));
  const [isStartingUpdateWorkflow, setIsStartingUpdateWorkflow] = useState(false);
  const [isPortingUpdate, setIsPortingUpdate] = useState(false);

  const modelSelection = useMemo(() => {
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

  const waitForBootstrapComplete = useCallback(async () => {
    if (!primaryEnvironmentId) {
      return;
    }
    if (selectEnvironmentState(useStore.getState(), primaryEnvironmentId).bootstrapComplete) {
      return;
    }
    await new Promise<void>((resolve) => {
      const unsubscribe = useStore.subscribe((state) => {
        if (selectEnvironmentState(state, primaryEnvironmentId).bootstrapComplete) {
          unsubscribe();
          resolve();
        }
      });
    });
  }, [primaryEnvironmentId]);

  const ensureImproveProject = useCallback(async () => {
    if (!primaryEnvironmentId) {
      throw new Error("Connect a local environment before starting the update agent.");
    }

    await window.desktopBridge?.ensureEvolutionWorkspace?.();
    await waitForBootstrapComplete();

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
      defaultModelSelection: modelSelection,
      createdAt: new Date().toISOString(),
    });

    return {
      id: projectId,
      environmentId: primaryEnvironmentId,
      name: inferProjectTitleFromPath(IMPROVE_WORKSPACE_ROOT),
      cwd: IMPROVE_WORKSPACE_ROOT,
      defaultModelSelection: modelSelection,
      scripts: [],
    };
  }, [modelSelection, primaryEnvironmentId, waitForBootstrapComplete]);

  const startUpdateAgent = useCallback(async () => {
    if (isStartingUpdateWorkflow || updateState?.status === "downloading-manifest") {
      return;
    }

    setIsStartingUpdateWorkflow(true);
    try {
      const nextState = await startAppUpdateWorkflow();
      if (!nextState?.latestManifest) {
        throw new Error("Failed to load latest update manifest.");
      }

      const project = await ensureImproveProject();
      const api = readEnvironmentApi(project.environmentId);
      if (!api) {
        throw new Error("Improve environment API is unavailable.");
      }

      const threadId = newThreadId();
      const threadRef = scopeThreadRef(project.environmentId, threadId);
      const title = nextState.latestVersion
        ? `Update Pipper to ${nextState.latestVersion}`
        : "Update Pipper";
      const createdAt = new Date().toISOString();

      await api.orchestration.dispatchCommand({
        type: "thread.create",
        commandId: newCommandId(),
        threadId,
        projectId: project.id,
        title,
        modelSelection,
        runtimeMode: "full-access",
        interactionMode: "default",
        branch: null,
        worktreePath: null,
        createdAt,
      });

      await api.orchestration.dispatchCommand({
        type: "thread.turn.start",
        commandId: newCommandId(),
        threadId,
        message: {
          messageId: newMessageId(),
          role: "user",
          text: buildUpdatePrompt(nextState.latestManifest),
          attachments: [],
        },
        modelSelection,
        titleSeed: title,
        runtimeMode: "full-access",
        interactionMode: "default",
        createdAt,
      });

      setAppUpdateWorkflowThreadRef(threadRef);
      toastManager.add(
        stackedThreadToast({
          type: "loading",
          title: "Update agent started",
          description: "The Improve workspace is updating in the background.",
        }),
      );
    } catch (error) {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "Could not start update agent",
          description: error instanceof Error ? error.message : "Workflow start failed.",
        }),
      );
    } finally {
      setIsStartingUpdateWorkflow(false);
    }
  }, [ensureImproveProject, isStartingUpdateWorkflow, modelSelection, updateState?.status]);

  const portUpdate = useCallback(async () => {
    const bridge = typeof window !== "undefined" ? window.desktopBridge : undefined;
    if (!bridge?.portEvolutionRelease || isPortingUpdate) {
      return;
    }

    setIsPortingUpdate(true);
    markAppUpdatePorting();
    try {
      await bridge.portEvolutionRelease();
      markAppUpdatePorted();
      toastManager.add(
        stackedThreadToast({
          type: "success",
          title: "DMG opened",
          description: "The updated installer was built and opened.",
        }),
      );
    } catch (error) {
      markAppUpdateReadyToPort();
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "Failed to port update",
          description: error instanceof Error ? error.message : "An unknown error occurred.",
        }),
      );
    } finally {
      setIsPortingUpdate(false);
    }
  }, [isPortingUpdate]);

  useEffect(() => {
    if (updateState?.status !== "updating" || !workflowThreadRef || !workflowThread) {
      return;
    }
    if (
      workflowThread.error ||
      !workflowThread.session ||
      workflowThread.session.status === "running"
    ) {
      return;
    }
    markAppUpdateReadyToPort();
  }, [updateState?.status, workflowThread, workflowThreadRef]);

  return {
    isStartingUpdateWorkflow,
    isPortingUpdate,
    startUpdateAgent,
    portUpdate,
  };
}
