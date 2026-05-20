declare module "@vercel/analytics/astro" {
  import type { AstroComponentFactory } from "astro/runtime/server/index.js";

  const Analytics: AstroComponentFactory;

  export default Analytics;
}
