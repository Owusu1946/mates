import { useCallback, useState } from "react";

/**
 * Pull-to-refresh state that follows the user's own pull only. Wiring `RefreshControl` to a query's
 * `isFetching` makes the spinner pop up on every background refetch (polling, focus), which reads as
 * the screen glitching; this shows it while a pull is being served, and never otherwise.
 */
export function usePullToRefresh(refresh: () => Promise<unknown>) {
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);
  return { refreshing, onRefresh };
}
