# Software Architecture Diagram

This diagram outlines the cloud architecture of the RoboFusion system, including hardware zones, the backend processing pipeline, the database, and the frontend dashboard.

```mermaid
flowchart LR

subgraph Hardware_Zones["Hardware Zones"]
    Z1["IoT Lab<br/>(Fire, Gas, PIR)"]
    Z2["Robotics Lab<br/>(Fire, Gas, PIR)"]
    Z3["Server Room<br/>(Fire, Flood, PIR)"]
    Z4["Data Science Lab<br/>(Fire, Flood, PIR)"]
    Z5["Software Lab<br/>(PIR)"]
end

subgraph UFTB_Campus_Backend["UFTB Campus Backend"]
    API["API Gateway"]
    Ingest["Real-time Ingestion"]
    Risk["Risk Fusion Engine"]
    Rank["Priority Ranking"]
    Alert["Alert Broadcast<br/>(WebSocket)"]
    Cmd["Command Service<br/>(Actuation)"]
end

subgraph DB["Database"]
    MongoDB[("MongoDB / Atlas")]
end

subgraph Frontend_Dashboard["Frontend Dashboard"]
    Map["Live Zone Map"]
    Queue["Priority Queue"]
    Timeline["Incident Timeline"]
end

%% Connections
Z1 -->|Raw Sensors| API
Z2 -->|Raw Sensors| API
Z3 -->|Raw Sensors| API
Z4 -->|Raw Sensors| API
Z5 -->|Raw Sensors| API

Cmd -->|Actuator Commands| Z1
Cmd -->|Actuator Commands| Z2
Cmd -->|Actuator Commands| Z3
Cmd -->|Actuator Commands| Z4
Cmd -->|Actuator Commands| Z5

API --> Ingest
Ingest --> Risk
Risk --> Rank
Risk --> Alert
Rank --> MongoDB
Ingest --> MongoDB
MongoDB --> API

Alert -->|Real-time Updates| Frontend_Dashboard
Frontend_Dashboard -->|Acks, Overrides| API
```
