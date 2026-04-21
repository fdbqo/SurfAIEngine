export const SURF_INTERPRETATION_GUIDE = `
Skill levels (context-aware, not strict limits)

Beginner
- Wave height: typically 0.4–0.9 m ideal, but depends heavily on period and spot.
  - Short period (6–8s): can handle slightly bigger.
  - Long period (>12s): even small waves can feel powerful → reduce tolerance.
- Breaks: beach breaks strongly preferred. Avoid shallow reef/point unless very small and soft.
- Wind:
  - Offshore or light wind strongly preferred.
  - Onshore >10–12 km/h usually makes waves too messy.
- Priority: clean, slow, forgiving waves over size.

Intermediate
- Wave height: ~0.9–1.8 m typical range, but flexible depending on conditions.
  - Can handle larger waves if period is moderate and shape is clean.
- Breaks: beach, point, mellow reef.
- Wind:
  - Offshore preferred.
  - Can tolerate moderate onshore if swell has enough size/period to hold shape.
- Priority: balance between quality (cleanliness) and size.

Advanced
- Wave height: 1.5 m+ with no strict upper bound.
- Breaks: all types including heavy reef and slabs.
- Wind:
  - Offshore ideal, but strong surfers may still go if size/period are exceptional.
- Priority: power, shape, and uniqueness of conditions over comfort.

---

Wind interpretation (relative, not absolute)

- Offshore:
  - Cleans faces, holds waves open → strong positive.
  - Too strong offshore (>20–25 km/h) can make waves difficult or “pinched”.

- Cross-shore:_
  - Light: mostly fine.
  - Strong: creates chop and uneven faces.

- Onshore:
  - <8 km/h → often still surfable.
  - 8–15 km/h → quality degrades quickly.
  - >15 km/h → generally poor unless:
    - swell is large, OR
    - spot is sheltered from that wind direction.

---

Swell interpretation (height + period + direction)

Height alone is not enough — always combine with period and direction.

- Long period (>12s):
  - More powerful, faster waves.
  - Can turn small surf into advanced conditions.
- Short period (<8s):
  - Softer, weaker, more forgiving.

Examples:
- 0.8 m @ 14s → powerful, fast → may be unsuitable for beginners.
- 1.2 m @ 7s → softer, more manageable.

Direction matters:
- If swell direction matches the spot → waves are stronger and cleaner.
- If poorly aligned → smaller, inconsistent, or weak surf.

---

Spot exposure & geography (critical realism layer)

- Exposed spots:
  - Pick up more swell → bigger, more powerful.
  - More affected by wind.

- Sheltered spots:
  - Smaller but cleaner in bad wind.
  - Often better choice during strong onshore conditions.

Trade-off:
- Exposed = size + power
- Sheltered = cleanliness + consistency

---

Consistency vs quality trade-off

Always balance:
- Clean but small (often better for beginners/intermediates)
- Bigger but messy (sometimes only suitable for advanced)

General rule:
- Beginners → prefer clean over big
- Intermediate → balanced
- Advanced → may prefer bigger even if messy

---

Timing realism (even without tide data)

- Early morning / late evening:
  - Typically cleaner wind → higher quality.
- Midday:
  - More likely wind-affected.

- When choosing a future window:
  - Prefer realistic times (not too early, not too far away)
  - Ensure user has time to reach the spot.

---

Spot selection when multiple options are viable

- Prefer closer spot if:
  - Conditions are similar (within ~20% in size/quality)
- Prefer farther spot if:
  - Wind is significantly better (onshore → offshore)
  - Swell period is meaningfully longer
  - Spot exposure or break type better matches skill level

Always explain trade-offs clearly.

---

Core principle

Never judge surf using a single variable.
Always combine:
- wave height
- swell period
- wind (direction + strength)
- spot exposure
- user skill

Then decide if the session is realistically worth it.
`.trim()