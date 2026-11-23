# Rides end to end — implementation and Ken handoff

**Branch:** `feat/ride-end-to-end`  
**Status:** Ride-card slice is at `447654b`; Sammy committed the Morning brief merge at `b4ef81e`. Commute integration and migration `0050` are unstaged for a separate review. This handoff is untracked; no deployment by the agent.

## Scope and current state

- Sail already resolves named pickup and destination places, compares Yango, Bolt, Uber, and public transport, and posts a typed Rides card. `RIDES_ENABLED` gates the API and worker.
- Each supported ride row now has an outbound action. Uber and Yango links include the resolved pickup and destination. Bolt opens its official rides page and explicitly asks the user to set the route there because no documented route-prefill link was verified.
- Prices are labelled “Estimate now” and the existing stale-quote refresh remains.
- Booking remains outside Mates.

## Files for review

- `apps/api/src/mcp/ride-links.ts`: provider-owned link builder and coordinate validation.
- `apps/api/src/mcp/ride-conversation.ts`: passes resolved points to the card builder without adding them to model tool results.
- `apps/api/src/mcp/ride-card.ts`, `apps/api/src/agent-chat.ts`, `apps/api/src/integrations.ts`: typed handoffs on the card rows.
- `apps/mobile/src/chat/rides-card.tsx`: provider buttons, fallback on open failure, and estimate label.
- `apps/api/src/mcp/ride-conversation.test.ts`: card/model separation and link tests.
- `apps/api/.env.example`: optional `UBER_CLIENT_ID` for Uber's web fallback.

## Privacy and provider limits

The model-facing ride summary still contains no coordinates. Card action URLs now contain the coordinates Sail resolved from the user's named places and persist with the chat card so a later tap opens the same route. This changes the earlier Sail handoff's “no coordinates in durable card” decision; review the chat retention and privacy copy before rollout. The explicit device-location flow still sends only a reviewed address to chat and does not put device GPS coordinates in these card URLs.

Uber's native `uber://riderequest` link carries both points; the web fallback uses Uber's documented JSON location parameters. Ken should set the optional public `UBER_CLIENT_ID` for the fallback and verify both installed and uninstalled behavior on iOS and Android. Yango's `yango.go.link/route` includes its official store/web fallback. Bolt currently has no verified route-prefill format; do not describe its button as prefilled. If Bolt supplies a supported partner link, update only `ride-links.ts` and its test.

## Deployment and device checks for Ken

1. Review `RIDES_ENABLED` on the API and Trigger worker and keep the existing rollout state until device checks pass.
2. Set `UBER_CLIENT_ID` on the API if Uber web fallback will be supported; this is a public app identifier, not an API secret. No new native build dependency or migration is introduced by this slice.
3. With a safe test API/worker, compare a named trip in Ghana. Tap each row on iOS and Android with the app installed and uninstalled. Confirm Uber/Yango receive both points, Bolt opens its official page with the in-card route-entry note, and no Mates booking occurs.
4. Confirm a failed app open uses the web fallback, older card versions without handoffs still render, quote refresh works, and a stale quote is marked as such.
5. Review persisted card URLs and account deletion against the privacy decision above.

## Morning brief integration

Morning brief is now merged from `feat/morning-brief-v2` at `b4ef81e`. The unstaged commute slice adds a "Start from" setting, shares one calendar read between calendar and commute sections, checks the next physical meeting through Sail, and posts a ride estimate with a provider action. It skips when the origin is absent, a place is ambiguous, an event is online or all-day, Sail returns no valid Ghana quote, or `RIDES_ENABLED` is off. Quote selection is code-controlled; the existing brief model selects whether the candidate appears.

Migration `0050_flaky_vance_astro.sql` adds the nullable `commute_origin` setting. Apply it after `0047`, `0048`, and `0049`. For safe rollout, users must explicitly enable the Commute section and enter an origin; existing briefs keep that section off.

**Travel time limitation:** A live public Sail ride lookup on 2026-11-23 returned `etaMinutes` (pickup wait) but no trip duration. The collector never uses pickup wait as travel time. It shows “Leave by” only if a ride option later supplies a valid `durationMinutes`; today the expected line has meeting time, location and “estimate now” fare without a leave-by claim. Ken should confirm whether Sail has a supported travel-duration field or arrange a separate route-time source before describing leave-by as shipped.

Ken should verify a calendar event with a physical location, an unambiguous origin such as a name plus address, price/action display, feedback muting, no-connected-calendar behavior, and missing/partial Sail results. The brief setting and collector use Ghana (`country: gh`); do not enable it for other countries until origin and region selection are designed.

## Sources

- [Uber deep links](https://developer.uber.com/docs/riders/ride-requests/tutorials/deep-links/introduction)
- [Yango ride request links](https://yango.com/en_int/partner-program/documentation/)
- [Bolt rides page](https://bolt.eu/en/rides/)
