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

## PR UI verification

Argent verified the production CodeCard component on the iPhone 16 Pro simulator using temporary local fixtures. No coding run was launched. The temporary route was removed afterwards.

- Dark and light themes rendered the PR title, file count, green additions, red deletions and check labels.
- Runtime inspection confirmed theme-specific text colors and accessibility labels for additions/deletions.
- Draft and failed-check fixtures displayed their appropriate states.
- Historical fixtures with missing statistics omitted those values.
- Run details expanded and the Review PR action opened github.com.
- Physical-device, Android and a fresh real code-run response remain rollout checks.

## Task outcome refinement — slice 1

Reviewable mobile-only follow-up for code and computer cards.

- Computer task headers distinguish completed, failed, stopped, approval, login, question and user-control states.
- Terminal computer cards display the saved summary.
- Code results distinguish reviewable PRs, drafts, failed checks and completed runs with warnings.
- Failed code runs no longer claim that nothing was pushed. Existing PR actions remain available.
- Stopped tasks explain that earlier changes/actions remain.
- No retry, approval or cancellation behavior is added.
- Regression checks cover outcome precedence, legacy runs without PRs and every waiting reason.
- Argent verified failed code with an existing PR, a completed computer summary and a stopped computer task using temporary fixtures on the iPhone 16 Pro simulator. Fixtures were removed. A duplicate failure label found during visual inspection was removed.
- API deployment and migrations are unnecessary for this slice. Include it in the mobile release.

Next reviewable slice is response hierarchy for calendar and other app results. Sammy commits and pushes manually after review.

## Task outcome refinement — slice 2

Calendar and general app results now use compact grouped rows instead of repeated filled cards. ISO timestamps in result metadata are shown in the user's local date and time. Metrics render as quiet chips, and long previews are capped to three lines. Product and email results keep their dedicated presentations; existing URLs and follow-up actions are unchanged.

- Added regression checks for local timestamp formatting, ordinary metadata, malformed values and empty subtitles.
- Argent verified the production AppResponseCard in a temporary calendar fixture on the iPhone 16 Pro simulator. Dates displayed locally and the list remained readable. The route was removed after inspection.
- Workspace `pnpm typecheck` and `pnpm test` passed.
- Mobile release only; no API deployment or migration required.
- Physical-device, Android, large-text and light-theme checks remain rollout work.

## Task outcome refinement — slice 3

Long assistant replies have clearer spacing between paragraphs and sections. Links now read as links in the chat. Fenced code renders in a contained panel with a language label when present; code remains selectable. Existing markdown normalization, tables, lists and quote rendering remain in place. No renderer or dependency changed.

- Argent inspected the production RichText component on the iPhone 16 Pro simulator with headings, paragraphs, a list, inline and fenced code, and a quote. The temporary preview route was removed after inspection.
- Workspace `pnpm typecheck` and `pnpm test` passed.
- Mobile release only; no API deployment or migration required.
- Verify light mode, Android, large text and long unbroken code on devices before broad rollout.

## Task outcome refinement — slice 4

When the latest assistant reply is waiting for user input, a compact prompt appears above the composer. It identifies the next action for approval, plan review, app connection, app choice, routine confirmation, browser handoff, or computer task. Tapping it dismisses the keyboard and returns to the waiting reply. The prompt disappears while a run is active or after the latest reply no longer contains an unresolved action.

- Unit checks cover supported waiting actions, resolved and historical cards, active runs and multiple waiting cards.
- Argent verified the prompt and accessibility label on the iPhone 16 Pro simulator; tapping it cleared the fixture prompt. The temporary route was removed.
- Workspace `pnpm typecheck`, `pnpm test`, and `git diff --check` passed.
- Mobile release only; no API deployment or migration required.
- Verify a real approval, app connection, browser and computer wait on iOS and Android before rollout.

## Task outcome refinement — slice 5

For the latest assistant reply, a mate-named “is thinking…” line appears after 300 ms only while the run has no visible tool activity or text. It disappears as soon as the existing ActivityLine or streamed answer takes over, avoiding duplicate progress indicators and short-lived flashes.

- Argent inspected the production status component in a temporary iPhone 16 Pro simulator preview; the preview route was removed.
- Workspace `pnpm typecheck`, `pnpm test`, and `git diff --check` passed.
- Mobile release only; no API deployment or migration required.
- Validate the transition on a slower network and on Android before rollout.
