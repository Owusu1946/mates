import { useAuth } from "@clerk/expo";
import type { UsageResponse, UsageWindowState } from "@expojet/api-contract";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { onUsageChange, runRequest } from "../chat/background-chat";

export type Usage = UsageResponse;
export type UsageWindow = UsageWindowState;

/** From this share of a window on, the composer gently says how much is used. */
export const NEARLY_USED_PCT = 80;

/**
 * Where you stand on your plan: refreshed after every run, whenever the API says you're out, and
 * the moment a used-up window resets, so a block lifts on time without pulling to refresh.
 */
export function useUsage() {
  const { getToken, userId } = useAuth();
  const client = useQueryClient();
  const key = ["usage", userId];
  const query = useQuery({
    queryKey: key,
    queryFn: () => runRequest<Usage>(getToken, "usage"),
    enabled: !!userId,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });

  useEffect(() => onUsageChange(() => void client.invalidateQueries({ queryKey: ["usage"] })), [client]);

  const resetsAt = query.data?.blocked?.resetsAt;
  useEffect(() => {
    if (!resetsAt) return;
    const wait = new Date(resetsAt).getTime() - Date.now();
    // Timers longer than ~24 days overflow; a weekly reset is refetched by the interval instead.
    if (wait > 2 ** 31 - 1) return;
    const timer = setTimeout(() => void client.invalidateQueries({ queryKey: ["usage"] }), Math.max(0, wait) + 1_000);
    return () => clearTimeout(timer);
  }, [client, resetsAt]);

  return query;
}

export const windowName = (kind: UsageWindow["kind"]) => (kind === "5h" ? "5-hour limit" : "weekly limit");

/** "3:40 PM" today, "tomorrow 9:05 AM", or "Fri 9:05 AM" within the week. */
export function resetTime(resetsAt: string, now = new Date()) {
  const at = new Date(resetsAt);
  const time = at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const days = Math.round((startOfDay(at) - startOfDay(now)) / 86_400_000);
  if (days <= 0) return time;
  if (days === 1) return `tomorrow ${time}`;
  return `${at.toLocaleDateString(undefined, { weekday: "short" })} ${time}`;
}

/** "2 h 10 m", "45 m", "3 d". */
export function resetIn(resetsAt: string, now = new Date()) {
  const minutes = Math.max(1, Math.ceil((new Date(resetsAt).getTime() - now.getTime()) / 60_000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days) return hours ? `${days} d ${hours} h` : `${days} d`;
  return hours ? (minutes % 60 ? `${hours} h ${minutes % 60} m` : `${hours} h`) : `${minutes} m`;
}

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

/** The window to talk about: the blocking one, else the fullest one past NEARLY_USED_PCT. */
export function usageNotice(usage: Usage | undefined) {
  if (!usage) return null;
  if (usage.blocked?.reason === "no_plan") return { kind: "no_plan" as const };
  if (usage.blocked) return { kind: "blocked" as const, window: usage.blocked.reason, resetsAt: usage.blocked.resetsAt };
  const fullest = [...usage.windows].sort((a, b) => b.usedPct - a.usedPct)[0];
  if (fullest && fullest.usedPct >= NEARLY_USED_PCT) return { kind: "nearly" as const, window: fullest.kind, usedPct: fullest.usedPct, resetsAt: fullest.resetsAt };
  return null;
}
