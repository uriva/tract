"use client";

import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEffect } from "react";

function PostHogInit() {
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      process.env.NEXT_PUBLIC_POSTHOG_KEY &&
      !posthog.__loaded
    ) {
      posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
        capture_pageview: false, // we handle manually below
        capture_pageleave: true,
      });
    }
  }, []);
  return null;
}

function PostHogPageview() {
  useEffect(() => {
    // capture on mount and on route changes via popstate
    posthog.capture("$pageview");
    const onRouteChange = () => posthog.capture("$pageview");
    window.addEventListener("popstate", onRouteChange);
    return () => window.removeEventListener("popstate", onRouteChange);
  }, []);

  // Also capture on pathname changes via Next.js soft nav
  useEffect(() => {
    let prev = window.location.href;
    const observer = new MutationObserver(() => {
      if (window.location.href !== prev) {
        prev = window.location.href;
        posthog.capture("$pageview");
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <PHProvider client={posthog}>
        <PostHogInit />
        <PostHogPageview />
        <TooltipProvider>{children}</TooltipProvider>
      </PHProvider>
    </NextThemesProvider>
  );
}
