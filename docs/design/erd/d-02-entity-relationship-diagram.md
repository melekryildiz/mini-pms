# D-02 — Entity Relationship Diagram

## 1. ERD

```mermaid
erDiagram
    organization_unit_type {
        bigint id PK
        varchar type UK
    }
    organization_unit {
        bigint id PK
        bigint parent_id FK
        bigint organization_unit_type_id FK
        varchar code UK
        varchar name
        boolean is_active
        boolean is_deleted
        timestamptz created_at
        varchar created_by
        timestamptz deleted_at
        varchar deleted_by
    }
    organization_unit_log {
        bigint id PK
        bigint organization_unit_id FK
        varchar action
        jsonb changes
        timestamptz created_at
        varchar created_by
    }
    device {
        bigint id PK
        bigint organization_unit_id FK
        varchar serial_no
        varchar role
        jsonb metadata
        boolean is_active
        boolean is_deleted
        timestamptz created_at
        varchar created_by
        timestamptz deleted_at
        varchar deleted_by
    }
    device_log {
        bigint id PK
        bigint device_id FK
        varchar action
        jsonb changes
        timestamptz created_at
        varchar created_by
    }
    reactive_limit_config {
        bigint id PK
        bigint organization_unit_id FK
        varchar limit_type
        numeric limit_value
        timestamptz valid_from
        timestamptz valid_to
    }
    interval {
        bigint id PK
        bigint device_id FK
        timestamptz period_start
        numeric active_import_kwh
        numeric active_export_kwh
        numeric inductive_kvarh
        numeric capacitive_kvarh
    }
    cron_job_definition {
        bigint id PK
        varchar job_name UK
        varchar schedule
        varchar description
        jsonb metadata
        boolean is_active
    }
    calculation_job {
        bigint id PK
        bigint cron_job_definition_id FK
        bigint organization_unit_id FK
        varchar job_type
        varchar status
        timestamptz started_at
        timestamptz completed_at
        timestamptz created_at
    }
    reactive_result {
        bigint id PK
        bigint calculation_job_id FK
        bigint organization_unit_id FK
        timestamptz period_start
        varchar period_type
        numeric inductive_ratio
        numeric capacitive_ratio
        timestamptz created_at
    }
    demand_result {
        bigint id PK
        bigint calculation_job_id FK
        bigint organization_unit_id FK
        timestamptz period_start
        varchar period_type
        numeric demand_kw
        timestamptz created_at
    }
    limit_exceedance {
        bigint id PK
        bigint organization_unit_id FK
        bigint reactive_result_id FK
        bigint reactive_limit_config_id FK
        varchar limit_type
        numeric actual_value
        numeric limit_value
        timestamptz created_at
    }
    alarm {
        bigint id PK
        bigint limit_exceedance_id FK
        bigint organization_unit_id FK
        varchar status
        text message
        timestamptz first_seen_at
        timestamptz last_seen_at
        timestamptz acknowledged_at
        varchar acknowledged_by
        timestamptz closed_at
        varchar closed_by
    }
    request_type {
        bigint id PK
        varchar name UK
        text description
        boolean is_active
    }
    report_request {
        bigint id PK
        bigint request_type_id FK
        bigint organization_unit_id FK
        varchar status
        timestamptz period_start
        timestamptz period_end
        jsonb metadata
        timestamptz requested_at
        varchar requested_by
        timestamptz completed_at
        text file_path
    }

    organization_unit_type ||--o{ organization_unit : classifies
    organization_unit o|--o{ organization_unit : parent
    organization_unit ||--o{ organization_unit_log : logs
    organization_unit ||--o{ device : has
    device ||--o{ device_log : logs
    organization_unit ||--o{ reactive_limit_config : limits
    device ||--o{ interval : measures
    cron_job_definition o|--o{ calculation_job : schedules
    organization_unit ||--o{ calculation_job : runs
    calculation_job ||--o{ reactive_result : produces
    calculation_job ||--o{ demand_result : produces
    organization_unit ||--o{ reactive_result : owns
    organization_unit ||--o{ demand_result : owns
    organization_unit ||--o{ limit_exceedance : has
    reactive_result ||--o{ limit_exceedance : triggers
    reactive_limit_config ||--o{ limit_exceedance : defines
    limit_exceedance ||--o{ alarm : triggers
    organization_unit ||--o{ alarm : has
    request_type ||--o{ report_request : categorizes
    organization_unit ||--o{ report_request : requests
```

## 2. Constraints

- All tables use the `mini_pms` schema and auto-generated `BIGINT` primary keys.
- Foreign keys connect the tables as shown in the diagram.
- `organization_unit` and `device` use soft delete: deleted records are inactive and require `deleted_at` and `deleted_by`.
- `device.metadata`, `cron_job_definition.metadata`, and `report_request.metadata` are JSON objects.
- `interval` is unique on `(device_id, period_start)`; energy values cannot be negative.
- `reactive_limit_config` requires a nonnegative limit and `valid_to > valid_from` when an end date is provided.
- `reactive_result` and `demand_result` are unique on `(calculation_job_id, period_start, period_type)`; results cannot be negative.
- `limit_exceedance` requires `actual_value > limit_value`.
- `report_request` requires `period_end > period_start`; completed requests must have `completed_at`.

## 3. Status Values

| Field | Allowed values |
|---|---|
| `calculation_job.status` | `PENDING`, `RUNNING`, `COMPLETED`, `FAILED`, `NO_DATA` |
| `alarm.status` | `OPEN`, `ACKNOWLEDGED`, `CLOSED` |
| `report_request.status` | `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED` |

## 4. Notes

- `cron_job_definition` stores schedules; `calculation_job` tracks executions.
- `limit_exceedance` records reactive limit violations; `alarm` tracks their acknowledgement and closure.
- `request_type` defines report categories; `report_request` tracks generation requests.
- Report period dates are separate columns in the current migration. They can be moved into `metadata` if that design is selected.

> **Before running migrations:** Fix the SQL syntax and timestamp ordering errors already identified. This diagram reflects the proposed migration structure, not a verified live database. The current `limit_exceedance` model references `reactive_result` only; demand-limit violations would require an additional design decision.
