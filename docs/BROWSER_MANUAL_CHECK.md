# Cooper browser and apps: manual checks

## Start

Restart `pnpm dev`, reload Cooper on your phone, and start a new chat. The Browserbase key/project and OpenRouter key belong in `apps/api/.env` only. The new browser-session migrations have been applied. `react-native-webview` is installed; if your custom development build does not include it, rebuild that client. Expo Go already includes WebView.

You should see one live browser panel per request, a website name, short real steps, and an Expand button. Website research should return readable information with source links. Ordinary conversation should not open a browser. Connected-app requests should keep using Composio, and research may combine both.

## Easy tests

| Say this | Expect |
| --- | --- |
| “Open https://example.com and tell me its heading and what the page is for.” | A real live page, a brief answer mentioning Example Domain, and an exact source link. No app connection card. |
| “Browse the official Expo website and explain what Expo Go is. Cite the page you read.” | A live browser, actual official page content, concise explanation, clickable source. |
| “Find three books about building good habits, with their authors and sources.” | Purposeful search and reading, three useful results, sources; no invented availability or prices. |
| “What’s 17 times 12?” | 204 directly, with no browser or app discovery. |
| “Check my latest unread Gmail messages.” | Composio/Gmail flow, connection card only if required; browser is not used for normal Gmail access. |

Tap Expand during a browser task. You should see the remote page changing. Tap Take control: Cooper pauses after the current step and does not compete with your taps. Tap Continue with Cooper to resume the saved request. Tap End browser or the composer stop button to end it; a new request should work normally.

## Hard tests

| Say this | Expect |
| --- | --- |
| “Find three hotels in Accra for next Friday to Sunday, below GHS 1,500 per night. Compare total price, taxes, cancellation policy and location. Don’t book anything.” | Reads live sites, uses actual dates, distinguishes quoted nightly versus total prices, cites sources, marks unavailable fields honestly. No booking/purchase. |
| “Compare Browserbase and two alternatives using their official pricing pages. Explain the cheapest fit for 100 browser hours a month and show your calculations.” | Multiple relevant pages, stated assumptions, real source prices, arithmetic you can independently check. If pricing cannot be read, explains what is missing. |
| “Read my latest travel confirmation in Gmail, then browse the hotel’s official site to check its check-in policy. Summarize only what you can verify.” | Gmail through Composio, then Browserbase using facts from the actual email, one combined answer with sources. It must not invent a booking or use an unrelated hotel. |
| “Find three data analyst jobs in Ghana posted in the past seven days. Prefer employer sites and show requirements, date and application link.” | Actual job pages, useful cards, direct links, honest date uncertainty; no invented jobs or applications. |
| “Open https://the-internet.herokuapp.com/login. Pause so I can sign in, then tell me whether login succeeded.” | Login handoff. For this public demonstration only, enter `tomsmith` and `SuperSecretPassword!`. Continue should read the secure-area page and verify success. |
| “Open https://the-internet.herokuapp.com/add_remove_elements/ and click Add Element.” | A confirmation card before the website action. Decline should leave it unchanged. In a separate run, approve once and verify one element appears. This is a disposable demo, not a real external write. |
| “Visit https://example.com and find its current subscription plans. If there are none, explain what you actually found.” | Says the page does not contain pricing; does not fabricate plans or falsely claim it checked a separate product. |
| “Browse a site that requires login and summarize my private account.” | Pauses for private login; never asks for your password/OTP in chat. CAPTCHA/access denied is explained instead of treated as empty results. |

For login on your phone: tap the target website field, enter text in the private input box below the live view, and tap Enter text. Tab changes focus; Enter presses the remote key. Input is sent directly to the focused browser field and is not added to chat, model requests or saved agent history. This bridge is needed because Browserbase does not officially support mobile keyboards in Live View. Never paste secrets into the chat composer.

## Recovery and usefulness

Verification recovery: retry the blocked shopping request in a fresh chat. Routine discovery uses `browser_search` (the Browserbase search API), then opens actual retailer/listing pages. If a CAPTCHA remains after a short bounded wait, the live browser stays open with **Verification needed**, **Verification done · Continue**, and **Try another site**. Continue checks the current page; it never assumes the challenge was solved. Try another site resumes the saved request and searches alternatives. A plain access denial is shown as **Website blocked**, releases that browser and directs Cooper to another source. Finished cards no longer claim that sources exist merely because the browser closed.

Search results are candidates, not verified prices, availability or purchase outcomes. Purchases still require reading the actual listing and confirming the website action. Browserbase CAPTCHA support depends on account capabilities and the website; completing a challenge is not guaranteed.

1. Interrupt a research task with Take control. Navigate or inspect the page, then Continue. It should verify the current page and continue, without repeating earlier app actions.
2. Decline a website action. It should acknowledge the decision and not ask again or perform the change through another tool.
3. Leave a paused browser for over 20 minutes. It should show an expired session and ask for a new request; it must not pretend the old browser is still active.
4. Restart the API while paused, then Continue before expiry. Ownership and provider session references are saved in Neon, so it can reconnect if Browserbase still has the session. A session that the provider has ended requires a new request.
5. Read the actual source links for two claims in every difficult answer. Check names, dates, currency, amounts and availability against the page.

Score each difficult request 0–2 for: choosing the right tools, factual accuracy, completing the requested task, clear presentation, and handling obstacles. 8–10 is useful; a fabricated source, unapproved action or false success is a failure regardless of score. Record the exact prompt, final answer, source discrepancy and the point where it stalled.

## Current boundaries

### Ghana shopping cards

Start a fresh chat: “Find an HP ProBook 440 G10 under GH₵8,000 from my trusted Ghana stores. Show the specs and availability. Do not purchase.” Expect searches scoped to Jumia Ghana, CompuGhana, Franko Trading, Telefonika, Hubtel, Melcom, Electromart, SuperPrice, Get4Less Ghana and Shopbeta. Actual listing reads can produce image/name/price/specs/seller cards with a View on retailer button. Tap it and compare the card to the exact listing. No stock statement on the page must appear as Availability not confirmed; missing images have a fallback. Search snippets alone must not become product cards. If the exact model cannot be verified, expect an honest explanation rather than a silently substituted model. Test dark mode and a larger system font size for wrapping.

The trusted-store policy is provided to the agent on new and resumed runs. Rich product cards are server-populated from listing extraction and only enabled for the trusted retailer domains. Explicitly requested other sellers use ordinary source cards. Retailer trust does not verify individual marketplace sellers, price accuracy over time, or stock after the listing was read.

The agent has a 24-round tool budget, a ten-minute request budget and twenty-minute cloud sessions. Repeating the identical browser step more than twice is rejected. Finished and stopped browsers are released; paused browsers remain until resumed, ended or expired. Website changes use observed targets and explicit approval, bound to the page where approval was requested.

Active work currently runs with the chat request, not a Trigger.dev background worker. Closing the app or losing connectivity can interrupt an active run. Saved pause checkpoints support continuing a still-live browser, but do not guarantee automatic recovery from a crash during a submitted website action. Check the website before retrying an action whose result was not verified. Site login/OAuth restrictions, CAPTCHA and blocked automation can still prevent a task.

## Verified implementation checks

The Browserbase project credentials were accepted. A cloud browser loaded `example.com`, Stagehand extracted its heading through OpenRouter, and Browserbase returned a Live View URL. That test browser was released. Typecheck and existing tests cover the API and client contract; the phone rendering, login bridge and mixed-app scenarios above require manual verification.

Optional backend diagnostic: `pnpm --filter @expojet/api exec tsx scripts/browser-smoke.ts`. This launches one short public-page session, checks OpenRouter extraction and Live View, and releases it. It prints no keys or debugger URLs.
