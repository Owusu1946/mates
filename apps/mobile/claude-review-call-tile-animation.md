# Review: Group Call Tile Animation

## Context

When mates were invited or added to a group call, their tiles appeared shaky. I checked the call UI code and found three animations that could contribute:

- New participant tiles entered with `FadeInDown.springify().damping(18)`.
- The participant grid reflowed with `LinearTransition.springify().damping(20)` when the roster changed.
- A mate in the `joining` state used the animated mascot `waking` state.

I could confirm these behaviors in the code, but I could not reproduce the shakiness on a device.

## Changes made

- In `app/(app)/call.tsx`, participant tiles now fade in over 180 ms, fade out over 120 ms, and use a 180 ms linear layout transition instead of spring animations.
- In `src/call/call-ui.tsx`, the avatar is held still while its participant tile is joining. Its usual animation resumes after joining.

## Verification

- `pnpm typecheck` passed.
- `pnpm test` passed; the mobile package currently contains no tests.
- The animation has not been checked on a device.

## Claude review request

Please review the changes in `app/(app)/call.tsx` and `src/call/call-ui.tsx`. Do the shorter fade and non-spring grid reflow plausibly address shaky tiles when mates are added to a group call? Does holding the avatar still during joining introduce any unintended behavior or visual issues? Check the Reanimated API usage and call out any risks that should be addressed before relying on this fix. I cannot test it on a device, so please distinguish what can be verified from code from what requires device testing.
