/** agent config */

export const agentConfig = {
  planner: {
    maxSteps: Number(process.env.AGENT_MAX_STEPS) || 6,
    /** default region when user has no location */
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
    daysAhead: Number(process.env.AGENT_FORECAST_DAYS_AHEAD) || 5,
    /** fallback horizon when short range has no good windows */
    fallbackDaysAhead: Number(process.env.AGENT_FORECAST_FALLBACK_DAYS_AHEAD) || 9,
    /** skip windows that start at night */
    excludeNightWindowStarts: process.env.AGENT_EXCLUDE_NIGHT_FORECAST_WINDOWS !== "0",
    /**
     * Drop windows where **local** block-start hour is >= this (0–24). Default 20 = nothing starting 8pm+ local, no one goes surfing during night.
     * Set env to 24 to disable this filter (night exclusion still applies when excludeNightWindowStarts is true).
     */
    excludeForecastWindowStartHourGte: Math.min(
      24,
      Math.max(
        0,
        Number(process.env.AGENT_EXCLUDE_FORECAST_START_HOUR_GTE ?? 20) || 20,
      ),
    ),
    /**
     * Far future windows use a confidence factor on ranking (adjustedScore).
     * Strong surf scores get a floor so good tomorrow sessions are not buried vs weak “soon” slots.
     */
    rankingConfidence: {
      minSurfScoreForFloor: 7,
      minFactorWhenStrong: 0.92,
    },
    /** ease distance penalty for far-off windows */
    distanceSoftening: {
      startHours: Number(process.env.AGENT_FORECAST_DISTANCE_SOFTEN_START_HOURS) || 24,
      fullHours: Number(process.env.AGENT_FORECAST_DISTANCE_SOFTEN_FULL_HOURS) || 168,
      maxBlend: Number(process.env.AGENT_FORECAST_DISTANCE_SOFTEN_MAX_BLEND) || 0.35,
    },
  },
  loadUserContext: {
    defaultMaxDistanceKm: 50,
    quietStart: "22:00",
    quietEnd: "07:00",
  },
  /** stop early if no spot passes threshold */
  earlyExit: {
    minScoreThreshold: 3,
  },
  /** only call llm when a candidate passes this */
  decisionGate: {
    minScoreToCallLlm: 4,
  },
  /** shortcut and trade-off tuning */
  reasoning: {
    /** min score for obvious winner */
    strongCandidateMinSuitability: 5,
    /** min lead between top 2 spots */
    strongCandidateMinLead: 1,
    /** avoid re-notifying same spot within this window */
    recentNotificationHours: 24,
    /** reasoning budget */
    budget: {
      /** low budget cutoff */
      low: 0.25,
      /** high budget cutoff */
      high: 0.6,
    },
  },
  selfReview: {
    minUserSuitability: 5,
    /** block notify when env quality is too low */
    minEnvScoreToNotify: 6,
    minConfidence: 0.5,
    /** hard confidence floor for notify */
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
  /** forecast mode now-block rules */
  forecastNoNow: {
    /** also block now in evening */
    alsoBlockEvening: false,
  },
  /** forecast mode now is only for close realistic sessions */
  plausibleNow: {
    maxDistanceKm: 45,
    allowedTimeOfDay: ["early_morning", "morning", "midday", "afternoon"] as const,
  },
  /** confidence discount for far future windows */
  notificationTiming: {
    hoursNoDecrease: Number(process.env.AGENT_FORECAST_HOURS_NO_DECREASE) || 72,
    minFactor: Number(process.env.AGENT_FORECAST_MIN_CONFIDENCE_FACTOR) || 0.85,
    hoursAtMin: Number(process.env.AGENT_FORECAST_HOURS_AT_MIN_CONFIDENCE) || 168,
  },
} as const
