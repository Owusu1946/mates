import { createContext } from "react";

/** Opens one of your chats from inside another, like a new mate's card. */
export const OpenChatContext = createContext<((chatId: string) => void) | null>(null);
