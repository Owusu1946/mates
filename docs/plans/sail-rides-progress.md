# Sail rides progress and handoff

**Status:** Batch 3 in progress — ride and location cards added; device and end-to-end verification remain outstanding.
**Branch:** `feat/sail-rides-integration`  
**Last updated:** 2026-11-16

Read alongside [Ken's Sail rides and MCP handoff](sail-rides-and-mcp-handoff.md). This file tracks decisions, verification, and the eventual handoff; it does not replace the original scope.

## Product direction

- Let a user ask for ride prices or public transit between two places, for example Spintex to Accra Mall. Show only options Sail actually returns, with approximate prices, timing and attribution.
- In a distance or travel-time conversation, offer to check rides or trotro as a useful next step, carrying the confirmed origin and destination forward. Whether to fetch prices automatically or only after a tap is still to be decided.
- Treat “order me an Uber” as an intent to help the user book: compare or select an available service, then open the provider's app or website when the user chooses. Do not claim a ride is booked or request one without an authorized booking integration. Sail's public MCP tools are read-only.
- Support trotro alongside ride-hailing where Sail returns a route; make steps accessible without crowding the answer. Samuel confirmed “troski” means trotro, not a separate service.
- Support named places and saved home/work when clear. For “from here,” request the phone's location only when needed and after a clear user action; allow a typed starting point instead.

## Status checklist

- [x] Ken's original handoff merged into main.
- [x] Reviewed the example conversation in `ride.png` and documented the desired follow-up flow.
- [x] Confirmed Sail publicly documents a free, read-only MCP server; verify the live tools again before implementation.
- [ ] Agree on quote-fetch behavior after a distance answer, place disambiguation, and what “order” means in the UI.
- [ ] Resolve coordinate privacy, retention, and the location resume protocol before building.
- [ ] Implement and test Phase 1 against the agreed plan; chat integration and initial cards are present behind a flag, but device and end-to-end verification are outstanding.
- [ ] Verify Apple device behavior for Uber, Yango and Bolt; record exact results below.
- [ ] Have Ken review the backend implementation, deployment, and operating assumptions.

## Proposed implementation batches

These are review checkpoints, not permission to commit or push. Samuel reviews each batch before the next.

1. **MCP foundation and Sail adapter:** use the official MCP SDK, fixed system-server configuration, allow-listed tools, validated responses, limits/timeouts, and a testable curated ride tool. Follow the original handoff's shared-layer scope, including the bridge; agree with Ken before deferring any part. No user-added server feature in Phase 1.
2. **Agent integration and conversation:** intent routing, place resolution and choice, safe summaries, typed result/card contract, ride and transit cases, explicit unavailable/partial results, and feature flag. Ensure distance follow-ups retain the relevant trip context.
3. **Location and ride cards:** permission and fallback UX, validated resume, provider links, accessible compact ride/transit cards and stale quote handling. A native build is needed for location configuration.
4. **End-to-end validation and handoff:** run automated checks and real-device tests; document provider support, deployment, rollout and remaining work.

Exact boundaries can change after review. No commits, pushes, builds or deployments were performed by the agent.

## Batch 1 work log

- Added the official MCP TypeScript SDK, a fixed Sail allow-list, a short-lived client with a 15-second deadline per request, pagination and a 64 KB streaming response limit, and a deterministic tool-name bridge. Transport and protocol failures are mapped to concise errors without exposing upstream response bodies.
- Added the curated ride tool and adapter with input validation, explicit place choices, ride filtering and nested partial-result handling. A live `search_places` check found that some results omit coordinates; these must be resolved before planning. Live tool discovery, place resolution, an Accra Mall search, transit planning, and an Osu-to-airport comparison were checked on 2026-11-16; returned providers and prices are time-dependent.
- No coordinates or trip results are cached. The generic bridge is not exposed to user-added servers, and it is not a complete Phase 2 security or schema-sanitization solution.
- Focused tests cover tool discovery, allow-listing, oversized responses, failures, partial results, place resolution and ambiguity. No coordinate or quote cache is included in this batch: retention, user isolation and freshness must be decided before introducing one. The original handoff's cache and general user-server policy remain follow-up work; the bridge must not be exposed to untrusted user-added servers without the Phase 2 security design. A real-device test and a successful end-to-end run are still outstanding.
- Review follow-up: preserve valid transit when a ride branch is malformed, drop invalid ride entries individually, bias a place search with a known endpoint, and support JSON text content when structured content is missing. The model-facing schema allows an omitted origin, but handling “here”, home/work, and converting model arguments into validated internal requests belongs to the next integration batch.

## Batch 2 work log

- Added the `RIDES_ENABLED` flag, agent tool registration and activity label, with zero-cost Sail usage events. The flag defaults off and must be configured for the process running the agent, including the Trigger worker.
- Added a compact text-based conversation result, filtering raw coordinates and upstream error details out of tool results. The user can give named places; an unresolved home/work/current location asks for a place instead of guessing. Ambiguous places prompt for clarification in the conversation.
- No device location is collected in this batch. A user-provided chat message or model tool arguments may still contain location text and are subject to existing chat retention. The next batch must design and verify the location resume and any persistent card payload before claiming location is not stored.
- Cards, provider links, a dedicated selection UI, real-user end-to-end testing, and the native location flow remain outstanding. The current text-only flow has not been verified against a running API and Trigger worker.
- Review fixes: country is required from the conversation rather than inferred from timezone; available rides without a price remain visible; a clarification disables further tools for that response; and Sail usage is recorded only when its lookup starts, using a run/tool-call idempotency key. Ambiguous-place identifiers are not preserved across separate turns yet, so a clarification can require a more specific place name; proper selection remains outstanding.

## Batch 3 work log

- Added SDK-compatible `expo-location`, foreground permission text, a compact rides/trotro card and an explicit share-location card. After user consent, Expo Location reverse-geocoding prepares a nearby address in the composer for the user to review and send; platform geocoding may send coordinates to its provider. It does not put device coordinates in `choice` or a durable job request; a sent address is normal retained chat text and is shared with Sail. This is an intentional change from the handoff's coordinate-based pause/resume approach.
- Uber opens the `uber://riderequest` scheme with a web fallback, without a prefilled trip. On iOS, Bolt and Yango buttons open their App Store listings; on Android they open a Google Play search. These provider links have not been tested on a device. Every action asks the user to enter the trip in the provider app.
- The card presents options returned by Sail, expandable transit steps, estimated-price wording, a stale-price warning and a one-time composer refresh prompt. It distinguishes a capped list (“Showing the first 8 ride options”) from an incomplete provider result. `RIDES_ENABLED` still defaults off. No location or provider flow has been verified on a device, and the current development build must be rebuilt for the native location module.
- A location card is emitted only when the latest user message explicitly asks to use their current location and the model also requests `here`/`my location`. The app requires a user tap before requesting permission. Duplicate taps are guarded while location lookup is running. After preparing an address, the card asks the user to review and send it; preparing the address again after clearing the draft remains a follow-up UX improvement.
- The flow does not yet implement stable place-ID selection across turns, direct coordinate handoff, or a fully automatic resume. These and the genuine review/deployment checks remain outstanding.

## Decisions and constraints to resolve

Recommendations below are proposed for discussion, not yet approved implementation decisions:

- **Location:** show an in-app Share location / Enter a place choice whenever a new trip needs current location, even if the OS permission was granted earlier. Request foreground permission when needed; the OS may not display its prompt every time. Handle denial and offer a typed origin. Disclose that the trip is sent to Sail.
- **Retention:** keep the precise coordinates out of durable chat messages, logs, memory, analytics and shared caches where feasible. Prefer a short-lived, user-and-run-bound location value for retries/resume and expire it promptly; verify lifecycle and deletion in code. The route card may retain human-readable places and prices, and opening a provider later may require re-resolving places or asking again. Do not claim zero retention until the data flow is proven.
- **Distance follow-up:** offer a subtle “Check rides” action after answering a distance question; fetch automatically when the user explicitly requests prices, without an extra tap. Include trotro where available.
- **Ambiguity:** ask a short place choice when multiple meaningful matches remain, especially for imprecise pickup; proceed with a clear match.
- **Handoff to providers:** show “Open Uber/Yango/Bolt” only for a verified route or truthful fallback; the user confirms in the provider app. Never say a ride was booked by Mates.
- **Phase 1 MCP scope:** implement a lean shared client, registry and Sail adapter and the handoff's bridge, but leave user-server UI, credential storage, OAuth and production approval machinery to Phase 2. Review security before activating arbitrary servers.

- **Location retention:** the original handoff says coordinates are never stored, but proposes putting them in run messages and card payloads. Existing agent runs persist messages. Decide which data must be persisted for resume/history, its retention and deletion, and ensure the privacy text reflects the actual design. Avoid placing coordinates in logs or unscoped shared caches.
- **Resume:** `waiting_choice` validates listed choices; a location needs its own authenticated, run-bound and validated continuation. Define how coordinates get to the adapter without relying on a model to reproduce them, and cover expired or duplicate responses.
- **Ambiguous places:** define how to detect multiple plausible matches and ask the user; do not silently choose an unrelated top result. Decide how to handle a broad origin such as “Spintex” when precise pickup is required.
- **Offer vs fetch:** decide whether a distance answer automatically fetches a quote, offers a “Check rides” action, or does so only when requested. Do not imply a live quote unless it was fetched.
- **Availability and freshness:** support no results, one provider, partial or stale data, provider outages and transient failures. Do not promise all providers or fixed pricing; distinguish a ride estimate from a confirmed price.
- **Links:** Uber offers documented deep links; confirm exact parameters and device behavior. Yango and Bolt prefilled links are unverified. Prefer a truthful provider-app or website fallback; don't promise a prefilled ride where unsupported. Verify opening behavior before claiming an app-install fallback works.
- **Transit data:** preserve the route, boarding and transfer details Sail actually returns, and label timetabled estimates appropriately. Don't represent every transit journey as a ride-hailing booking.
- **Shared MCP security:** treat tool outputs and descriptions as untrusted. Bound responses and timeouts; scope caches to prevent cross-user leakage. User-added servers, credentials, authorization, SSRF protections and tool reapproval remain Phase 2 and need their own security review before use.
- **Sail operating terms:** Ken to confirm attribution, commercial/production usage, request limits, provider coverage, and any supported booking or partner API.
- **Privacy and deployment:** disclose the trip/location data sent to Sail where appropriate. Ken to verify API and Trigger worker deployments, feature flag, monitoring, rate limits and rollout; do not enable in production before validation.

## Validation plan

- Unit and integration tests for MCP handling, real schema validation, timeouts, errors, partial data, request/response limits, caching isolation, place ambiguity, mode selection and safe output.
- Tests for authorized location resume, denial, malformed coordinates, expired or duplicate requests, no unintended retention and chat/account deletion behavior.
- Chat tests for a distance follow-up, direct price request, “order” intent, trotro route, unavailable providers and disabled feature flag.
- Manual iOS device tests for location permission/denial, provider handoff, app-not-installed behavior, stale estimates, transit steps, and testing with the API and worker in a safe environment.
- Run `pnpm typecheck && pnpm test`. Do not treat a successful local MCP response as proof of production access, booking support, or provider coverage.

## Provider link findings

| Provider | Current status | Device result |
| --- | --- | --- |
| Uber | `uber://riderequest`, then `https://m.uber.com/`; trip is not prefilled. Shown on iOS and Android. | Not tested |
| Yango | iOS App Store listing; Android Google Play search. Trip is not prefilled. | Not tested |
| Bolt | iOS App Store listing; Android Google Play search. Trip is not prefilled. | Not tested |

## References

- [Sail integration and MCP capabilities](https://sailrides.co/about/integrate)
- [Expo SDK 57 Location](https://docs.expo.dev/versions/v57.0.0/sdk/location/)
- [Uber deep links](https://developer.uber.com/docs/riders/ride-requests/tutorials/deep-links/introduction)
- [MCP Streamable HTTP transport](https://modelcontextprotocol.io/specification/latest/basic/transports/streamable-http)
- [OWASP MCP Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/MCP_Security_Cheat_Sheet.html)
