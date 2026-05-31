import { createElement, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterHistory } from "@tanstack/react-router";

import { AppAtomRegistryProvider } from "./rpc/atomRegistry";
import { routeTree } from "./routeTree.gen";
import { useAppUpdateBootstrap } from "./lib/appUpdateStore";

function AppUpdateBootstrapper({ children }: { readonly children: ReactNode }) {
  useAppUpdateBootstrap();
  return children;
}

export function getRouter(history: RouterHistory) {
  const queryClient = new QueryClient();

  return createRouter({
    routeTree,
    history,
    context: {
      queryClient,
    },
    Wrap: ({ children }) =>
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(
          AppAtomRegistryProvider,
          undefined,
          createElement(AppUpdateBootstrapper, undefined, children),
        ),
      ),
  });
}

export type AppRouter = ReturnType<typeof getRouter>;

declare module "@tanstack/react-router" {
  interface Register {
    router: AppRouter;
  }
}
