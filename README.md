# RoboFusion 1.0 — SCS-RG Hackathon Submission
**Team:** DevTork  
**Track:** Full-stack Backend + Wokwi Simulation

## 🎥 Video Demonstration
> **[Watch our 7-minute System Walkthrough on Google Drive]**(Link_Here)

## 📖 What this system does
The **Multi-Hazard Smart Campus Safety & Response Grid (SCS-RG)** is a production-grade IoT backend. It continuously monitors 5 campus zones for fire, gas, flood, and unauthorized occupancy. 

Our custom **Risk Fusion Engine** calculates real-time risk scores, enforces strict state hysteresis to prevent false alarms, manages a priority queue for critical incidents, and handles race-condition-safe acknowledgments using **MongoDB Multi-document Transactions**.

---

## 🚀 Setup Instructions (For Judges)

We have made the setup process extremely simple.

### Prerequisites
- Node.js (v20+)
- Docker Desktop (for the MongoDB Replica Set)

### Step-by-Step
1. **Environment Setup:**
   ```bash
   cp .env.example .env.local
   ```
   *(No need to change anything for the local test. AI features will gracefully degrade without API keys, but the core system will function perfectly).*

2. **Start the Database:**
   We use a MongoDB Replica Set to support ACID transactions.
   ```bash
   docker compose up -d
   ```

3. **Install Dependencies & Prepare Database:**
   ```bash
   npm install
   npm run db:migrate    # Creates all 15 collections, TTL indexes, and JSON validators
   npm run db:seed       # Seeds the 5 labs and 2 demo users
   ```

4. **Start the Server:**
   ```bash
   npm run dev
   ```
   The backend, API, and WebSocket server will now run on `http://localhost:3000`.

---

## 🧪 Testing the System (Proof of Scale & Integrity)

We built this system to handle real-world scale and concurrency. You can verify this by running our automated test suites:

### 1. Database Integrity & Concurrency
```bash
# Prove that there are 0 orphan documents (Referential Integrity)
npm run db:integrity:check

# Run 10 simultaneous writes to prove transaction safety (Race Conditions)
npm run test:concurrency

# Seed 10,000+ historical readings to prove scale
npm run db:seed:readings

# Generate explain("executionStats") for index performance
npm run db:indexes:explain
```

### 2. Risk Engine & Unit Tests
```bash
# Run the 23 unit tests verifying our risk formula and hysteresis logic
npm run test:unit
```

---

## 📚 Documentation (Required PDFs)

Our system is thoroughly documented to map exactly to the PDF requirements.

- **[System Architecture & Risk Formula](docs/ARCHITECTURE.md)**: Explains the data flow, risk weights, state hysteresis, and backend resilience.
- **[Database Schema Design](docs/DATABASE.md)**: Details the 15 collections, multi-document transactions, and TTL data retention policies.
- **[OpenAPI Specification](openapi.yaml)**: Complete REST and WebSocket API documentation.

---

## ✨ Bonus Features Achieved (40/40 Marks)

We successfully implemented all 4 optional bonus features:

| Bonus | Feature | Implementation Details |
|---|---|---|
| **Bonus 1** | Camera-Based Occupancy | The backend accepts `cameraOccupancy` in the payload and fuses it with PIR data to reduce false alarms. |
| **Bonus 2** | Short-Term Risk Trend | `GET /api/v1/trends/:zone` performs a linear regression on the last 8 readings to detect `RISING`/`FALLING` trends. |
| **Bonus 3** | ML Risk Prediction | `GET /api/v1/predictions/:zone` runs a pre-trained Logistic Regression model to predict critical escalation probability. |
| **Bonus 4** | Natural-Language Input | `POST /api/v1/reports/note` uses an LLM (Gemini/OpenRouter) to securely parse free-text into a deterministic hazard signal. |

*Note: As per PDF safety rules, ML and NLP features are advisory only and are strictly sandboxed from triggering physical actuators.*

---
*Built with ❤️ by Team DevTork.*
