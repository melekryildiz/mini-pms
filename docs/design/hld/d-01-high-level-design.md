
# D-01 — Mini-PMS High Level Design

## 1. System Architecture

```mermaid
flowchart LR

    subgraph PUBLIC["Public-Facing Layer"]
        direction TB
        Browser["Browser"]
        Web["Next.js Web / Auth.js"]
        Keycloak["Keycloak"]
        Gateway["API Gateway"]
    end

    subgraph PRIVATE["Private Internal Network"]
        direction LR

        subgraph BROKERS["Messaging"]
            direction TB
            RabbitMQ[["RabbitMQ"]]
            Kafka[["Kafka"]]
        end

        subgraph CORE["Core Services"]
            direction TB
            Unit["Unit Service"]
            Ingestion["Ingestion Service"]
            Calculation["Calculation Service"]
            Alarm["Alarm Service"]
            Report["Report Service"]
            Simulator["Simulator"]
        end

        subgraph DATA["Data Stores and Reporting"]
            direction TB
            PostgreSQL[("PostgreSQL - Source of Truth")]
            Redis[("Redis")]
            Neo4j[("Neo4j - Topology Projection")]
            Jsreport["jsreport"]
        end
    end

    %% Left-to-right layout anchors
    Gateway ~~~ RabbitMQ
    RabbitMQ ~~~ Unit
    Unit ~~~ PostgreSQL

    %% Authentication
    Browser -->|"HTTPS"| Web
    Browser -->|"HTTPS / OIDC Login"| Keycloak
    Web <-->|"OIDC / Token Exchange"| Keycloak
    Web -->|"HTTP + JWT"| Gateway
    Gateway -.->|"HTTPS / JWKS"| Keycloak

    %% Synchronous RPC
    Gateway <-->|"RabbitMQ RPC"| RabbitMQ
    RabbitMQ <-->|"RPC: mpms.unit"| Unit
    RabbitMQ <-->|"RPC: mpms.instant"| Ingestion
    RabbitMQ <-->|"RPC: mpms.calculation"| Calculation
    RabbitMQ <-->|"RPC: mpms.alarm"| Alarm
    RabbitMQ <-->|"RPC: mpms.report"| Report

    %% Measurement flow
    Simulator -->|"Produce: mpms.measurement.raw"| Kafka
    Kafka -->|"Consume: mpms.measurement.raw"| Ingestion
    Ingestion -->|"Produce: mpms.measurement.dlq"| Kafka

    %% Calculation jobs
    Calculation -->|"Publish: mpms.calculation.jobs"| RabbitMQ
    RabbitMQ -->|"Consume: mpms.calculation.jobs"| Calculation

    %% Redis report queue
    Report -->|"RPUSH: report:queue"| Redis
    Redis -->|"BLPOP: report:queue"| Report

    %% Kafka events
    Calculation -->|"Produce: mpms.calculation.result"| Kafka
    Calculation -->|"Produce: mpms.limit.exceeded"| Kafka
    Kafka -->|"Consume: mpms.limit.exceeded"| Alarm
    Alarm -->|"Produce: mpms.alarm.event"| Kafka
    Report -->|"Produce: mpms.report.completed"| Kafka

    %% Gateway event consumption
    Kafka -->|"Consume: mpms.calculation.result"| Gateway
    Kafka -->|"Consume: mpms.alarm.event"| Gateway
    Kafka -->|"Consume: mpms.report.completed"| Gateway

    %% WebSocket
    Browser <-->|"WSS / JWT"| Gateway

    %% PostgreSQL
    Unit <-->|"SQL: Unit / Device / Limit R-W"| PostgreSQL
    Ingestion -->|"SQL: Measurement Upsert"| PostgreSQL
    Calculation <-->|"SQL: Measurement Read / Result Write"| PostgreSQL
    Alarm <-->|"SQL: Alarm R-W"| PostgreSQL
    Report <-->|"SQL: Report Request R-W / Recovery"| PostgreSQL

    %% Redis
    Gateway <-->|"Redis: Unit Cache"| Redis
    Unit -->|"Redis: Cache Invalidation"| Redis
    Ingestion <-->|"Redis: Latest Values / Idempotency"| Redis
    Calculation <-->|"Redis: Scheduler Lock"| Redis

    %% Neo4j
    Unit <-->|"Bolt / Cypher: Topology Projection"| Neo4j

    %% Reporting
    Report -->|"HTTP REST: PDF / Excel Render"| Jsreport
    Gateway -->|"HTTP REST: Report Stream"| Jsreport

    %% Styling
    classDef edge fill:#DBEAFE,stroke:#2563EB,color:#172554
    classDef service fill:#DCFCE7,stroke:#16A34A,color:#14532D
    classDef broker fill:#FEF3C7,stroke:#D97706,color:#78350F
    classDef storage fill:#F3E8FF,stroke:#9333EA,color:#581C87

    class Browser,Web,Keycloak,Gateway edge
    class Unit,Ingestion,Calculation,Alarm,Report,Simulator service
    class RabbitMQ,Kafka broker
    class PostgreSQL,Redis,Neo4j,Jsreport storage
```

### Architecture Explanation

1. The Public-Facing Layer contains Next.js, Keycloak, and API Gateway.
2. RabbitMQ handles synchronous RPC and calculation jobs; Kafka handles measurements and asynchronous events.
3. Core Services implement unit management, ingestion, calculations, alarms, and reporting.
4. PostgreSQL is the source of truth, while Neo4j maintains the electrical topology projection.
5. Redis handles caching, latest measurements, scheduler locks, and report job queues.
6. Report Service uses Redis `RPUSH` and `BLPOP` with a single worker pod.
7. jsreport generates PDF and Excel documents.
8. API Gateway delivers real-time notifications through WebSocket.

## 2. Multi-Replica WebSocket Distribution

```mermaid
flowchart TB

    Kafka[["Kafka
    mpms.calculation.result
    mpms.alarm.event
    mpms.report.completed"]]

    subgraph Replicas["API Gateway Replicas"]
        direction LR
        G1["Gateway 1"]
        G2["Gateway 2"]
    end

    Redis[("Redis Pub/Sub
    ws:instant
    ws:alarm
    ws:report")]

    B1["Browser 1"]
    B2["Browser 2"]

    Kafka -->|"Consume: mpms-gateway"| G1
    Kafka -->|"Consume: mpms-gateway"| G2

    G1 <-->|"Redis PUBLISH / SUBSCRIBE"| Redis
    G2 <-->|"Redis PUBLISH / SUBSCRIBE"| Redis

    G1 <-->|"WSS / JWT"| B1
    G2 <-->|"WSS / JWT"| B2
```

### WebSocket Explanation

1. Gateway replicas consume Kafka events through the `mpms-gateway` consumer group.
2. Kafka distributes events according to partition assignments.
3. The consuming Gateway publishes notifications to Redis Pub/Sub.
4. All Gateway replicas subscribe to `ws:instant`, `ws:alarm`, and `ws:report`.
5. Each Gateway forwards notifications to its connected WebSocket clients.
6. WebSocket connections require authentication and authorization.
7. Redis Pub/Sub does not retain missed notifications.
