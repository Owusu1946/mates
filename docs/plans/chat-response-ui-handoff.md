# Chat response UI — Ken handoff

Branch `feat/chat-response-ui`. Sammy reviews and commits manually.

## Behavior

Email results show three compact rows with readable previews and dates. Show all expands the saved results. Tapping a row opens a native sheet with the saved preview and an external Gmail action when a URL is available. The sheet explicitly labels its content as a shortened preview.

The API strips email markup and long payloads before truncating fallback previews, cleans model-presented Gmail previews, rejects schema placeholder titles, and builds Gmail links without a hardcoded account slot. Mobile also cleans saved previews so existing conversations benefit.

Finished code runs with a PR show its title, draft/review state, available file/addition/deletion counts, and check results. Addition counts are green, deletion counts red, with explicit symbols and accessibility labels. Missing historical counts stay absent. Activity and stop behavior remain available through their existing entry points.

## Verification and rollout

- Run workspace typecheck and tests.
- API deployment activates cleanup for newly generated cards. Mobile release activates compact lists, historical cleanup, preview sheets and PR styling.
- No migrations or new environment variables.
- On iOS and Android, check short/long emails, raw HTML, empty previews, more than three results, opening/closing sheets, Gmail link failure, large text and dark/light mode.
- Test historical PRs with missing counts, zero counts, draft PRs, failing checks, cancelled runs, failed runs with an existing PR, and active-run cancellation.
- Verify reduced motion and screen-reader labels.
- Inspect a fresh Google Calendar versus Gmail lookup. Argent confirmed saved email cards under the googlecalendar toolkit in Kwame’s chat. Mobile recognizes historical calendar cards only when all non-placeholder IDs match email IDs and a majority have email sender metadata. The API now partitions mixed-app result evidence and prevents unscoped workbench output contaminating every app map. Verify fresh mixed Gmail/calendar lookups after API deployment.
- Email bodies remain saved previews capped by the current contract. Full bodies and inline code diffs require separate data endpoints.
- The text extraction is for display. It never renders supplied HTML or executes embedded content.

Regression checks cover HTML-head removal before truncation, placeholder omission, tracking/payload cleanup, old-card readability, date formatting and Gmail URL construction. Argent verified Kwame’s historical compact list, opening/closing a preview sheet, and Show all on the iPhone 16 Pro simulator. Physical-device and Android checks remain pending.
