import { scopeProjectRef } from "@t3tools/client-runtime";
import { DEFAULT_MODEL, ProviderInstanceId } from "@t3tools/contracts";
import { PIPPER_EVOLUTION_WORKSPACE_ROOT } from "@t3tools/shared/evolution";
import { useCallback } from "react";
import { readEnvironmentApi } from "../environmentApi";
import { usePrimaryEnvironmentId } from "../environments/primary";
import { newCommandId, newProjectId } from "../lib/utils";
import { findProjectByPath, inferProjectTitleFromPath } from "../lib/projectPaths";
import { selectEnvironmentState, selectProjectsAcrossEnvironments, useStore } from "../store";
import { useSettings } from "./useSettings";
import { useNewThreadHandler } from "./useHandleNewThread";

export const IMPROVE_WORKSPACE_ROOT = PIPPER_EVOLUTION_WORKSPACE_ROOT;

export function useEnsureImproveThread() {
  const { handleNewThread } = useNewThreadHandler();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const defaultThreadEnvMode = useSettings((settings) => settings.defaultThreadEnvMode);

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

  const ensureImproveThread = useCallback(async () => {
    if (!primaryEnvironmentId) {
      throw new Error("Connect a local environment before opening Evolution Space.");
    }

    await waitForBootstrapComplete();

    const existing = findProjectByPath(
      selectProjectsAcrossEnvironments(useStore.getState()).filter(
        (project) => project.environmentId === primaryEnvironmentId,
      ),
      IMPROVE_WORKSPACE_ROOT,
    );
    if (existing) {
      await handleNewThread(scopeProjectRef(existing.environmentId, existing.id), {
        envMode: defaultThreadEnvMode,
      });
      return;
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
      defaultModelSelection: {
        instanceId: ProviderInstanceId.make("codex"),
        model: DEFAULT_MODEL,
      },
      createdAt: new Date().toISOString(),
    });
    await handleNewThread(scopeProjectRef(primaryEnvironmentId, projectId), {
      envMode: defaultThreadEnvMode,
    });
  }, [defaultThreadEnvMode, handleNewThread, primaryEnvironmentId, waitForBootstrapComplete]);

  return { ensureImproveThread };
}

export function useOpenImproveSpace() {
  const openImproveSpace = useCallback(() => {
    window.dispatchEvent(new CustomEvent("pipper:set-improve-mode", { detail: { active: true } }));
  }, []);

  return { isOpeningImprove: false, openImproveSpace };
}
