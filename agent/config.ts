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
    daysAhead: 2,
    /** fallback horizon when short range has no good windows */
    fallbackDaysAhead: Number(process.env.AGENT_FORECAST_FALLBACK_DAYS_AHEAD) || 5,
    /** skip windows that start at night */
    excludeNightWindowStarts: process.env.AGENT_EXCLUDE_NIGHT_FORECAST_WINDOWS !== "0",
    /** ease distance penalty for far-off windows */
    distanceSoftening: {
      startHours: Number(process.env.AGENT_FORECAST_DISTANCE_SOFTEN_START_HOURS) || 24,
      fullHours: Number(process.env.AGENT_FORECAST_DISTANCE_SOFTEN_FULL_HOURS) || 96,
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
    hoursNoDecrease: 48,
    minFactor: 0.75,
    hoursAtMin: 120,
  },
} as const
