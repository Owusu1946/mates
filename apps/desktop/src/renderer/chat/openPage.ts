import { createContext } from "react";

/**
 * Opens a web page in the panel beside the chat, like a citation or a source (PagePanel.tsx); null
 * where there's no panel (previews), and the link opens in your browser instead.
 */
export const OpenPageContext = createContext<((url: string) => void) | null>(null);
