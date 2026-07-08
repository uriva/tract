import { captureClientErrors } from "@uri/anomalisa";
import posthog from "posthog-js";

captureClientErrors({ token: "822058c2-c9a9-42c6-8d89-b84dca588419" });

posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
  api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  capture_pageleave: true,
});
