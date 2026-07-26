# RoboFusion 1.0 — SCS-RG — Diagrams (from PDF case + DevTork R1 repo)

Team: **DevTork** · Track: **B — Wokwi Simulation** · Backend: Node/TypeScript + MongoDB Atlas
Source: `RoboFusion_1_0_SCS-RG_Round1_Case.pdf` (problem statement) + `RoboFusion_SCS-RG_DevTork_R1-main.zip` (actual implementation)

---

## 1. System Architecture (as actually implemented)

```mermaid
flowchart LR
  subgraph ZONES["Zone Nodes (Wokwi ESP32 × 5)"]
    Z1[IoT Lab<br/>fire+gas+PIR]
    Z2[Robotics Lab<br/>fire+gas+PIR]
    Z3[Server Room<br/>fire+water+PIR]
    Z4[Data Science Lab<br/>fire+water+PIR]
    Z5[Software Lab<br/>PIR-driven]
  end

  subgraph BACKEND["Backend (Next.js API routes + services)"]
    AUTH[Zone API-key auth]
    VAL[Strict validation<br/>+ dedup by boot/sequence]
    RISK[Risk Engine<br/>server-side fusion + hysteresis]
    INC[Incident Service<br/>lifecycle + acknowledgment]
    PRI[Priority Queue Engine]
    CMD[Command Service<br/>versioned actuator commands]
    ML[ML / Trend / NLP<br/>advisory only]
  end

  subgraph DB["MongoDB Atlas"]
    D1[(zones / zone_states)]
    D2[(readings)]
    D3[(incidents / incident_events)]
    D4[(acknowledgments)]
    D5[(actuator_commands / manual_overrides)]
    D6[(users / sessions)]
    D7[(predictions / nlp_reports / audits)]
  end

  subgraph RT["Real-time Gateway"]
    WS[WebSocket /ws]
    SSE[SSE fallback]
  end

  FE[Frontend Dashboard<br/>not in this archive]

  Z1 & Z2 & Z3 & Z4 & Z5 -->|raw sensor POST| AUTH --> VAL --> RISK
  RISK -->|Mongo transaction| D1
  RISK --> D2
  RISK --> INC --> D3
  INC --> D4
  RISK --> PRI
  RISK --> CMD --> D5
  CMD -->|command down| Z1 & Z2 & Z3 & Z4 & Z5
  D6 --- AUTH
  ML --> D7
  D1 & D3 & PRI --> WS --> FE
  D1 & D3 --> SSE --> FE
```

---

## 2. Reading Ingestion Data Flow (sequence)

```mermaid
sequenceDiagram
  participant Node as Zone Node (ESP32/Wokwi)
  participant API as Ingestion API
  participant Val as Validator
  participant Risk as Risk Engine
  participant DB as MongoDB Atlas
  participant Inc as Incident Service
  participant WS as Real-time Hub
  participant Dash as Dashboard

  Node->>API: POST /readings/:zoneCode (raw fire/gas/water/pir + x-zone-api-key)
  API->>Val: authenticate + check payload
  alt malformed / impossible value
    Val-->>Node: 422 INVALID_READING
  else duplicate (zoneId,bootId,sequence)
    Val-->>Node: 200 duplicate=true
  else valid
    Val->>Risk: normalize + fuse signals
    Risk->>Risk: apply debounce/hysteresis, compute risk_score
    Risk->>DB: transaction: reading + zone_state + incident/event + command
    alt risk crosses CRITICAL
      Risk->>Inc: open/keep active incident
      Risk->>Node: versioned command (LED=RED, buzzer=on, relay=cutoff)
    end
    DB->>WS: broadcast ZONE_STATE_CHANGED / PRIORITY_QUEUE_UPDATED
    WS->>Dash: push update
    Risk-->>Node: 200 accepted (state, risk_score, command)
  end
```

---

## 3. Database Entity-Relationship Diagram

```mermaid
erDiagram
  ZONES ||--|| ZONE_STATES : has
  ZONES ||--o{ SENSORS : contains
  ZONES ||--o{ READINGS : reports
  ZONES ||--o{ INCIDENTS : generates
  ZONES ||--o{ ACTUATOR_COMMANDS : receives
  ZONES ||--o{ MANUAL_OVERRIDES : receives
  INCIDENTS ||--o{ INCIDENT_EVENTS : contains
  INCIDENTS ||--o| ACKNOWLEDGMENTS : receives
  INCIDENTS ||--o{ NATURAL_LANGUAGE_REPORTS : may_link
  USERS ||--o{ ACKNOWLEDGMENTS : makes
  USERS ||--o{ MANUAL_OVERRIDES : issues
  USERS ||--o{ SESSIONS : owns

  ZONES {
    string code UK
    string name
  }
  ZONE_STATES {
    string zoneId FK
    string safetyState
    string connectivityState
    number riskScore
    number stateVersion
  }
  READINGS {
    string zoneId FK
    string bootId
    number sequence
    boolean fire
    number gas
    number water
    boolean pir
  }
  INCIDENTS {
    string zoneId FK
    string status
    boolean active
    string primaryHazard
  }
  ACKNOWLEDGMENTS {
    string incidentId FK
    string userId FK
  }
```

---

## 4. Zone Safety-State Machine (per zone)

```mermaid
stateDiagram-v2
  [*] --> SAFE
  SAFE --> WARNING: risk >= 30 (2 consecutive readings)
  WARNING --> CRITICAL: risk >= 65 (2 consecutive readings)\nor confirmed fire (5-sample debounce)
  CRITICAL --> WARNING: risk < 55 for >= 5s
  WARNING --> SAFE: risk < 25 for >= 5s
  SAFE --> CRITICAL: confirmed fire debounce (immediate)

  state "CRITICAL: buzzer+LED(red)+relay cutoff" as CRIT_ACT
  CRITICAL --> CRIT_ACT

  note right of CRITICAL
    connectivityState tracked separately:
    ONLINE / DEGRADED / OFFLINE / NOT_CONFIGURED
    OFFLINE preserves last known safetyState
  end note
```

---

## 5. Incident Lifecycle

```mermaid
stateDiagram-v2
  [*] --> OPEN: Zone -> CRITICAL (new incident created)
  OPEN --> ACKNOWLEDGED: staff acknowledges (first-write-wins)
  OPEN --> OPEN: zone stays CRITICAL <-> WARNING (incident remains active)
  ACKNOWLEDGED --> ACKNOWLEDGED: zone stays CRITICAL <-> WARNING (incident remains active)
  ACKNOWLEDGED --> RESOLVED: zone reaches SAFE
  OPEN --> RESOLVED: zone reaches SAFE (even without ack)
  RESOLVED --> [*]
  RESOLVED --> OPEN: hazard triggers again later (NEW incident record)
```

---

## 6. Priority Ranking Logic

```mermaid
flowchart TD
  A[All zones currently CRITICAL] --> B["priority_score = risk_score<br/>+ 10 if occupied<br/>+ min(10, critical_duration_s / 30)<br/>+ bounded NLP bonus (0/3/7)"]
  B --> C{Tie-break if equal}
  C --> D1[1. Higher priority_score]
  D1 --> D2[2. Higher risk_score]
  D2 --> D3[3. Occupied before empty]
  D3 --> D4[4. Earlier criticalSince]
  D4 --> D5[5. Alphabetical zone code]
  D5 --> E[Ranked priority queue -> Dashboard]
```

---

## 7. Risk Fusion Formula (as implemented in repo, adapted from PDF Section 13)

```mermaid
flowchart LR
  Fire["fire_confirmed (0/1)<br/>×70"] --> Sum
  Gas["gas_factor (0-1)<br/>×70"] --> Sum
  Water["water_factor (0-1)<br/>×70"] --> Sum
  Occ["occupancy_factor (0-1)<br/>×10"] --> Sum
  Sum["Σ, capped at 100"] --> Class{Classify}
  Class -->|< 30| SAFE
  Class -->|30-64| WARNING
  Class -->|>= 65| CRITICAL
```

---

## 8. PDF Round-1 Marks Map (for reference)

```mermaid
flowchart TD
  T["Round 1 Total: 200<br/>(160 core + 40 bonus)"] --> A["A. Hardware & Sensing — 40"]
  T --> B["B. Backend System — 35"]
  T --> C["C. Frontend Dashboard — 30"]
  T --> D["D. Database Design — 20"]
  T --> E["E. Integration & Edge Cases — 15"]
  T --> F["F. Documentation & Presentation — 20"]
  T --> G["Bonus: Camera / Trend / ML / NLP — up to 40"]
```

---

### Notes tying repo back to the PDF case
- Repo implements **all 5 labs** (PDF required minimum 3) as Wokwi simulation (Track B), matching PDF Section 04.
- Risk formula weights differ from the PDF's worked example (70/70/70/10 vs 40/25/20/15) — allowed per PDF Section 13 ("adapt or replace... as long as you explain them"); repo's `ARCHITECTURE.md` gives its own rationale.
- **Frontend dashboard is explicitly NOT included** in this archive (per its own README) — so Section C (30 marks) and parts of Section F/Video (Test Cases 12–16, 31) cannot be verified from this zip alone.
- Bonus 1 (camera) is only stubbed as a dev cross-check flag (`cameraOccupancy`), not real image-based detection — repo README says so itself.
- Backend, DB, and most edge-case/integration logic (Sections A, B, D, E) appear thoroughly implemented with tests (`tests/` folder covers concurrency, races, load, multi-zone priority).
