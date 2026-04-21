import mongoose, { Schema } from "mongoose"
import webpush from "web-push"
import connectDB from "@/lib/db/connect"
import { runSurfAgent } from "@/agent"
import { agentConfig } from "@/agent/config"
import { mockUsers } from "@/lib/db/mockUserClient"
import { listDeviceProfilesForCron } from "@/lib/db/services/deviceProfileService"

export const NOTIFS_RUNTIME = "nodejs" as const

type EffectiveOutcome = "sent" | "deduped" | "blocked" | "no_notify" | "send_failed"
type EffectiveReason =
  | "SENT"
  | "DEDUPED"
  | "AGENT_NO_NOTIFY"
  | "THROTTLE_MIN_INTERVAL"
  | "GUARD_BLOCKED"
  | "NO_ACTIVE_SUBSCRIPTIONS"
  | "SEND_FAILED"

type DeviceChannel = "webpush" | "expo"

type StoredDeviceTarget =
  | {
      userId: string
      channel: "webpush"
      deviceId?: string | null
      platform?: "web" | null
      enabled: boolean
      createdAt: Date
      updatedAt: Date
      // web push subscription fields
      endpoint: string
      expirationTime?: number | null
      keys: { p256dh: string; auth: string }
      disabledAt?: Date | null
    }
  | {
      userId: string
      channel: "expo"
      deviceId?: string | null
      platform?: "android" | "ios" | null
      enabled: boolean
      createdAt: Date
      updatedAt: Date
      // expo push fields
      expoToken: string
      disabledAt?: Date | null
    }

type StoredSubscription = {
  userId: string
  endpoint: string
  expirationTime?: number | null
  keys: { p256dh: string; auth: string }
  createdAt: Date
  updatedAt: Date
  disabledAt?: Date | null
}

type NotificationEvent = {
  userId: string
  sentAt: Date
  mode: "LIVE_NOTIFY" | "FORECAST_PLANNER"
  notify: boolean
  spotId?: string
  dedupeKey: string
  title: string
  body: string
  url: string
  sentCount?: number
  guardAllowed?: boolean
  guardBlockedReason?: string
  decision?: unknown
  guard?: unknown
  createdAt: Date
}

type NotificationSchedule = {
  userId: string
  nextRunAt: Date
  lastRunAt?: Date | null
  failureCount?: number
  updatedAt: Date
  createdAt: Date
}

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing ${name} env var`)
  return v
}

function getWebPush() {
  const publicKey = requireEnv("VAPID_PUBLIC_KEY")
  const privateKey = requireEnv("VAPID_PRIVATE_KEY")
  const subject = process.env.VAPID_SUBJECT || "mailto:test@example.com"
  webpush.setVapidDetails(subject, publicKey, privateKey)
  return webpush
}

function truncate(s: string, max: number) {
  return s.length <= max ? s : s.slice(0, max - 1) + "…"
}

function sanitizeNotificationBody(input: string): string {
  const raw = input.replace(/\r\n/g, "\n").trim()
  if (!raw) return ""

  // Keep push payloads user-facing. Strip lines that look like internal scoring/diagnostics.
  const forbidden =
    /(location\s*score|user\s*suitability|env\s*score|distance\s*score|\bscore\b|\brating\b|\bconfidence\b|\b\d{1,2}\s*\/\s*10\b|\b\d{1,3}\s*%\b)/i

  const safeLines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !forbidden.test(l))

  // Prefer a single short line for notification UX.
  const candidate = (safeLines[0] ?? "").trim()
  return candidate
}

function getModels() {
  const DeviceTargetModel =
    (mongoose.models.DeviceTarget as mongoose.Model<StoredDeviceTarget>) ||
    mongoose.model<StoredDeviceTarget>(
      "DeviceTarget",
      new Schema<StoredDeviceTarget>(
        {
          userId: { type: String, required: true, index: true },
          channel: { type: String, required: true, index: true },
          deviceId: { type: String, required: false, default: null },
          platform: { type: String, required: false, default: null },
          enabled: { type: Boolean, required: true, default: true, index: true },
          disabledAt: { type: Date, required: false, default: null },

          // webpush
          endpoint: { type: String, required: false, unique: true, sparse: true },
          expirationTime: { type: Number, required: false },
          keys: {
            p256dh: { type: String, required: false },
            auth: { type: String, required: false },
          },

          // expo
          expoToken: { type: String, required: false, unique: true, sparse: true },
        },
        { timestamps: true },
      ),
    )

  const PushSubscriptionModel =
    (mongoose.models.PushSubscription as mongoose.Model<StoredSubscription>) ||
    mongoose.model<StoredSubscription>(
      "PushSubscription",
      new Schema<StoredSubscription>(
        {
          userId: { type: String, required: true, index: true },
          endpoint: { type: String, required: true, unique: true },
          expirationTime: { type: Number, required: false },
          keys: {
            p256dh: { type: String, required: true },
            auth: { type: String, required: true },
          },
          disabledAt: { type: Date, required: false, default: null },
        },
        { timestamps: true },
      ),
    )

  const NotificationEventModel =
    (mongoose.models.NotificationEvent as mongoose.Model<NotificationEvent>) ||
    mongoose.model<NotificationEvent>(
      "NotificationEvent",
      new Schema<NotificationEvent>(
        {
          userId: { type: String, required: true, index: true },
          sentAt: { type: Date, required: true, index: true },
          mode: { type: String, required: true },
          notify: { type: Boolean, required: true },
          spotId: { type: String, required: false },
          dedupeKey: { type: String, required: true, index: true },
          title: { type: String, required: true },
          body: { type: String, required: true },
          url: { type: String, required: true },
          sentCount: { type: Number, required: false },
          guardAllowed: { type: Boolean, required: false },
          guardBlockedReason: { type: String, required: false },
          decision: { type: Schema.Types.Mixed, required: false },
          guard: { type: Schema.Types.Mixed, required: false },
        },
        { timestamps: { createdAt: true, updatedAt: false } },
      ),
    )

  const NotificationScheduleModel =
    (mongoose.models.NotificationSchedule as mongoose.Model<NotificationSchedule>) ||
    mongoose.model<NotificationSchedule>(
      "NotificationSchedule",
      new Schema<NotificationSchedule>(
        {
          userId: { type: String, required: true, unique: true },
          nextRunAt: { type: Date, required: true, index: true },
          lastRunAt: { type: Date, required: false, default: null },
          failureCount: { type: Number, required: false, default: 0 },
        },
        { timestamps: true },
      ),
    )

  return { DeviceTargetModel, PushSubscriptionModel, NotificationEventModel, NotificationScheduleModel }
}

export type SubscribePayload = {
  userId: string
  subscription: PushSubscriptionJSON
}

export type RegisterDevicePayload =
  | { userId: string; channel: "webpush"; deviceId?: string; platform?: "web"; subscription: PushSubscriptionJSON }
  | { userId: string; channel: "expo"; deviceId?: string; platform?: "android" | "ios"; expoToken: string }

export async function registerDeviceTarget(payload: RegisterDevicePayload) {
  await connectDB()
  const { DeviceTargetModel } = getModels()

  if (payload.channel === "webpush") {
    const endpoint = payload.subscription.endpoint
    const keys = payload.subscription.keys as { p256dh?: string; auth?: string } | undefined
    if (typeof endpoint !== "string" || !endpoint) throw new Error("Invalid subscription: missing endpoint")
    if (!keys?.p256dh || !keys?.auth) throw new Error("Invalid subscription: missing keys")

    await DeviceTargetModel.updateOne(
      { channel: "webpush", endpoint },
      {
        $set: {
          userId: payload.userId,
          channel: "webpush",
          deviceId: payload.deviceId ?? null,
          platform: payload.platform ?? "web",
          enabled: true,
          disabledAt: null,
          endpoint,
          expirationTime: payload.subscription.expirationTime ?? null,
          keys: { p256dh: keys.p256dh, auth: keys.auth },
        },
      },
      { upsert: true },
    )
    return
  }

  const token = payload.expoToken
  if (typeof token !== "string" || !token.startsWith("ExponentPushToken[")) {
    throw new Error("Invalid expoToken")
  }

  await DeviceTargetModel.updateOne(
    { channel: "expo", expoToken: token },
    {
      $set: {
        userId: payload.userId,
        channel: "expo",
        deviceId: payload.deviceId ?? null,
        platform: payload.platform ?? null,
        enabled: true,
        disabledAt: null,
        expoToken: token,
      },
    },
    { upsert: true },
  )
}

export async function disableDeviceTarget(input: { channel: DeviceChannel; endpoint?: string; expoToken?: string }) {
  await connectDB()
  const { DeviceTargetModel } = getModels()
  if (input.channel === "webpush" && input.endpoint) {
    await DeviceTargetModel.updateOne({ channel: "webpush", endpoint: input.endpoint }, { $set: { enabled: false, disabledAt: new Date() } })
  }
  if (input.channel === "expo" && input.expoToken) {
    await DeviceTargetModel.updateOne({ channel: "expo", expoToken: input.expoToken }, { $set: { enabled: false, disabledAt: new Date() } })
  }
}

export async function upsertPushSubscription(payload: SubscribePayload) {
  await connectDB()
  const { PushSubscriptionModel } = getModels()

  const endpoint = payload.subscription.endpoint
  const keys = payload.subscription.keys as { p256dh?: string; auth?: string } | undefined
  if (typeof endpoint !== "string" || !endpoint) throw new Error("Invalid subscription: missing endpoint")
  if (!keys?.p256dh || !keys?.auth) throw new Error("Invalid subscription: missing keys")

  await PushSubscriptionModel.updateOne(
    { endpoint },
    {
      $set: {
        userId: payload.userId,
        endpoint,
        expirationTime: payload.subscription.expirationTime ?? null,
        keys: { p256dh: keys.p256dh, auth: keys.auth },
        disabledAt: null,
      },
    },
    { upsert: true },
  )
}

export async function disablePushSubscription(payload: SubscribePayload) {
  await connectDB()
  const { PushSubscriptionModel } = getModels()
  const endpoint = payload.subscription.endpoint
  if (typeof endpoint !== "string" || !endpoint) return
  await PushSubscriptionModel.updateOne({ endpoint }, { $set: { disabledAt: new Date() } })
}

export async function listActiveSubscriptionsForUser(userId: string) {
  await connectDB()
  const { PushSubscriptionModel } = getModels()
  return await PushSubscriptionModel.find({ userId, disabledAt: null }).lean()
}

export async function listActiveDeviceTargetsForUser(userId: string) {
  await connectDB()
  const { DeviceTargetModel } = getModels()
  return await DeviceTargetModel.find({ userId, enabled: true, disabledAt: null }).lean()
}

export async function listRecentNotifications(userId: string, hours: number) {
  await connectDB()
  const { NotificationEventModel } = getModels()
  const since = new Date(Date.now() - hours * 60 * 60 * 1000)
  const rows = await NotificationEventModel.find({ userId, sentAt: { $gte: since } })
    .sort({ sentAt: -1 })
    .limit(50)
    .lean()
  return rows
}

export async function getOrInitSchedule(userId: string) {
  await connectDB()
  const { NotificationScheduleModel } = getModels()
  const existing = await NotificationScheduleModel.findOne({ userId }).lean()
  if (existing) return existing
  // Eligible on the next cron tick (epoch). Previous +5m default caused “cron never runs”
  // for new device registrations until 5 minutes passed.
  const nextRunAt = new Date(0)
  await NotificationScheduleModel.create({ userId, nextRunAt })
  return await NotificationScheduleModel.findOne({ userId }).lean()
}

export async function setNextRunAt(userId: string, nextRunAt: Date, lastRunAt?: Date) {
  await connectDB()
  const { NotificationScheduleModel } = getModels()
  await NotificationScheduleModel.updateOne(
    { userId },
    { $set: { nextRunAt, ...(lastRunAt ? { lastRunAt } : {}) } },
    { upsert: true },
  )
}

function computeNextRunAtFromOutcome(outcome: { notify: boolean; failure?: boolean }): Date {
  if (outcome.failure) return new Date(Date.now() + 30 * 60 * 1000)
  if (outcome.notify) return new Date(Date.now() + 3 * 60 * 60 * 1000)
  return new Date(Date.now() + 2 * 60 * 60 * 1000)
}

function buildDedupeKey(args: { userId: string; mode: string; spotId?: string; bucketMinutes?: number }) {
  const bucket = Math.floor(Date.now() / ((args.bucketMinutes ?? 30) * 60 * 1000))
  return [args.userId, args.mode, args.spotId ?? "none", String(bucket)].join("|")
}

export async function sendWebPushToUser(userId: string, payload: { title: string; body: string; url: string }) {
  // Prefer new device-target storage; fall back to legacy PushSubscription model.
  const targets = await listActiveDeviceTargetsForUser(userId)
  const webTargets = targets.filter((t) => (t as any).channel === "webpush") as Array<Extract<StoredDeviceTarget, { channel: "webpush" }>>
  const subs = webTargets.length > 0 ? webTargets : await listActiveSubscriptionsForUser(userId)
  if (subs.length === 0) {
    return { sent: 0, removed: 0, failures: [] as Array<{ endpoint?: string; statusCode?: number; message: string }> }
  }

  const wp = getWebPush()
  let sent = 0
  let removed = 0
  const failures: Array<{ endpoint?: string; statusCode?: number; message: string }> = []

  await Promise.all(
    subs.map(async (s: any) => {
      try {
        const sub: webpush.PushSubscription = {
          endpoint: s.endpoint,
          expirationTime: s.expirationTime ?? null,
          keys: s.keys,
        }
        await wp.sendNotification(sub, JSON.stringify(payload))
        sent += 1
      } catch (e) {
        const anyErr = e as { statusCode?: number; message?: string }
        const statusCode = typeof anyErr?.statusCode === "number" ? anyErr.statusCode : undefined
        const message = typeof anyErr?.message === "string" ? anyErr.message : "Send failed"
        failures.push({ endpoint: s.endpoint, statusCode, message })
        if (statusCode === 404 || statusCode === 410) {
          // mark disabled so we don't keep trying
          await disableDeviceTarget({ channel: "webpush", endpoint: s.endpoint })
          removed += 1
        }
      }
    }),
  )

  return { sent, removed, failures }
}

export async function sendExpoPushToUser(
  userId: string,
  payload: { title: string; body: string; url: string },
): Promise<{ sent: number; removed: number; failures: Array<{ token?: string; message: string }> }> {
  const targets = await listActiveDeviceTargetsForUser(userId)
  const expoTargets = targets.filter((t) => (t as any).channel === "expo") as Array<Extract<StoredDeviceTarget, { channel: "expo" }>>
  if (expoTargets.length === 0) return { sent: 0, removed: 0, failures: [] }

  const messages = expoTargets.map((t) => ({
    to: t.expoToken,
    title: payload.title,
    body: payload.body,
    data: { url: payload.url },
  }))

  const res = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(messages),
  })

  const json: any = await res.json().catch(() => null)
  if (!res.ok || !json) {
    return { sent: 0, removed: 0, failures: [{ message: `Expo push request failed (${res.status})` }] }
  }

  let sent = 0
  let removed = 0
  const failures: Array<{ token?: string; message: string }> = []
  const data: any[] = Array.isArray(json.data) ? json.data : []
  for (let i = 0; i < data.length; i++) {
    const ticket = data[i]
    const token = expoTargets[i]?.expoToken
    if (ticket?.status === "ok") {
      sent += 1
      continue
    }
    const msg = ticket?.message ? String(ticket.message) : "Expo push failed"
    failures.push({ token, message: msg })
    const err = ticket?.details?.error
    if (err === "DeviceNotRegistered" && token) {
      await disableDeviceTarget({ channel: "expo", expoToken: token })
      removed += 1
    }
  }
  return { sent, removed, failures }
}

export async function sendNotificationToUser(userId: string, payload: { title: string; body: string; url: string }) {
  const [web, expo] = await Promise.all([sendWebPushToUser(userId, payload), sendExpoPushToUser(userId, payload)])
  return {
    sent: web.sent + expo.sent,
    removed: web.removed + expo.removed,
    failures: {
      webpush: web.failures,
      expo: expo.failures,
    },
    perChannel: {
      webpush: web,
      expo,
    },
  }
}

export async function runAgentAndMaybeNotify(input: { userId: string; mode: "LIVE_NOTIFY" | "FORECAST_PLANNER" }) {
  await connectDB()
  const { NotificationEventModel } = getModels()

  // Pre-check throttle to avoid wasting tokens when we know we can't notify.
  const minIntervalHours = agentConfig.notificationGuard.minIntervalHours
  const latestSent = await NotificationEventModel.findOne({ userId: input.userId, sentCount: { $gt: 0 } })
    .sort({ sentAt: -1 })
    .lean()
  if (latestSent?.sentAt) {
    const hoursSince = (Date.now() - new Date(latestSent.sentAt).getTime()) / 36e5
    if (hoursSince >= 0 && hoursSince < minIntervalHours) {
      const next = new Date(new Date(latestSent.sentAt).getTime() + minIntervalHours * 60 * 60 * 1000)
      await setNextRunAt(input.userId, next, new Date())
      return {
        ok: true,
        effectiveOutcome: "blocked" as EffectiveOutcome,
        effectiveReason: "THROTTLE_MIN_INTERVAL" as EffectiveReason,
        detail: `Blocked by throttle: last notify ${hoursSince.toFixed(1)}h ago (min ${minIntervalHours}h).`,
        agentNotify: null,
        guardAllowed: false,
        blockedReason: `Throttle: last notify ${hoursSince.toFixed(1)}h ago (min ${minIntervalHours}h)`,
        actionTaken: "skipped_before_send",
        sent: 0,
        removed: 0,
        failures: [],
        agent: { decision: null, guard: { allowed: false, blockedReason: "Throttle (pre-check)" } },
        nextRunAt: next,
      }
    }
  }

  const lastEvents = await listRecentNotifications(input.userId, 24)
  const lastNotifications = lastEvents
    .filter((e) => e.notify && e.spotId)
    .map((e) => ({ spotId: e.spotId as string, timestamp: new Date(e.sentAt).toISOString() }))

  const startedAt = new Date()
  const result = await runSurfAgent({ userId: input.userId, mode: input.mode, lastNotifications })
  const decision = result.decision
  const guard = result.guard

  const notify = !!decision?.notify
  const allowed = guard?.allowed !== false

  // Make the outcome unambiguous and professional:
  // - Guard block always takes precedence in messaging.
  // - When notify=false, don't present "notification-looking" title/message fields.
  if (!allowed) {
    const next = computeNextRunAtFromOutcome({ notify: false })
    await setNextRunAt(input.userId, next, startedAt)
    return {
      ok: true,
      effectiveOutcome: "blocked" as EffectiveOutcome,
      effectiveReason: "GUARD_BLOCKED" as EffectiveReason,
      sent: 0,
      detail: `Blocked by notification guard: ${guard?.blockedReason ?? "guard blocked"}`,
      agentNotify: notify,
      guardAllowed: false,
      blockedReason: guard?.blockedReason ?? "guard blocked",
      actionTaken: "skipped_before_send",
      agent: { decision, guard },
      nextRunAt: next,
    }
  }

  if (!notify) {
    const next = computeNextRunAtFromOutcome({ notify: false })
    await setNextRunAt(input.userId, next, startedAt)
    const sanitizedDecision =
      decision
        ? {
            ...decision,
            title: undefined,
            message: undefined,
            whyNotOthers: undefined,
            spotId: undefined,
            windowStart: undefined,
            windowEnd: undefined,
          }
        : decision
    return {
      ok: true,
      effectiveOutcome: "no_notify" as EffectiveOutcome,
      effectiveReason: "AGENT_NO_NOTIFY" as EffectiveReason,
      sent: 0,
      detail: "Agent decided not to notify.",
      agentNotify: false,
      guardAllowed: true,
      blockedReason: null,
      actionTaken: "skipped_before_send",
      agent: { decision: sanitizedDecision, guard },
      nextRunAt: next,
    }
  }

  const title = decision?.title?.trim() ? decision.title : "Surf AI Engine — notify"
  // Push payloads should stay user-facing: do not include internal scoring/rationale in case the agent outputs it.
  const rawBody = decision?.message ? String(decision.message) : ""
  const sanitized = sanitizeNotificationBody(rawBody)
  const body = truncate(sanitized || "Surf looks worth a session.", 200)
  const url = "/"

  const dedupeKey = buildDedupeKey({ userId: input.userId, mode: input.mode, spotId: decision?.spotId })
  // Only dedupe against events that actually delivered at least one push.
  const already = await NotificationEventModel.findOne({
    userId: input.userId,
    dedupeKey,
    $or: [{ sentCount: { $gt: 0 } }, { sentCount: { $exists: false } }],
  }).lean()
  if (already) {
    const next = computeNextRunAtFromOutcome({ notify: false })
    await setNextRunAt(input.userId, next, startedAt)
    return {
      ok: true,
      effectiveOutcome: "deduped" as EffectiveOutcome,
      effectiveReason: "DEDUPED" as EffectiveReason,
      sent: 0,
      detail: "Deduped (already sent recently).",
      agentNotify: true,
      guardAllowed: true,
      blockedReason: null,
      actionTaken: "skipped_before_send",
      agent: { decision, guard },
      nextRunAt: next,
    }
  }

  const sendResult = await sendNotificationToUser(input.userId, { title, body, url })

  // Only record an event for dedupe/audit if we actually delivered at least one notification.
  if (sendResult.sent > 0) {
    await NotificationEventModel.create({
      userId: input.userId,
      sentAt: new Date(),
      mode: input.mode,
      notify: true,
      spotId: decision?.spotId,
      dedupeKey,
      title,
      body,
      url,
      sentCount: sendResult.sent,
      guardAllowed: allowed,
      guardBlockedReason: guard?.blockedReason,
      decision,
      guard,
    } satisfies Partial<NotificationEvent>)
  } else {
    const next = computeNextRunAtFromOutcome({ notify: false, failure: true })
    await setNextRunAt(input.userId, next, startedAt)
    return {
      ok: true,
      effectiveOutcome: "send_failed" as EffectiveOutcome,
      effectiveReason: "NO_ACTIVE_SUBSCRIPTIONS" as EffectiveReason,
      ...sendResult,
      detail: "Agent wanted to notify, but no active devices delivered a notification for this userId.",
      agentNotify: true,
      guardAllowed: true,
      blockedReason: null,
      actionTaken: "attempted_send",
      agent: { decision, guard },
      nextRunAt: next,
    }
  }

  const next = computeNextRunAtFromOutcome({ notify: true })
  await setNextRunAt(input.userId, next, startedAt)

  return {
    ok: true,
    effectiveOutcome: "sent" as EffectiveOutcome,
    effectiveReason: "SENT" as EffectiveReason,
    ...sendResult,
    detail: "Push notification sent.",
    agentNotify: true,
    guardAllowed: true,
    blockedReason: null,
    actionTaken: "push_sent",
    agent: { decision, guard },
    nextRunAt: next,
  }
}

/**
 * Production cron: eligible `deviceprofiles` (notifications on, onboarded) with at least one
 * active `devicetargets` row, deduped by `userId`, respecting `NotificationSchedule`.
 * Optional: `CRON_INCLUDE_MOCK_USERS=1` also runs the legacy in-memory mock users (dev/tests).
 */
export async function cronTickNotify(mode: "LIVE_NOTIFY" | "FORECAST_PLANNER" = "FORECAST_PLANNER") {
  await connectDB()
  const { NotificationScheduleModel } = getModels()
  const now = new Date()

  const profiles = await listDeviceProfilesForCron()
  const seenUserIds = new Set<string>()
  const processedUserIds: string[] = []

  for (const p of profiles) {
    const userId = p.userId
    if (seenUserIds.has(userId)) continue
    const targets = await listActiveDeviceTargetsForUser(userId)
    if (targets.length === 0) continue
    seenUserIds.add(userId)
    const sched = await getOrInitSchedule(userId)
    if (!sched) continue
    if (sched.nextRunAt && new Date(sched.nextRunAt).getTime() > now.getTime()) continue
    await NotificationScheduleModel.updateOne({ userId }, { $set: { lastRunAt: now } }, { upsert: true })
    await runAgentAndMaybeNotify({ userId, mode })
    processedUserIds.push(userId)
  }

  let mockProcessed = 0
  if (process.env.CRON_INCLUDE_MOCK_USERS === "true" || process.env.CRON_INCLUDE_MOCK_USERS === "1") {
    for (const u of mockUsers) {
      if (seenUserIds.has(u.id)) continue
      const sched = await getOrInitSchedule(u.id)
      if (!sched) continue
      if (sched.nextRunAt && new Date(sched.nextRunAt).getTime() > now.getTime()) continue
      await NotificationScheduleModel.updateOne({ userId: u.id }, { $set: { lastRunAt: now } }, { upsert: true })
      await runAgentAndMaybeNotify({ userId: u.id, mode })
      mockProcessed += 1
    }
  }

  return { ok: true, processed: processedUserIds.length, mockProcessed, userIds: processedUserIds }
}

/** @deprecated Use `cronTickNotify`; name kept for existing imports. */
export async function cronTickMockUsers(mode: "LIVE_NOTIFY" | "FORECAST_PLANNER" = "FORECAST_PLANNER") {
  return cronTickNotify(mode)
}

