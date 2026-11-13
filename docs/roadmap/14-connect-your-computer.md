# 14 · Connect your own computer

## What competitors do
- **Dots:** connect your Mac in the desktop app. The dot can then use files on the Mac, run local tasks and skills, and use the Mac's browser for sites the cloud browser can't reach.
  - The Mac must be online with the app running.
  - Connecting another computer disconnects the previous one.
  - Sources: [mobilelaby](https://mobilelaby.com/blog-entry-openai-dots-24-hours-working-ai-impressions.html), [OpenAI](https://openai.com/index/introducing-dots/)
- **Grok Bot:** desktop apps for macOS, Windows and Linux. On Mac it reaches Messages, Mail, Notes, Reminders, Calendar, Contacts and Location, each switched on separately and confirmed by macOS privacy prompts. ([9to5Mac](https://9to5mac.com/2026/11/12/grok-bot-for-mac-adds-integration-with-apple-mail-messages-notes-and-more/), [docs.x.ai FAQ](https://docs.x.ai/grok-bot/faq))

## How it works for users
- Install **Mates for Mac** (later Windows), sign in, and choose what to allow:

  | Access | What it allows |
  |---|---|
  | Files | specific folders |
  | Browser | your Chrome profile, for logged-in sites |
  | Messages | read and send iMessages |
  | Mail, Notes, Calendar, Reminders, Contacts | read and write in those apps |

- Then, from your phone: "Find the signed contract in my Documents and send it to Ama", or "Read my last iMessages from Kojo and draft a reply".
- **The menu bar icon** shows when a mate is using the computer, with **Pause all**.
- **One computer at a time,** like Dots.

## Architecture
1. **Desktop app: Tauri 2 (Rust core with a web UI).** Its bundle is far smaller than Electron's, and Rust handles the native bridges. Use Electron only if we need Node-heavy tooling.
2. **Outbound-only connection.** The app opens a persistent **WebSocket to our API** (`wss://…/v1/devices/link`), authenticated with a device token minted from the user's Clerk session. There are **no open ports and no tunnels to manage**. Projects such as MCP Loop and Aura use the same pattern. ([MCP Loop](https://github.com/xsip/mcp-loop), [Aura](https://glama.ai/mcp/servers/XRSec/Aura))
3. **A local MCP server inside the app,** bound to `127.0.0.1` only, exposing scoped tools:
   - `files.search | read | write` (allowed folders only);
   - `browser.open | read | act` (Playwright attached to the user's Chrome over CDP, with explicit permission);
   - `messages.read | send` (AppleScript and the Messages database, read-only, which needs Full Disk Access; sending goes through AppleScript);
   - `mail.*`, `notes.*`, `calendar.*`, `reminders.*`, `contacts.*` (EventKit, Contacts, AppleScript).
4. **The server relays tool calls** from runs to the linked device over the socket and returns the results. Calls time out after 60 seconds; if the computer is offline, the mate says so.
5. **Permissions in layers:**
   1. the user's per-capability toggles in the app;
   2. macOS TCC prompts;
   3. **approval rules (01)** for sends and deletes;
   4. a local **allowlist of folders**.

   Every call is logged locally and on the server.
6. **Distribution:** a signed and **notarised** macOS app (Apple Developer ID), auto-updates through Tauri's updater, outside the Mac App Store (sandbox rules would block Messages and AppleScript).
7. **Usage:** no provider cost. Runs are metered as usual.

## Cost
$0 to us beyond runs. Code signing is already covered by the Apple developer account.

## Delivery
1. Mac app skeleton, sign-in, the device link socket, Files and Calendar/Reminders/Contacts tools.
2. Mail, Notes, Messages (with Full Disk Access guidance).
3. Browser control through the user's Chrome.
4. Windows (Files and browser first).

## Open decisions
- Ship this before or after the cloud computer (13)? We recommend after 13 for general tasks. This one is the only route to Messages and Notes, so prioritise it if those are the asks.
- Allow more than one linked computer per account? We recommend one at a time, like Dots.
