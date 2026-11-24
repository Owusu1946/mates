/**
 * One timer for every running clock in the window, aligned to the second (T3 Code's
 * client-runtime `secondTick`). It runs only while something listens.
 */

type Listener = () => void;

const listeners = new Set<Listener>();
let timer: ReturnType<typeof setTimeout> | undefined;

function schedule() {
  timer = setTimeout(() => {
    for (const listener of listeners) listener();
    if (listeners.size) schedule();
    else timer = undefined;
  }, 1000 - (Date.now() % 1000));
}

export const secondTick = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    if (!timer) schedule();
    return () => {
      listeners.delete(listener);
      if (!listeners.size && timer) {
        clearTimeout(timer);
        timer = undefined;
      }
    };
  },
};
