import { focusManager, QueryClient } from "@tanstack/react-query";
import { AppState, Platform } from "react-native";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      gcTime: 1000 * 60 * 60 * 24,
      // Coming back to the app refreshes what is older than staleTime: a friend's
      // review or comment written meanwhile used to wait for a pull-to-refresh.
      refetchOnWindowFocus: true,
    },
    mutations: {
      retry: 0,
    },
  },
});

// On the web React Query already listens to visibilitychange. On iOS and
// Android "focus" is the app returning to the foreground.
if (Platform.OS !== "web") {
  focusManager.setEventListener((handleFocus) => {
    const sub = AppState.addEventListener("change", (state) => handleFocus(state === "active"));
    return () => sub.remove();
  });
}
