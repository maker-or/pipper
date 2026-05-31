import { scopeProjectRef } from "@t3tools/client-runtime";
import { DEFAULT_MODEL, ProviderInstanceId } from "@t3tools/contracts";
import { PIPPER_EVOLUTION_WORKSPACE_ROOT } from "@t3tools/shared/evolution";
import { useCallback, useState } from "react";
import { readEnvironmentApi } from "../environmentApi";
import { usePrimaryEnvironmentId } from "../environments/primary";
import { newCommandId, newProjectId } from "../lib/utils";
import { findProjectByPath, inferProjectTitleFromPath } from "../lib/projectPaths";
import { selectEnvironmentState, selectProjectsAcrossEnvironments, useStore } from "../store";
import { useAppSpaceStore } from "../appSpaceStore";
import { stackedThreadToast, toastManager } from "../components/ui/toast";
import { useSettings } from "./useSettings";
import { useNewThreadHandler } from "./useHandleNewThread";

export const IMPROVE_WORKSPACE_ROOT = PIPPER_EVOLUTION_WORKSPACE_ROOT;

export function useOpenImproveSpace() {
  const { handleNewThread } = useNewThreadHandler();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const defaultThreadEnvMode = useSettings((settings) => settings.defaultThreadEnvMode);
  const setActiveSpace = useAppSpaceStore((store) => store.setActiveSpace);
  const [isOpeningImprove, setIsOpeningImprove] = useState(false);

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

  const openImproveSpace = useCallback(() => {
    if (!primaryEnvironmentId || isOpeningImprove) {
      if (!primaryEnvironmentId) {
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: "Improve is unavailable",
            description: "Connect a local environment before opening Improve.",
          }),
        );
      }
      return;
    }

    setActiveSpace("improve");
    setIsOpeningImprove(true);
    void (async () => {
      try {
        await window.desktopBridge?.ensureEvolutionWorkspace?.();

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
      } catch (error) {
        setActiveSpace("main");
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: "Failed to open Improve",
            description: error instanceof Error ? error.message : "An error occurred.",
          }),
        );
      } finally {
        setIsOpeningImprove(false);
      }
    })();
  }, [
    defaultThreadEnvMode,
    handleNewThread,
    isOpeningImprove,
    primaryEnvironmentId,
    setActiveSpace,
    waitForBootstrapComplete,
  ]);

  return { isOpeningImprove, openImproveSpace };
}
