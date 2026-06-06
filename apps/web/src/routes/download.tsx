import { createFileRoute } from "@tanstack/react-router";
import { ArrowRightIcon, DownloadIcon, MonitorIcon, PlayIcon } from "lucide-react";
import { useEffect } from "react";
import { GitHubIcon } from "../components/Icons";

import { Button } from "../components/ui/button";
import { trackPosthogEvent } from "../telemetry/posthog";

const GITHUB_RELEASES_URL = "https://github.com/maker-or/pipper/releases/latest";

const DOWNLOAD_OPTIONS = [
  {
    id: "mac",
    title: "macOS",
    description: "Apple Silicon and Intel builds.",
    label: "Download for Mac",
    href: GITHUB_RELEASES_URL,
    icon: MonitorIcon,
  },
  {
    id: "windows",
    title: "Windows",
    description: "Installer and auto-update package.",
    label: "Download for Windows",
    href: GITHUB_RELEASES_URL,
    icon: PlayIcon,
  },
  {
    id: "linux",
    title: "Linux",
    description: "AppImage and release assets.",
    label: "Download for Linux",
    href: GITHUB_RELEASES_URL,
    icon: DownloadIcon,
  },
] as const;

export const Route = createFileRoute("/download")({
  component: DownloadRouteView,
  head: () => ({
    meta: [
      { name: "title", content: "Download T3 Code" },
      {
        name: "description",
        content: "Download T3 Code for macOS, Windows, or Linux.",
      },
    ],
  }),
});

function DownloadRouteView() {
  useEffect(() => {
    trackPosthogEvent("marketing.download.page_viewed", {
      page: "download",
      pagePath: "/download",
    });
  }, []);

  return (
    <main className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.16),transparent_36%),linear-gradient(180deg,rgba(255,255,255,0.02),transparent_35%)]" />
      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-3xl text-center">
          <p className="text-xs font-semibold tracking-[0.28em] text-muted-foreground uppercase">
            T3 Code downloads
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
            Get the desktop app.
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-balance text-sm leading-6 text-muted-foreground sm:text-base">
            Pick your platform below. We track page views and button clicks so we can see which
            downloads people are actually using.
          </p>
        </div>

        <section className="mt-10 grid gap-4 lg:grid-cols-3">
          {DOWNLOAD_OPTIONS.map((option) => {
            const Icon = option.icon;
            return (
              <article
                key={option.id}
                className="rounded-2xl border border-border/70 bg-card/70 p-5 shadow-sm backdrop-blur-sm"
              >
                <div className="flex h-full flex-col">
                  <div className="flex items-center gap-3">
                    <div className="flex size-11 items-center justify-center rounded-xl border border-border/70 bg-background/70 text-muted-foreground">
                      <Icon className="size-5" />
                    </div>
                    <div>
                      <h2 className="text-base font-semibold">{option.title}</h2>
                      <p className="text-sm text-muted-foreground">{option.description}</p>
                    </div>
                  </div>

                  <div className="mt-6 flex flex-1 items-end">
                    <Button
                      render={
                        <a
                          href={option.href}
                          rel="noreferrer"
                          target="_blank"
                          onClick={() => {
                            trackPosthogEvent("marketing.download.button_clicked", {
                              buttonId: option.id,
                              buttonLabel: option.label,
                              downloadPlatform: option.title,
                              href: option.href,
                              page: "download",
                              pagePath: "/download",
                            });
                          }}
                        />
                      }
                      className="w-full"
                      size="lg"
                    >
                      {option.label}
                      <ArrowRightIcon className="size-4" />
                    </Button>
                  </div>
                </div>
              </article>
            );
          })}
        </section>

        <div className="mx-auto mt-8 flex max-w-3xl flex-col items-center gap-3 text-center text-sm text-muted-foreground sm:flex-row sm:justify-center">
          <a
            className="inline-flex items-center gap-2 underline-offset-4 hover:underline"
            href={GITHUB_RELEASES_URL}
            rel="noreferrer"
            target="_blank"
            onClick={() => {
              trackPosthogEvent("marketing.download.button_clicked", {
                buttonId: "github-releases",
                buttonLabel: "View GitHub releases",
                downloadPlatform: "github-releases",
                href: GITHUB_RELEASES_URL,
                page: "download",
                pagePath: "/download",
              });
            }}
          >
            <GitHubIcon className="size-4" />
            View release notes on GitHub
          </a>
        </div>
      </div>
    </main>
  );
}
