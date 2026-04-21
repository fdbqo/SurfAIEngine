import type { SurfAgentStateType } from "../state"
import { agentConfig } from "../config"
import { getPlannerReadiness } from "../utils/plannerReadiness"
import { appendRunLog } from "../utils/runLog"
import { ChatOpenAI } from "@langchain/openai"
import { z } from "zod"
import { HumanMessage, SystemMessage } from "@langchain/core/messages"
import { SURF_INTERPRETATION_GUIDE } from "@/lib/agent/surfInterpretationGuide"
import type { User } from "@/types/user/User"

const PlannerSchema = z.object({
  action: z.enum(["call_tool", "done"]),
  tool: z
    .enum([
      "get_user_preferences",
      "get_spots_near_user",
      "get_spots_in_region",
      "get_surf_conditions_batch",
    ])
    .nullable(),
  // All fields required + nullable to satisfy OpenAI structured-output constraints
  args: z
    .object({
      region: z.string().nullable(),
      spotIds: z.array(z.string()).nullable(),
    })
    .nullable(),
})

export async function plannerNode(
  state: SurfAgentStateType
): Promise<Partial<SurfAgentStateType>> {
  const stepCount = (state.stepCount ?? 0) + 1
  if (stepCount > agentConfig.planner.maxSteps) {
    return {
      stepCount,
      pendingToolCall: null,
      decision: {
        notify: false,
        message: "Max steps reached; no notification sent.",
        rationale: "Planner loop limit reached.",
      },
      runLog: appendRunLog(state, "planner", { maxStepsReached: true }),
    }
  }

  const { haveUser, haveSpots, haveConditions } = getPlannerReadiness(state)

  if (haveUser && haveSpots && haveConditions) {
    return {
      stepCount,
      pendingToolCall: null,
      runLog: appendRunLog(state, "planner", { done: true }),
    }
  }

  if (!haveUser) {
    return {
      stepCount,
      pendingToolCall: { tool: "get_user_preferences", args: {} },
      runLog: appendRunLog(state, "planner", { nextTool: "get_user_preferences" }),
    }
  }
  if (!haveSpots) {
    const raw: User | undefined = state.user?.rawUser
    const useNear = !!raw?.lastLocation
    const region =
      (raw?.homeRegion ?? raw?.usualRegions?.[0] ?? "").trim() ||
      agentConfig.planner.defaultRegion
    return {
      stepCount,
      pendingToolCall: {
        tool: useNear ? "get_spots_near_user" : "get_spots_in_region",
        args: useNear ? {} : { region },
      },
      runLog: appendRunLog(state, "planner", {
        nextTool: useNear ? "get_spots_near_user" : "get_spots_in_region",
        region: useNear ? undefined : region,
      }),
    }
  }
  if (!haveConditions) {
    return {
      stepCount,
      pendingToolCall: {
        tool: "get_surf_conditions_batch",
        args: { spotIds: state.spotIds ?? [] },
      },
      runLog: appendRunLog(state, "planner", { nextTool: "get_surf_conditions_batch" }),
    }
  }

  const llm = new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0.2 })
  const structured = llm.withStructuredOutput(PlannerSchema)

  const system = new SystemMessage(
    `You are an agentic surf notification planner.

${SURF_INTERPRETATION_GUIDE}

Goal: gather the minimum data needed to decide whether to notify.

Tools you can request:
- get_user_preferences()            // no args
- get_spots_near_user()            // use when user has lastLocation
- get_spots_in_region({ region })  // use when no location
- get_surf_conditions_batch({ spotIds }) // after you have spotIds

Rules:
- If user is missing: call get_user_preferences first.
- If spots are missing: call get_spots_near_user if lastLocation exists, else get_spots_in_region using homeRegion/usualRegions.
- If conditions are missing: call get_surf_conditions_batch with all spotIds.
- When user+spots+conditions are present, return action=done.

Return structured output only. Use null for unused fields.`
  )

  const summary = new HumanMessage(
    `stepCount=${stepCount}
haveUser=${haveUser}
haveSpots=${haveSpots}
haveConditions=${!!haveConditions}

user=${JSON.stringify(state.user ?? null)}
spotIds=${JSON.stringify(state.spotIds ?? [])}`
  )

  const out = await structured.invoke([system, summary])

  if (out.action === "done") {
    return {
      stepCount,
      pendingToolCall: null,
      runLog: appendRunLog(state, "planner", { llmDone: true }),
    }
  }

  if (!out.tool) {
    return {
      stepCount,
      pendingToolCall: null,
      decision: {
        notify: false,
        message: "Planner produced no tool; aborting.",
        rationale: "Invalid planner output.",
      },
      runLog: appendRunLog(state, "planner", { error: "no tool" }),
    }
  }

  return {
    stepCount,
    pendingToolCall: {
      tool: out.tool,
      args: (out.args ?? {}) as Record<string, unknown>,
    },
    runLog: appendRunLog(state, "planner", { tool: out.tool }),
  }
}

