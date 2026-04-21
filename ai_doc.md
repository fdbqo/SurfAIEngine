Surf Notification Agent (LangGraph) — Cursor Context Doc
Scope and assumptions
What already exists (given)

You have an unfinished LangChain agent with tools like:

getUserPreferences(userId)

getSpotsNearUser(...) / getSpotsInRegion(...)

getSurfConditionsBatch(...) (or similar)

potentially forecast tools already: getSpotForecast, getSpotHistory, etc.

You have separate ingestion workers that populate three MongoDB collections:

spotconditionshourlies (observed/live-ish hourly conditions; retention ~7 days)

spotforecast3hs (3-hour forecast blocks for days 0–6; retention ~8 days)

spotforecastdailies (daily forecast days 0–13 + past aggregates; retention ~30 days)

What this doc covers

A production-grade agent workflow orchestrated in LangGraph, reusing your existing LangChain tools/services.

The agent does scoring at read time (not at ingestion), consistent with your current setup.

The agent can operate in two modes:

Live notify mode (should I notify now?)

Forecast planning mode (when is the best window in the next X hours/days?)

What this doc does not change

Ingestion pipeline (for now)

Raw schema fields (we interpret them at read time)

Data model (as used by the agent)
spotconditionshourlies (observed per hour)

Used for:

“What’s happening right now?”

Very recent trend checks (optional)

If you want “live conditions only”, you read the latest hourly record per spot.

spotforecast3hs (3-hour blocks)

Used for:

“Best window today / tomorrow / next few days”

Higher granularity planning for days 0–6

spotforecastdailies (daily)

Used for:

14-day overview

Confidence decay / stability across runs

Past performance summaries (optional)

Key principle:
The agent should never dump raw numeric fields straight into the LLM without interpretation. It should compute derived labels + short summaries at read time.

Production LangGraph workflow
High-level flow
START
 ↓
1) loadUserContext
 ↓
2) selectSpots
 ↓
3) fetchDataForSpots
 ↓
4) interpretConditions
 ↓
5) prefilterUnsafeOrPointless
 ↓
6) scoreSpots
 ↓
7) decideCandidateSet
 ↓
8) llmDecisionAndExplanation
 ↓
9) selfReviewAndValidation (loop optional)
 ↓
10) notificationGuard
 ↓
11) outputDecision (and optionally enqueue notify)
 ↓
END

This is “leave nothing out” in the sense that it includes:

deterministic filtering

scoring

LLM judgement

self-check

spam control

Shared agent state (TypeScript shape)
export type AgentMode = "LIVE_NOTIFY" | "FORECAST_PLANNER";

export interface SurfAgentState {
  userId: string;
  mode: AgentMode;

  // From DB / user system
  user?: {
    skillLevel: "beginner" | "intermediate" | "advanced";
    homeLocation?: { lat: number; lng: number };
    maxDistanceKm?: number;
    preferredBreaks?: Array<"beach" | "reef" | "point">;
    riskTolerance?: "low" | "medium" | "high";
    notifyThreshold?: "good" | "great";     // product choice
    quietHours?: { start: string; end: string }; // optional
    favorites?: string[]; // spotIds
  };

  // Spots selected for evaluation
  spotIds?: string[];
  spots?: Array<{ spotId: string; name: string; lat: number; lng: number; breakType?: string }>;

  // Raw data from your collections (latest and/or forecast)
  hourliesBySpot?: Record<string, any>; // latest SpotConditionsHourly per spot (or last N)
  forecast3hBySpot?: Record<string, any[]>; // blocks
  forecastDailyBySpot?: Record<string, any[]>; // days

  // Derived/interpreted
  interpretedBySpot?: Record<string, {
    // “AI usable”
    nowText?: string;
    forecastText?: string;

    // derived labels
    windLabel?: "offshore" | "cross" | "onshore" | "unknown";
    windStrengthLabel?: "light" | "moderate" | "strong";
    swellQualityLabel?: "poor" | "ok" | "good" | "excellent";
    waveSizeLabel?: "flat" | "small" | "medium" | "large";

    // numeric metrics for deterministic logic
    envQualityScoreNow?: number;        // 0–10 (environment score)
    envQualityScoreBest3h?: number;     // 0–10
    bestWindow?: { start: Date; end: Date; label: "morning" | "midday" | "afternoon" | "evening" };
    hazards?: string[];
  }>;

  // Scoring results
  scored?: Array<{
    spotId: string;
    envScore: number;        // 0–10
    userSuitability: number; // 0–10
    bestWindow?: { start: Date; end: Date };
    reasons: string[];       // deterministic reasons
  }>;

  // Candidate set for LLM
  topCandidates?: Array<{
    spotId: string;
    summary: string;        // compact context block
    envScore: number;
    userSuitability: number;
  }>;

  // LLM decision output
  decision?: {
    notify: boolean;
    spotId?: string;
    when?: "now" | "next_window";
    windowStart?: Date;
    windowEnd?: Date;
    title?: string;
    message?: string;
    rationale?: string;     // why this spot / why now
    whyNotOthers?: string[]; // short bullets
    confidence?: number;    // 0–1
  };

  // Self-review
  review?: {
    verdict: "approve" | "revise" | "reject";
    issues?: string[];
    revisedDecision?: SurfAgentState["decision"];
  };

  // Notification guard result
  guard?: {
    allowed: boolean;
    blockedReason?: string;
    dedupeKey?: string;
  };
}
Node-by-node details
1) loadUserContext

Reads: user DB
Writes: state.user, state.mode (mode is input at invoke time)
Notes: This should normalize preferences into a consistent shape (defaults, bounds).

2) selectSpots

Purpose: build an evaluation list of spotIds
Inputs: state.user
Logic:

If user has favorites, include them.

Add nearby spots up to a cap (e.g. 20–50).

De-duplicate.

Optionally diversify by break type.

Writes: state.spots, state.spotIds

3) fetchDataForSpots

Purpose: pull the minimum needed data from your existing collections.

LIVE_NOTIFY mode

Fetch latest hourly per spot from spotconditionshourlies

either last 1 record

or last N records if you want trend/stability

FORECAST_PLANNER mode

Fetch forecast 3h blocks (days 0–6) from spotforecast3hs

Fetch daily forecast (days 0–13) from spotforecastdailies (optional but useful)

Writes:

hourliesBySpot

forecast3hBySpot

forecastDailyBySpot

4) interpretConditions

Purpose: convert raw rows into AI-usable text + computed metrics.

Why this exists

LLMs do better with interpreted surf language than raw values.

Deterministic scoring needs derived labels.

Output per spot (minimum)

nowText (LIVE_NOTIFY) or forecastText (FORECAST_PLANNER)

windLabel, windStrengthLabel

waveSizeLabel, swellQualityLabel

envQualityScoreNow / envQualityScoreBest3h

hazards[]

Environment quality score (0–10)

This is not user-specific. It’s “how good is the surf, generally?”

Example inputs from your rows:

waveHeight, wavePeriod (or swellPeriod)

windSpeed10m / windDirection

optional: tide state, visibility, pressure, dataQuality/confidence

A simple production-usable approach:

Define scoring components 0–10 each, then weighted average:

wave power (period)

wave size band (not user-specific; just “is it surfable vs flat/huge”)

wind effect (offshore/cross/onshore)

wind strength penalty

confidence penalty (if dataQuality low)

Store numeric score + short reason tags.

5) prefilterUnsafeOrPointless

Purpose: cheap deterministic removal before expensive steps.

Examples:

missing data / stale timestamps

waveHeight ~0 (flat)

wind speed extreme

user beginner + spot breakType reef (if you have breakType)

(optional) “must be within distance”

Writes: prunes state.spots / marks hazards

6) scoreSpots

Purpose: compute userSuitability (0–10) using:

environment score

user skill banding vs wave height

distance penalty

break type preference match

risk tolerance adjustments

Important: this is where your earlier “spot scoring” lives.
It’s a separate score from envQuality.

Output per spot:

envScore

userSuitability

deterministic reasons[]

Writes: state.scored

7) decideCandidateSet

Purpose: select top N spots for the LLM (e.g., N=3–5).

Logic:

sort by userSuitability (primary) then envScore

build a compact summary per candidate:

spot name + distance

key interpreted labels

envScore + userSuitability

bestWindow if forecast mode

Writes: state.topCandidates

8) llmDecisionAndExplanation

Purpose: LLM chooses whether to notify and crafts a user-facing message.

Inputs (keep small)

user profile summary (skill, constraints)

topCandidates (3–5)

interpreted text blocks (not raw dumps)

deterministic scores

Output (structured)

notify: boolean

spotId

when: now | next_window

title, message, rationale

confidence (0–1)

whyNotOthers (short bullets)

Key:

LLM should not invent data.

Require it to base decisions on provided summaries/scores only.

9) selfReviewAndValidation (the academic + reliability upgrade)

Purpose: second-pass verification to catch bad notifications.

Checks (deterministic + optional LLM critique)

If decision.notify = true:

is userSuitability above threshold?

does decision’s chosen spot exist in candidates?

is chosen window valid (forecast mode)?

is confidence not too low?

are there hazards that contradict notify?

Loop

If verdict = revise, you can:

re-run LLM with the reviewer’s issues and ask for corrected output once

If reject, force notify=false.

Writes: state.review, possibly state.decision revised

10) notificationGuard

Purpose: prevent spam / duplicates.

Requires persistence:

a notifications collection (or Redis) that stores:

last notification time per user

dedupe key per spot/window/condition signature

Blocking rules:

minimum interval between notifications (e.g. 3h)

do not re-notify same spot + similar score within window

respect quiet hours

require “meaningful improvement” if sending again

Writes: state.guard.allowed, reason, dedupeKey

11) outputDecision (and optional enqueue)

Purpose:

return final structured decision to caller

optionally emit an event to a notification service

In your current architecture you can keep sending separate; just return:

decision

guard

trace/debug fields (optional)

Which collection is used when?
LIVE_NOTIFY mode (notify “right now”)

Primary: spotconditionshourlies (latest per spot)

Optional: spotforecast3hs for “next best window today” fallback if now is bad

FORECAST_PLANNER mode

Primary: spotforecast3hs (days 0–6)

Secondary: spotforecastdailies for days 0–13 overview + confidence

“AI-usable text” format (recommended)

Don’t send raw JSON tables to the model. Send compact spot cards:

Example candidate summary:

Spot: Bundoran Peak (18km, beach/reef mix)
Mode: LIVE

Environment: 8.4/10
User suitability (intermediate): 7.9/10

Now: medium waves (~1.8m) with a solid period (~11s). Light offshore wind. Surface likely clean.
Hazards: none flagged

Forecast candidate summary:

Spot: Rossnowlagh (25km, beach)
Mode: FORECAST

Best window (next 24h): 09:00–12:00 local
Environment (best 3h): 7.6/10
User suitability (beginner): 7.2/10

Window summary: small-to-medium surf with manageable wind (cross-offshore). Better than afternoon due to lighter wind.
Hazards: strong wind after 15:00

Suggested repo layout (Cursor-friendly)
src/agent/
  graph.ts
  state.ts

  nodes/
    loadUserContext.ts
    selectSpots.ts
    fetchDataForSpots.ts
    interpretConditions.ts
    prefilterUnsafeOrPointless.ts
    scoreSpots.ts
    decideCandidateSet.ts
    llmDecisionAndExplanation.ts
    selfReviewAndValidation.ts
    notificationGuard.ts
    outputDecision.ts

src/services/
  userPreferencesService.ts
  spotsService.ts
  surfDataService.ts        // reads the 3 collections
  notificationService.ts    // optional, can be separate

src/types/
  SurfNotifyDecision.ts
  SurfModels.ts

  Practically: you still need these to actually be prod-ready

Strong data freshness & fallbacks

define “stale” thresholds for hourlies and forecasts

fallback behavior if data missing

Notification persistence

guard rules require a durable store of prior notifications

Observability

structured traces per node (LangGraph makes this easier)

audit logs: chosen spot, scores, reasons

Safety constraints

hard caps for beginner safety, extreme wind, etc.

Evaluation

offline tests using stored historical data:

“would we have notified?”

measure false positives / spam rate

Cost control

limit LLM calls (topN only; skip if all scores below threshold)

If those pieces aren’t implemented, it’s not “prod-ready” in the operational sense—just “prod-designed”.

