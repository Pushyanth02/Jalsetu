"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Every response in this build is served by the in-browser API shim
            // over the committed snapshot, and the mutation that changes data
            // invalidates the keys it touched. So a generous default TTL costs
            // nothing in freshness and removes refetch churn when moving between
            // views. Views that must feel live set refetchInterval explicitly.
            staleTime: 60_000,
            gcTime: 10 * 60_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      })
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
