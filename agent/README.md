# Surf agent

This agent takes **user preferences + surf data from the database** and decides **whether to notify the user** (and about which spot / time).

## Plain-language flow (end to end)

1. **Get the user’s preferences** (skill level, max distance, etc.)
2. **Pick candidate surf spots** (near current location if available; otherwise by region)
3. **Fetch surf conditions** from the database for those spots
4. **Turn raw numbers into simple labels**, filter out obviously bad/unsafe options, and **score** the rest
5. **Stop early if nothing looks viable** (no notification)
6. If there *are* viable options:
   - **Sometimes decide immediately** (when one option is clearly best)
   - Otherwise, use a small amount of AI reasoning to pick the best option and explain why
7. **Self-review** the decision (must be consistent with the scored candidates; reject if confidence is too low)
8. Apply **notification rules** (quiet hours, do-not-spam interval)
9. Return the final `notify: true/false` decision

## Token-efficient reasoning (no “AI for its own sake”)

- **Early exit**: after scoring, if nothing meets `earlyExit.minScoreThreshold`, the agent stops and returns `notify: false` (no LLM call).
- **Gated LLM**: only call the decision LLM when at least one candidate/window is good enough.
- **Preference-based “reasoning need”**: the agent estimates how much judgement is needed from the user’s preferences (risk tolerance, notification strictness, max comfortable wave size, max distance), plus context (forecast windows, recent notifications).
- **Obvious-winner shortcut**: only used when the choice is clearly safe **and** reasoning-need is low.
- **2-tier AI**: when trade-offs exist, use a **tiny** structured gate first (cheap). If forecast windows exist, the tiny gate only chooses **stop** or **use_full** (it won’t “decide now” without seeing the future windows). If reasoning-need is high, skip straight to the full prompt; otherwise only run the full prompt when the tiny gate says it’s needed.
- **Scoring context**: the AI is told the scores come from deterministic logic (based on wave height/period/wind), so it focuses on trade-offs + explanation rather than inventing data.
- **Memory context**: `lastNotifications` is passed in so the AI can avoid re-notifying the same spot too soon unless it’s clearly better.

## Config

All tuning lives in `agent/config.ts` (earlyExit, LLM gating, reasoning thresholds, validation thresholds, etc.).

## API

`POST /api/agent/run-graph` accepts optional `lastNotifications: [{ spotId, timestamp }]` and returns the decision plus a `runLog` and `durationMs`.

## Tests

Run: `npm run test` / `npm run test:watch`.
