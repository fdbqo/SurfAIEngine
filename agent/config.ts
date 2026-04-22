/**
 * Centralised agent config. Tune here or override via env (e.g. AGENT_MAX_STEPS).
 */

export const agentConfig = {
  planner: {
    maxSteps: Number(process.env.AGENT_MAX_STEPS) || 6,
    /** Default region when user has no lastLocation and no homeRegion/usualRegions (e.g. "Connacht"). */
    defaultRegion: "Connacht",
  },
  candidates: {
    topN: 5,
  },
  forecastWindows: {
    maxWindowsPerSpot: 5,
    topSpots: 5,
    wildcardMinScore: 7,
    maxTotalWindows: 30,
    daysAhead: 2,
    /**
     * Drop 3h blocks whose *start* (local) is "night" (21:00–05:00). Surf metrics can still
     * look good after dark, but it is a bad default for push UX. Set AGENT_EXCLUDE_NIGHT_FORECAST_WINDOWS=0 to keep them.
     */
    excludeNightWindowStarts: process.env.AGENT_EXCLUDE_NIGHT_FORECAST_WINDOWS !== "0",
  },
  loadUserContext: {
    defaultMaxDistanceKm: 50,
    quietStart: "22:00",
    quietEnd: "07:00",
  },
  /** After scoring: if no spot meets this, exit early (no LLM). */
  earlyExit: {
    minScoreThreshold: 3,
  },
  /** Only call decision LLM when at least one candidate/window meets this. */
  decisionGate: {
    minScoreToCallLlm: 3,
  },
  /** Token-efficient decision shortcuts and trade-off detection. */
  reasoning: {
    /** If best candidate is at least this, it can be an "obvious winner". */
    strongCandidateMinSuitability: 5,
    /** If top1 - top2 >= this, treat as a clear lead. */
    strongCandidateMinLead: 1,
    /** If a spot was notified within this many hours, avoid re-notifying it. */
    recentNotificationHours: 24,
    /** Preference-based reasoning budget (0..1). */
    budget: {
      /** Below this, allow deterministic shortcut when choice is obvious. */
      low: 0.25,
      /** Above this, skip tiny gate and go straight to full LLM. */
      high: 0.6,
    },
  },
  selfReview: {
    minUserSuitability: 4,
    minConfidence: 0.5,
    /** Below this → reject (do not notify). Use confidence from LLM when present. */
    minConfidenceToNotify: 0.4,
  },
  prepareRetry: {
    maxLlmRetries: 1,
  },
  notificationGuard: {
    minIntervalHours: 3,
  },
  selectSpots: {
    maxSpots: 30,
    maxNearby: 25,
  },
  prompt: {
    summaryMaxChars: 280,
  },
  /** FORECAST_PLANNER: do not use when=now during local night (and optionally evening). */
  forecastNoNow: {
    /** Also treat 18:00–21:00 local as "no go now" in forecast mode. */
    alsoBlockEvening: false,
  },
  /**
   * FORECAST_PLANNER: only recommend when="now" if close enough and local time is still
   * a realistic time to get in the water (prefers morning/midday/afternoon over evening).
   */
  plausibleNow: {
    maxDistanceKm: 45,
    allowedTimeOfDay: ["early_morning", "morning", "midday", "afternoon"] as const,
  },
  /** Future discount: no decrease for today/tomorrow (<=48h); then declining. */
  notificationTiming: {
    hoursNoDecrease: 48,
    minFactor: 0.75,
    hoursAtMin: 120,
  },
} as const
