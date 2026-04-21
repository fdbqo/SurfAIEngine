# Recent improvements (implemented)

- **Config**: Centralised `agent/config.ts` (planner, candidates, forecastWindows, loadUserContext, selfReview, notificationGuard, prompt, notificationTiming).
- **Planner**: Deterministic shortcut (skip LLM when path clear); shared `getPlannerReadiness()`; typed with `User`; default region when user has no location.
- **Run-graph API**: Zod validation (400 on invalid body); default mode `FORECAST_PLANNER`; typed `RunGraphResponse` / `RunGraphErrorResponse`; `durationMs` and structured logging; `runLog` from state or built from trace.
- **Notification guard**: In-memory throttle using `minIntervalHours`.
- **Spots**: `getSpotsById` batch; in-memory cache for `getSpotById`.
- **Tests**: Vitest; unit tests for `getFutureDiscountFactor`, `getPlannerReadiness`, planner shortcut, `computeForecastWindows`.

---

1
wire isDefinitelyUnsuitable into getSurfConditionsBatch
scheduling: cron or queue that runs agent per user using nextCheckAt
tests for suitableSpotFilter and agent run route — DONE: Vitest added; unit tests for getFutureDiscountFactor, getPlannerReadiness, planner shortcut, computeForecastWindows (mocked). Run-graph API validated with Zod and returns structured errors.

2
forecast tool(s): expose up to 14 days, score/weight by distance in time (near/mid/long confidence)
system prompt and interpretation guide: forecast-aware (live + forecast, not current time only)
decision schema: notify-now vs best-window (start with now-only)
batch forecast service: 14-day horizon, confidence band in response

3
pre-filter rules: wind, break type, period (tighten isDefinitelyUnsuitable)
timezone and current time consistency in tools
structured nextCheckAtIso for scheduler
real user and location data for agent (getUser by id, no auth yet)

4
confidence/stability in tool output, combine with distance-in-time
spot metadata (break type, region) in conditions responses
rate limiting and tool-call cap per run
caching for live/forecast fetches per spot — DONE: in-memory spot cache (getSpotById) and getSpotsById batch; notification throttle (minIntervalHours) in-memory

5
frontend (Tamagui): feed, spot detail, notifications, settings
auth system: sign-up, sign-in, sessions, link userId to user store
user and preferences management: profile, location, notification prefs, skill (CRUD)
notification delivery: send push/email/in-app when notify true
production scheduling: cron/queue using nextCheckAt or nextCheckAtIso
