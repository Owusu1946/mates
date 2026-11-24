/**
 * How big the right panel and the terminal drawer may be, after T3 Code's
 * usePreviewPanelInlineSize and ThreadTerminalDrawer.
 */

export const PANEL = { defaultWidth: 540, minWidth: 360, maxFraction: 0.7, chatMinWidth: 360 } as const;
export const DRAWER = { defaultHeight: 260, minHeight: 180, maxFraction: 0.75, threadMinHeight: 160 } as const;

/** The widest the panel can be: 70% of the window, always leaving the chat its 360px. */
export function panelMaxWidth(windowWidth: number, rowWidth?: number): number {
  const fractionCap = Math.floor(windowWidth * PANEL.maxFraction);
  const rowCap = rowWidth === undefined ? Infinity : Math.floor(rowWidth) - PANEL.chatMinWidth;
  // Keep max >= min; an inverted clamp would overwrite the saved width.
  return Math.max(PANEL.minWidth, Math.min(fractionCap, rowCap));
}

export function drawerMaxHeight(columnHeight: number): number {
  const fractionCap = Math.floor(columnHeight * DRAWER.maxFraction);
  return Math.max(DRAWER.minHeight, Math.min(fractionCap, columnHeight - DRAWER.threadMinHeight));
}

export function clampSize(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return Math.min(Math.max(fallback, min), max);
  return Math.min(Math.max(Math.round(value), min), max);
}

/** A saved size, or null when there's none or it isn't a number. */
export function parseSavedSize(saved: string | null): number | null {
  if (saved === null) return null;
  const value = Number(saved);
  return Number.isFinite(value) && value > 0 ? value : null;
}
