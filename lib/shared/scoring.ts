import type { SurfScore } from './types'
import type { Spot } from './spots/Spot'
import type { SpotConditions } from './types'
import type { User } from '@/types/user/User'

export type SurferAbility = 'beginner' | 'intermediate' | 'advanced'

export interface ScoringInput {
  swellHeight: number // meters
  swellPeriod: number // seconds
  swellDirection: number // degrees (0 = North)
  waveHeight: number // meters
  wavePeriod: number // seconds
  windSpeed2m: number // km/h at 2m height
  windSpeed?: number // alias for windSpeed2m
  windSpeed10m?: number // km/h at 10m height
  windDirection: number // degrees (0-360)
  spotOrientation: number // degrees (0 = North)
  ability?: SurferAbility
  localHour?: number // 0-23 for nighttime suppression
}

// Build scoring input from conditions, spot, user
export function toScoringInput(
  conditions: SpotConditions,
  spot: Spot,
  user: User
): ScoringInput {
  const wind2m = conditions.windSpeed2m ?? conditions.windSpeed ?? 0
  return {
    swellHeight: conditions.swellHeight,
    swellPeriod: conditions.swellPeriod,
    swellDirection: conditions.swellDirection,
    waveHeight: conditions.waveHeight,
    wavePeriod: conditions.wavePeriod,
    windSpeed2m: wind2m,
    windSpeed10m: conditions.windSpeed10m,
    windDirection: conditions.windDirection,
    spotOrientation: spot.orientation,
    ability: user.skill,
    localHour: conditions.localHour,
  }
}

export function scoreSpot(input: ScoringInput): SurfScore {
  let score = 0
  const reasons: string[] = []

  const {
    swellHeight,
    swellPeriod,
    swellDirection,
    waveHeight,
    windSpeed2m,
    windSpeed,
    windDirection,
    spotOrientation,
    ability = 'intermediate',
    localHour,
  } = input

  const windSpeedForScoring = windSpeed2m ?? windSpeed ?? 0
  
  // Nighttime suppression 0–4, 22–23
  const isNightTime = localHour !== undefined && (localHour < 5 || localHour > 22)

  // Swell direction vs spot orientation
  let angleDiff = Math.abs(swellDirection - spotOrientation)
  if (angleDiff > 180) {
    angleDiff = 360 - angleDiff
  }
  const exposure = Math.max(0, 1 - angleDiff / 180)

  if (exposure > 0.7) {
    score += 3
    reasons.push('Swell directly hitting the break')
  } else if (exposure > 0.4) {
    score += 2
    reasons.push('Partially exposed to swell')
  } else {
    score += 0
    reasons.push('Sheltered from swell')
  }

  // Swell power: height * period
  const power = swellHeight * swellPeriod

  if (ability === 'beginner') {
    if (power > 4 && power <= 8) {
      score += 3
      reasons.push('Gentle swell energy (perfect for learning)')
    } else if (power > 2 && power <= 10) {
      score += 2
      reasons.push('Moderate swell energy')
    } else if (power > 10) {
      score += 0
      reasons.push('Powerful swell (too strong for beginners)')
    } else {
      reasons.push('Very small / weak swell')
    }
  } else if (ability === 'advanced') {
    if (power > 15) {
      score += 3
      reasons.push('Powerful groundswell (excellent)')
    } else if (power > 8) {
      score += 2
      reasons.push('Decent swell energy')
    } else if (power > 4) {
      score += 1
      reasons.push('Weak swell energy')
    } else {
      reasons.push('Very small / weak swell')
    }
  } else {
    if (power > 12) {
      score += 3
      reasons.push('Powerful groundswell')
    } else if (power > 8) {
      score += 2
      reasons.push('Decent swell energy')
    } else if (power > 4) {
      score += 1
      reasons.push('Weak swell energy')
    } else {
      reasons.push('Very small / weak swell')
    }
  }

  // wave height scoring
  let minHeight = 0.5
  let maxHeight = 2.5
  let idealMin = 0.8
  let idealMax = 1.8

  if (ability === 'beginner') {
    minHeight = 0.3
    maxHeight = 1.2
    idealMin = 0.5
    idealMax = 1.0
  } else if (ability === 'advanced') {
    minHeight = 0.5
    maxHeight = 4.0
    idealMin = 1.5
    idealMax = 3.0
  } else {
    idealMin = 1.0
    idealMax = 2.0
  }

  if (waveHeight >= idealMin && waveHeight <= idealMax) {
    score += 3
    reasons.push(`Ideal wave size for ${ability} surfers`)
  } else if (waveHeight >= minHeight && waveHeight <= maxHeight) {
    score += 2
    reasons.push(`Wave size suitable for ${ability} ability`)
  } else if (waveHeight > maxHeight) {
    score -= 1
    reasons.push(`Large surf (challenging for ${ability})`)
  } else {
    score -= 1
    reasons.push('Small surf')
  }

  // Wind quality: offshore vs spot
  const offshoreDir = (spotOrientation + 180) % 360
  let windDiff = Math.abs(offshoreDir - windDirection)
  if (windDiff > 180) {
    windDiff = 360 - windDiff
  }
  const isOffshore = windDiff < 60

  if (isOffshore) {
    if (windSpeedForScoring < 15) {
      score += ability === 'beginner' ? 2 : 3
      reasons.push('Light offshore winds (ideal)')
    } else if (windSpeedForScoring < 25) {
      score += ability === 'beginner' ? 1 : 2
      reasons.push('Moderate offshore winds')
    } else {
      score += ability === 'beginner' ? 0 : 1
      reasons.push('Strong offshore wind')
    }
  } else {
    if (windSpeedForScoring < 10) {
      score += ability === 'beginner' ? 1 : 0
      reasons.push('Light onshore winds')
    } else {
      const penalty = ability === 'advanced' ? -3 : ability === 'intermediate' ? -2 : -1
      score += penalty
      reasons.push(`Strong onshore winds (reduces quality${ability === 'beginner' ? ' - still learnable' : ''})`)
    }
  }

  let final = Math.max(0, Math.min(score, 10))
  
  // Apply nighttime suppression
  if (isNightTime) {
    final *= 0.05 // Reduce to 5% of original score
    reasons.push('Night-time conditions (very limited visibility)')
  }

  return {
    score: final,
    reasons: reasons.length > 0 ? reasons : ['Conditions need improvement'],
  }
}

// Deprecated: use scoreSpot instead
export function scoreSpotLegacy(
  conditions: Omit<ScoringInput, 'spotOrientation' | 'swellDirection'>,
  spotLon: number = -8.5
): SurfScore {
  const spotOrientation = spotLon < 0 ? 270 : 90
  const swellDirection = 270

  return scoreSpot({
    ...conditions,
    spotOrientation,
    swellDirection,
    windSpeed2m: conditions.windSpeed2m ?? conditions.windSpeed ?? 0,
  })
}

