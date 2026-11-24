/**
 * Runs an element's CSS animation only while it's on screen, the window is visible and the
 * system allows motion (T3 Code's lib/visibleAnimation). Use as a ref callback; the animation
 * reads `--visible-animation-state` (see the `live-shine` utility in styles.css).
 */

type Observed = { element: HTMLElement; intersecting: boolean };

const animations = new Map<Element, Observed>();
let observer: IntersectionObserver | null = null;
let reducedMotion: MediaQueryList | null = null;

function update(animation: Observed) {
  const running = animation.intersecting && document.visibilityState === "visible" && !reducedMotion?.matches;
  animation.element.style.setProperty("--visible-animation-state", running ? "running" : "paused");
}

function updateAll() {
  for (const animation of animations.values()) update(animation);
}

export function observeVisibleAnimation(element: HTMLElement | null) {
  if (!element) return;
  element.style.setProperty("--visible-animation-state", "paused");

  if (!observer) {
    reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedMotion.addEventListener("change", updateAll);
    document.addEventListener("visibilitychange", updateAll);
    observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const animation = animations.get(entry.target);
        if (!animation) continue;
        animation.intersecting = entry.isIntersecting;
        update(animation);
      }
    });
  }

  const animation = { element, intersecting: false };
  animations.set(element, animation);
  observer.observe(element);

  return () => {
    if (animations.get(element) !== animation) return;
    animations.delete(element);
    observer?.unobserve(element);
    if (animations.size === 0) {
      observer?.disconnect();
      observer = null;
      reducedMotion?.removeEventListener("change", updateAll);
      reducedMotion = null;
      document.removeEventListener("visibilitychange", updateAll);
    }
  };
}
