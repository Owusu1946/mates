/** How a received push is shown. A short chat reply is hidden only while this app is open. */
export function notificationPresentation(data: { quietInForeground?: unknown } | null | undefined, appState: string) {
  const quiet = data?.quietInForeground === true && appState === "active";
  return {
    shouldShowBanner: !quiet,
    shouldShowList: !quiet,
    shouldPlaySound: !quiet,
    shouldSetBadge: false,
  };
}
