
# D-01 — Mini-PMS High Level Design

## 1. System Architecture


```mermaid
flowchart LR

    Browser["Browser"]

    subgraph PUBLIC["Public-Facing Layer"]
        direction TB
        Web["Next.js Web / Auth.js"]
        Keycloak["Keycloak"]
        Gateway["API Gateway"]
    end

    subgraph PRIVATE["Private Internal Network"]
        direction TB

        subgraph BROKERS["Messaging"]
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

    %% Asynchronous measurement flow
    Simulator -->|"Kafka: mpms.measurement.raw"| Kafka
    Kafka -->|"Consume: mpms.measurement.raw"| Ingestion
    Ingestion -->|"Produce: mpms.measurement.dlq"| Kafka

    %% Background jobs
    Calculation -->|"Publish: mpms.calculation.jobs"| RabbitMQ
    RabbitMQ -->|"Consume: mpms.calculation.jobs"| Calculation
    Report -->|"Publish: mpms.report.jobs"| RabbitMQ
    RabbitMQ -->|"Consume: mpms.report.jobs"| Report

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
    Unit <-->|"SQL: Unit / Meter / Limit R-W"| PostgreSQL
    Ingestion -->|"SQL: Measurement Upsert"| PostgreSQL
    Calculation <-->|"SQL: Measurement Read / Result Write"| PostgreSQL
    Alarm <-->|"SQL: Alarm R-W"| PostgreSQL
    Report <-->|"SQL: Report Request R-W"| PostgreSQL

    %% Redis
    Gateway <-->|"Redis: Unit Cache"| Redis
    Unit -->|"Redis: Cache Invalidation"| Redis
    Ingestion <-->|"Redis: Latest Values / Idempotency"| Redis
    Calculation <-->|"Redis: Scheduler Lock"| Redis

    %% Neo4j projection
    Unit <-->|"Bolt / Cypher: Topology Projection"| Neo4j

    %% Reporting
    Report -->|"HTTP REST: PDF / Excel Render"| Jsreport
    Gateway -->|"HTTP REST: Report Stream"| Jsreport

    %% Styling
    classDef edge fill:#DBEAFE,stroke:#2563EB,color:#172554
    classDef service fill:#DCFCE7,stroke:#16A34A,color:#14532D
    classDef broker fill:#FEF3C7,stroke:#D97706,color:#78350F
    classDef storage fill:#F3E8FF,stroke:#9333EA,color:#581C87

    class Web,Keycloak,Gateway edge
    class Unit,Ingestion,Calculation,Alarm,Report,Simulator service
    class RabbitMQ,Kafka broker
    class PostgreSQL,Redis,Neo4j,Jsreport storage
```


### Architecture Explanation

1. The system separates public-facing components from internal backend services and infrastructure.
2. Next.js handles user authentication through Keycloak, while the API Gateway validates JWT access tokens locally using JWKS.
3. Synchronous requests use HTTP and RabbitMQ RPC, while asynchronous measurement and event processing uses Kafka and RabbitMQ work queues.
4. The Unit, Ingestion, Calculation, Alarm, and Report services handle their respective business responsibilities.
5. PostgreSQL is the primary source of truth, while Neo4j maintains a derived projection of the electrical network topology.
6. Redis provides caching, latest measurement storage, idempotency checks, and distributed scheduler locks.
7. Invalid measurement messages are sent to `mpms.measurement.dlq`, and failed calculation jobs can be handled through `mpms.calculation.jobs.dlx`.
8. jsreport generates PDF and Excel documents, while the API Gateway provides authorized report downloads.
9. Authenticated browser clients receive real-time notifications through WebSocket connections to the API Gateway.

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

1. API Gateway replicas consume Kafka events using the `mpms-gateway` consumer group.
2. Kafka distributes event consumption among the replicas according to partition assignments.
3. A Gateway replica receiving an event publishes the notification to the corresponding Redis Pub/Sub channel.
4. All Gateway replicas subscribe to `ws:instant`, `ws:alarm`, and `ws:report`.
5. Each Gateway forwards relevant notifications to its connected WebSocket clients.
6. WebSocket connections require valid authentication and enforce authorization.
7. If a Gateway replica disconnects, its clients must reconnect, and Redis Pub/Sub does not retain missed notifications.
```
