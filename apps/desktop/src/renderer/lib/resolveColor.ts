/**
 * A theme token as a concrete colour, for code that can't read CSS (the terminal's canvas).
 * Our tokens are oklch and color-mix, so the browser resolves them: the token is painted onto a
 * 1px canvas and read back as rgba.
 */

let probe: HTMLSpanElement | null = null;
let context: CanvasRenderingContext2D | null = null;

export function resolveColor(token: string): string {
  probe ??= Object.assign(document.createElement("span"), { hidden: true });
  if (!probe.isConnected) document.body.append(probe);
  probe.style.color = `var(${token})`;
  const computed = getComputedStyle(probe).color;

  context ??= Object.assign(document.createElement("canvas"), { width: 1, height: 1 }).getContext("2d", { willReadFrequently: true });
  if (!context) return computed;
  context.clearRect(0, 0, 1, 1);
  context.fillStyle = computed;
  context.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
  return a === 255 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${(a! / 255).toFixed(3)})`;
}
