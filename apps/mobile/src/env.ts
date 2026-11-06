import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";
export const env = createEnv({ clientPrefix: "EXPO_PUBLIC_", client: { EXPO_PUBLIC_API_URL: z.string().url().optional(), EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1).default("pk_test_placeholder"), EXPO_PUBLIC_CONVEX_URL: z.string().optional() }, runtimeEnv: { EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL, EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY, EXPO_PUBLIC_CONVEX_URL: process.env.EXPO_PUBLIC_CONVEX_URL }, emptyStringAsUndefined: true });
