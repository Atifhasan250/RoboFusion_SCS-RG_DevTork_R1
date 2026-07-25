# Multi-Hazard Smart Campus Safety & Response Grid (SCS-RG)

**Team:** DevTork  
**Track:** Track B (Simulation)

## Video Demonstration
> **[System Walkthrough on Google Drive]**(Insert_Link_Here)

## System Overview
The SCS-RG is a full-stack IoT system designed to monitor technical labs for fire, gas, flood, and unauthorized occupancy. It implements a custom Risk Fusion formula to compute per-zone risk scores, prioritizes incidents during simultaneous multi-zone emergencies, and provides a real-time command dashboard for campus security.

This repository contains the complete implementation for the Backend System, Frontend Command Dashboard, and Database Schema as per the Round 1 Case requirements.

---

## Setup Instructions

### Prerequisites
- Node.js (v20 or higher)
- Docker Desktop (for MongoDB Replica Set)

### Local Deployment
1. **Configure Environment:**
   ```bash
   cp .env.example .env.local
   ```
   *(Add required API keys if evaluating NLP and ML prediction bonus features).*

2. **Initialize Database:**
   The system requires a MongoDB Replica Set to support Multi-Document Transactions.
   ```bash
   docker compose up -d
   ```

3. **Install Dependencies & Migrate Schema:**
   ```bash
   npm install
   npm run db:migrate    # Creates collections, TTL indexes, and JSON validators
   npm run db:seed       # Seeds 5 candidate zones and demo users
   ```

4. **Start Application:**
   ```bash
   npm run dev
   ```
   The server operates on `http://localhost:3000`.

---

## Testing & Verification

The following commands verify the database integrity, concurrency handling, and system logic outlined in the evaluation criteria.

### Database Integrity & Concurrency
```bash
# Verifies zero orphan documents across all collections
npm run db:integrity:check

# Simulates 10 simultaneous writes to evaluate transaction safety
npm run test:concurrency

# Seeds 10,000+ historical readings to evaluate query performance
npm run db:seed:readings

# Generates explain("executionStats") for index performance verification
npm run db:indexes:explain
```

### System Logic
```bash
# Executes unit tests for the risk formula, hysteresis, and priority queue
npm run test:unit
```

---

## Documentation

The system's technical documentation is structured as follows:

- **[System Architecture & Risk Formula](docs/ARCHITECTURE.md)**: Details the fusion formula, state hysteresis, backend resilience, and justification for weight assignments.
- **[Database Schema Design](docs/DATABASE.md)**: Documents the schema normalization, foreign key alternatives, and data retention policies.
- **[OpenAPI Specification](openapi.yaml)**: Complete REST and WebSocket API documentation.
- **[Wokwi Hardware Simulation](wokwi-simulation/README.md)**: Wiring diagrams and configuration instructions for the Track B hardware simulation.

---

## Bonus Features Implemented

1. **Camera-Based Occupancy Check**: Wokwi simulation includes a toggle switch simulating ESP32-CAM input, which the backend cross-checks with PIR to eliminate false negatives.
2. **Short-Term Risk Trend**: The ingestion engine calculates linear trajectory (slope) across recent readings and triggers a `TREND_CRITICAL` warning if escalation is imminent.
3. **Machine-Learning Risk Prediction**: `GET /api/v1/predictions/:zone` implements a Logistic Regression model to estimate the probability of a critical escalation.
4. **Natural-Language Incident Reporting**: `POST /api/v1/reports/note` converts free-text observations into deterministic hazard signals via LLM parsing, safeguarded by strict validation gates.
