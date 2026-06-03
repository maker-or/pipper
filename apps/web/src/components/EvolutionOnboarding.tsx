import { useCallback, useEffect, useRef, useState } from "react";
import { CheckIcon, Loader2Icon, XIcon } from "lucide-react";

import { useEvolutionStore, type EvolutionSetupStep } from "../evolutionStore";
import { Button } from "./ui/button";

const SETUP_STEPS: {
  key: EvolutionSetupStep;
  label: string;
  description: string;
}[] = [
  {
    key: "cloning",
    label: "Clone repository",
    description: "Fetching the latest Pipper source code",
  },
  {
    key: "installing",
    label: "Install dependencies",
    description: "Installing packages with bun",
  },
  {
    key: "initializing",
    label: "Initialize workspace",
    description: "Setting up evolution workspace structure",
  },
];

function stepIndex(step: EvolutionSetupStep): number {
  return SETUP_STEPS.findIndex((s) => s.key === step);
}

function StepIndicator({
  step,
  currentStep,
  isError,
}: {
  readonly step: (typeof SETUP_STEPS)[number];
  readonly currentStep: EvolutionSetupStep | null;
  readonly isError: boolean;
}) {
  const currentIdx = currentStep ? stepIndex(currentStep) : -1;
  const thisIdx = stepIndex(step.key);
  const isComplete = currentStep === "complete" || thisIdx < currentIdx;
  const isCurrent = step.key === currentStep;
  const isCurrentError = isCurrent && isError;

  return (
    <div className="flex items-start gap-3.5 py-2">
      <div className="relative flex size-7 shrink-0 items-center justify-center">
        {isComplete ? (
          <div className="flex size-7 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/30">
            <CheckIcon className="size-3.5" />
          </div>
        ) : isCurrentError ? (
          <div className="flex size-7 items-center justify-center rounded-full bg-red-500/20 text-red-400 ring-1 ring-red-500/30">
            <XIcon className="size-3.5" />
          </div>
        ) : isCurrent ? (
          <div className="flex size-7 items-center justify-center rounded-full bg-orange-500/15 text-orange-300 ring-1 ring-orange-400/30">
            <Loader2Icon className="size-3.5 animate-spin" />
          </div>
        ) : (
          <div className="flex size-7 items-center justify-center rounded-full border border-border/60 text-muted-foreground/50">
            <div className="size-1.5 rounded-full bg-current" />
          </div>
        )}
        {thisIdx < SETUP_STEPS.length - 1 ? (
          <div
            className={`absolute top-full left-1/2 h-5 w-px -translate-x-1/2 ${
              isComplete ? "bg-emerald-500/30" : "bg-border/50"
            }`}
          />
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <p
          className={`text-sm font-medium leading-7 ${
            isComplete
              ? "text-foreground/70"
              : isCurrent
                ? "text-foreground"
                : "text-muted-foreground/60"
          }`}
        >
          {step.label}
        </p>
        <p className="text-xs text-muted-foreground/50">{step.description}</p>
      </div>
    </div>
  );
}

interface EvolutionOnboardingProps {
  readonly onSetupComplete: () => void;
  readonly onRetry?: () => void;
}

export function EvolutionOnboarding({ onSetupComplete, onRetry }: EvolutionOnboardingProps) {
  const setupProgress = useEvolutionStore((s) => s.setupProgress);
  const isSettingUp = useEvolutionStore((s) => s.isSettingUp);
  const setIsSettingUp = useEvolutionStore((s) => s.setIsSettingUp);
  const setSetupProgress = useEvolutionStore((s) => s.setSetupProgress);
  const [hasStarted, setHasStarted] = useState(false);
  const completeCalledRef = useRef(false);

  const startSetup = useCallback(async () => {
    if (isSettingUp) return;
    setHasStarted(true);
    setIsSettingUp(true);
    completeCalledRef.current = false;

    try {
      // Step 1: Cloning
      setSetupProgress({
        step: "cloning",
        message: "Cloning Pipper repository…",
        progress: null,
      });

      // Attempt to use desktop bridge if available
      const bridge = typeof window !== "undefined" ? window.desktopBridge : undefined;
      if (bridge?.ensureEvolutionWorkspace) {
        await bridge.ensureEvolutionWorkspace();
      } else {
        // In web-only mode, we simulate a delay — actual setup happens server-side
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      // Step 2: Installing
      setSetupProgress({
        step: "installing",
        message: "Installing dependencies…",
        progress: null,
      });
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Step 3: Initializing
      setSetupProgress({
        step: "initializing",
        message: "Initializing evolution workspace…",
        progress: null,
      });
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Complete
      setSetupProgress({
        step: "complete",
        message: "Evolution workspace is ready",
        progress: 1,
      });

      if (!completeCalledRef.current) {
        completeCalledRef.current = true;
        onSetupComplete();
      }
    } catch (error) {
      setSetupProgress({
        step: "error",
        message: error instanceof Error ? error.message : "Setup failed",
        progress: null,
      });
    } finally {
      setIsSettingUp(false);
    }
  }, [isSettingUp, onSetupComplete, setIsSettingUp, setSetupProgress]);

  // Auto-start on mount
  useEffect(() => {
    if (!hasStarted) {
      void startSetup();
    }
  }, [hasStarted, startSetup]);

  const currentStep = setupProgress?.step ?? null;
  const isError = currentStep === "error";

  return (
    <div
      data-pipper-id="evolution-onboarding"
      className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10 text-foreground sm:px-6"
    >
      {/* Background gradients */}
      <div className="pointer-events-none absolute inset-0 opacity-80">
        <div className="absolute inset-x-0 top-0 h-44 bg-[radial-gradient(44rem_16rem_at_top,color-mix(in_srgb,var(--color-orange-500)_12%,transparent),transparent)]" />
        <div className="absolute inset-y-0 right-0 w-72 bg-[radial-gradient(28rem_18rem_at_right,color-mix(in_srgb,var(--color-amber-500)_8%,transparent),transparent)]" />
        <div className="absolute inset-0 bg-[linear-gradient(145deg,color-mix(in_srgb,var(--background)_90%,var(--color-black))_0%,var(--background)_55%)]" />
      </div>

      <section className="relative w-full max-w-md rounded-2xl border border-border/80 bg-card/90 p-6 shadow-2xl shadow-black/20 backdrop-blur-md sm:p-8">
        <p className="text-[11px] font-semibold tracking-[0.18em] text-orange-400/80 uppercase">
          Evolution Space
        </p>
        <h1 className="mt-3 text-xl font-semibold tracking-tight sm:text-2xl">
          Setting up your workspace
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Preparing the evolution environment so agents can modify Pipper's source code.
        </p>

        <div className="mt-6 space-y-0.5">
          {SETUP_STEPS.map((step) => (
            <StepIndicator key={step.key} step={step} currentStep={currentStep} isError={isError} />
          ))}
        </div>

        {isError ? (
          <div className="mt-5 rounded-lg border border-red-500/30 bg-red-500/8 px-4 py-3">
            <p className="text-xs font-medium text-red-300">Setup failed</p>
            <p className="mt-1 text-xs text-red-300/70">{setupProgress?.message}</p>
            <Button
              className="mt-3"
              size="sm"
              variant="outline"
              onClick={() => {
                setHasStarted(false);
                onRetry?.();
              }}
            >
              Retry
            </Button>
          </div>
        ) : null}

        {currentStep === "complete" ? (
          <div className="mt-5 rounded-lg border border-emerald-500/30 bg-emerald-500/8 px-4 py-3">
            <p className="text-xs font-medium text-emerald-300">Workspace ready</p>
            <p className="mt-1 text-xs text-emerald-300/70">
              Your evolution environment is set up and ready to use.
            </p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
