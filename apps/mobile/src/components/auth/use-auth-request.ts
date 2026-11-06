import { useRef, useState } from "react";
import { haptic } from "../../haptics";

export function useAuthRequest() {
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(action: () => Promise<void>) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch {
      setError("Something interrupted the connection. Please try again.");
      haptic.error();
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  return { busy, error, setError, run };
}
