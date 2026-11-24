import { createContext } from "react";

/** Opens a coding run from anywhere in a chat, like a run card in Yaw's messages. */
export const OpenRunContext = createContext<(runId: string) => void>(() => {});
