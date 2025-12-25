Alright. Here’s a **clean, comprehensive, hand-off-ready Markdown file** you can drop straight into the repo and point your agent at.
No fluff, no guesswork, no “AI vibes”. This is a concrete execution plan.

---

````md
# GT7 Telemetry – Data-Driven Discovery Phase

## Objective

Gran Turismo 7 does **not** expose tyre temperatures, tyre compounds, track names, or car names as explicit, documented fields in its UDP telemetry stream.

This phase exists to **discover those fields empirically** using a controlled, data-driven approach based on:
- decrypted UDP packet logging
- controlled driving/pitting events
- offline statistical analysis

The output of this phase is **validated offsets and decoding rules**, not guesses.

---

## Scope of This Phase

### In scope
- Tyre temperature offsets (likely 4 channels: FL / FR / RL / RR)
- Tyre compound encoding (Soft / Medium / Hard / Inter / Wet)
- Validation of what **is not** present in UDP (track name, car name)

### Explicitly out of scope
- UI work
- Real-time tyre overlays
- Track detection (handled via coordinate fingerprinting elsewhere)
- Car name decoding from UDP (requires lookup table)

---

## Constraints & Assumptions

- UDP packets are already:
  - received
  - decrypted correctly (Salsa20)
  - validated via magic number
- Packet variants:
  - A (~296 bytes)
  - B (~316 bytes)
  - ~ (~344 bytes)
- Heartbeat currently requests packet `A`
- Analysis is performed **offline**, not in real-time

---

## High-Level Strategy

Telemetry fields are discovered by:
1. Logging decrypted packets with timestamps
2. Running **controlled gameplay events** that isolate variables
3. Scanning packet bytes for values that correlate with known events
4. Validating candidates across multiple sessions

This avoids reliance on undocumented offsets or unstable community guesses.

---

## Phase Breakdown

---

## Phase 1 – Packet Recording Infrastructure

### Goal
Capture **raw decrypted packets** with enough context to support offline analysis.

### Required Log Format
Use **NDJSON** (one JSON object per line).

Each record MUST include:
```json
{
  "ts": 1700000000000,
  "len": 296,
  "packetVariant": "A",
  "packetId": 1320,
  "speedKmh": 124.3,
  "rpm": 8469,
  "gear": 3,
  "hex": "<full decrypted packet hex>"
}
````

### Implementation Requirements

* Log **after decryption**, before parsing
* Hex or base64 encoding is acceptable (hex preferred)
* File name should include date/session identifier
* Logging must be optional (feature flag / env var)

### Non-negotiables

* Do NOT truncate packets
* Do NOT filter packets during recording
* Do NOT attempt analysis during capture

---

## Phase 2 – Controlled Data Collection Sessions

The value of the data depends entirely on **how the sessions are run**.

### Session A – Tyre Temperature Discovery

**Purpose:** Identify candidate offsets that behave like tyre temperatures.

**Mode:** Time Trial
**Compound:** Any (Soft is fine)

#### Protocol

1. Start session
2. Remain stationary for **15 seconds** (cold baseline)
3. Drive aggressively for **2–3 minutes**

   * hard braking
   * sustained cornering
4. Drive gently for **60 seconds**
5. Stop completely for **15 seconds**

#### Expected Signal

* Values that:

  * increase gradually during aggressive driving
  * stabilize or rise slowly during gentle driving
  * are correlated in groups of four
* Likely stored as `float32`

---

### Session B – Tyre Compound Discovery

**Purpose:** Identify discrete encoding for tyre compound.

**Mode:** Custom Race (pits enabled)

#### Protocol

1. Start on **Soft**
2. Drive for **60–90 seconds**
3. Pit → change to **Medium**
4. Drive for **60–90 seconds**
5. Pit → change to **Hard**
6. Drive for **60–90 seconds**
7. (Optional) Inter / Wet if weather allows

#### Critical Requirement

**Event markers MUST be logged.**

At minimum:

```json
{ "ts": 1700000012345, "event": "PIT_CHANGE_TO_MEDIUM" }
```

Markers can be:

* manual CLI trigger
* keyboard shortcut
* hard-coded timestamp notes (worst case)

Without markers, compound discovery becomes unreliable.

---

### Session C – Wet / Inter Tyres (Optional)

Only required if:

* wet tyres are available in the selected mode
* weather system supports them

Do **not** attempt to infer wet compounds in dry-only sessions.

---

## Phase 3 – Offline Analysis

### Input

* One or more NDJSON files
* Optional event marker entries

### Analysis Steps

#### 1. Rehydrate Packets

* Convert `hex` back into `Buffer`
* Ensure byte alignment is preserved

#### 2. Float32 Scan (Tyre Temps)

* For every 4-byte aligned offset:

  * interpret as little-endian float32
  * track value over time
* Rank offsets by:

  * variance
  * monotonic increase during heat phase
  * low correlation with speed/RPM

#### 3. Integer / Byte Scan (Compound)

* For each byte / int16 candidate:

  * detect step-changes aligned with pit markers
  * value must remain stable between pit stops
* Likely values:

  * small integer enum
  * bitfield

#### 4. Grouping

* Tyre temps should appear as **sets of four** with similar behavior
* Compound should be **single value** or small group

---

## Phase 4 – Validation

Offsets are NOT accepted until validated.

### Validation Rules

* Same offset behaves consistently across:

  * different sessions
  * different compounds
  * different tracks
* Tyre temp offsets:

  * respond to driving style
  * do not mirror speed/RPM exactly
* Compound offsets:

  * change ONLY at pit events
  * remain constant otherwise

Any offset that fails these rules is discarded.

---

## Expected Outputs

### 1. Offsets Definition File

Example:

```ts
export const TYRE_TEMP_OFFSETS = {
  fl: 0x60,
  fr: 0x64,
  rl: 0x68,
  rr: 0x6C,
};

export const TYRE_COMPOUND_OFFSET = 0x8E;
```

### 2. Decoding Rules

* value scaling (if needed)
* enum mappings (e.g. 0=Soft, 1=Medium, etc.)
* packet variant applicability (A/B/~)

### 3. Confidence Notes

Each discovered field should include:

* sessions tested
* packet variants confirmed
* known failure modes

---

## Known Non-Goals (Documented Reality)

* Track names are **not present** in UDP

  * must be inferred via coordinate fingerprinting
* Car names are **not present** in UDP

  * only numeric IDs are transmitted
  * names require local lookup table

Attempts to extract strings from UDP are expected to fail.

---

## Success Criteria

This phase is considered complete when:

* tyre temperature offsets are identified and validated
* tyre compound encoding is identified and validated
* results are reproducible across sessions
* offsets are documented and committed

---

## Engineering Principle

This feature must be:

* deterministic
* reproducible
* defensible

Any offset without data-backed validation is considered invalid.

Guessing is not allowed.

---

```

---

If you want, next step I can:
- write the **analysis script** skeleton
- define the **event marker API**
- or help you decide **when packet B/~ is worth requesting** versus staying on A

But this MD is enough for a competent agent to take it the rest of the way without you babysitting.
```
