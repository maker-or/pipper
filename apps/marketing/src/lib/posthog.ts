import { onCLS, onINP, onLCP, type MetricType } from "web-vitals";

const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";
const DEFAULT_POSTHOG_PROXY_HOST = "/_ph";
const POSTHOG_STORAGE_KEY = "t3-posthog-distinct-id";

interface PosthogEventProperties extends Record<string, unknown> {
  readonly page?: string;
  readonly pagePath?: string;
  readonly pageTitle?: string;
}

const reportedWebVitalIds = new Set<string>();
let didInitializeWebVitals = false;

function resolvePosthogKey(): string | undefined {
  return import.meta.env.PUBLIC_POSTHOG_KEY?.trim() || undefined;
}

function resolvePosthogHost(): string {
  return (
    import.meta.env.PUBLIC_POSTHOG_HOST?.trim() ||
    (import.meta.env.PROD ? DEFAULT_POSTHOG_PROXY_HOST : DEFAULT_POSTHOG_HOST)
  );
}

function getDistinctId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const existing = window.localStorage.getItem(POSTHOG_STORAGE_KEY);
    if (existing) {
      return existing;
    }

    const next =
      window.crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    window.localStorage.setItem(POSTHOG_STORAGE_KEY, next);
    return next;
  } catch {
    return null;
  }
}

function buildBaseProperties(): Readonly<Record<string, unknown>> {
  return {
    $process_person_profile: false,
    appVersion: import.meta.env.PUBLIC_APP_VERSION,
    clientType: "marketing-site",
    path: window.location.pathname,
    referrer: document.referrer || undefined,
    userAgent: window.navigator.userAgent,
  };
}

function buildPageProperties(): Readonly<Record<string, unknown>> {
  return {
    page: document.body.dataset.page || undefined,
    pagePath: window.location.pathname,
    pageTitle: document.title,
  };
}

function buildPosthogProperties(
  properties?: PosthogEventProperties,
): Readonly<Record<string, unknown>> {
  return {
    ...buildBaseProperties(),
    ...properties,
  };
}

function trackPosthogBatch(event: string, properties?: PosthogEventProperties): void {
  const apiKey = resolvePosthogKey();
  const distinctId = getDistinctId();
  if (!apiKey || !distinctId) {
    return;
  }

  const payload = {
    api_key: apiKey,
    batch: [
      {
        event,
        distinct_id: distinctId,
        properties: buildPosthogProperties(properties),
        timestamp: new Date().toISOString(),
      },
    ],
  };

  void fetch(`${resolvePosthogHost()}/batch/`, {
    body: JSON.stringify(payload),
    headers: {
      "content-type": "application/json",
    },
    keepalive: true,
    method: "POST",
    mode: "cors",
  }).catch(() => undefined);
}

function trackPosthogWebVital(metric: MetricType): void {
  if (reportedWebVitalIds.has(metric.id)) {
    return;
  }

  reportedWebVitalIds.add(metric.id);

  trackPosthogBatch("$web_vitals", {
    ...buildPageProperties(),
    delta: metric.delta,
    id: metric.id,
    metric_delta: metric.delta,
    metric_id: metric.id,
    metric_name: metric.name,
    metric_rating: metric.rating,
    metric_value: metric.value,
    navigationType: metric.navigationType,
    name: metric.name,
    rating: metric.rating,
    value: metric.value,
  });
}

function initializeWebVitals(): void {
  if (didInitializeWebVitals) {
    return;
  }

  didInitializeWebVitals = true;

  onLCP(trackPosthogWebVital);
  onCLS(trackPosthogWebVital);
  onINP(trackPosthogWebVital);
}

export function trackPosthogEvent(event: string, properties?: PosthogEventProperties): void {
  if (typeof window === "undefined") {
    return;
  }

  trackPosthogBatch(event, properties);
}

export function trackPosthogPageView(properties?: Omit<PosthogEventProperties, "pagePath">): void {
  if (typeof window === "undefined") {
    return;
  }

  trackPosthogBatch("$pageview", {
    ...buildPageProperties(),
    ...properties,
  });
}

export function trackPosthogPageLeave(properties?: Omit<PosthogEventProperties, "pagePath">): void {
  if (typeof window === "undefined") {
    return;
  }

  trackPosthogBatch("$pageleave", {
    ...buildPageProperties(),
    ...properties,
  });
}

export function initializePosthogPageLifecycle(): void {
  if (typeof window === "undefined") {
    return;
  }

  initializeWebVitals();

  const startedAt = Date.now();
  let didTrackLeave = false;

  const trackLeaveOnce = () => {
    if (didTrackLeave) {
      return;
    }

    didTrackLeave = true;
    trackPosthogPageLeave({
      durationMs: Date.now() - startedAt,
    });
  };

  trackPosthogPageView();

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      trackLeaveOnce();
    }
  });
  window.addEventListener("pagehide", trackLeaveOnce);
}
