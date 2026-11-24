# D-02 — Veri modeli

F4 başlangıç revizyonu. İlk çizim mevcut migration dosyalarını gösterir.
F4 için gereken ek alan ve kurallar aşağıda ayrı gösterildi; henüz migration uygulanmadı.

## Mevcut tablolar

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
        timestamptz updated_at
        varchar updated_by
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
        numeric multiplier
        jsonb metadata
        boolean is_active
        boolean is_deleted
        timestamptz created_at
        varchar created_by
        timestamptz updated_at
        varchar updated_by
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
        numeric multiplier_applied
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

## Mevcut kurallar

- Tablolar `mini_pms` şemasında. Kimlikler `BIGINT`; TypeScript tarafında string kullanılır.
- `organization_unit.parent_id` boş olabilir; kök birimin üst birimi yoktur.
- Birim ve cihazlar soft-delete kullanır. Aktif ve silinmemiş kayıtlar işleme alınır.
- Sayaç rolü yalnız `MAIN` veya `FEEDER`; `multiplier` pozitif NUMERIC(18,6), varsayılan 1.
- `device.serial_no` silinmiş kayıtlar dahil unique. Aynı birimde aktif ve silinmemiş
  MAIN sayaç için partial unique index var; ikinci aktif MAIN oluşturulamaz.
- Ingestion dört ham enerjiyi SQL NUMERIC ile çarpar. `interval.multiplier_applied`
  ilk kayıt çarpanını saklar; tekrar gelen ölçüm bu çarpanla karşılaştırılır.
  Redis'e de çarpılmış DB değerleri gider. Eski ölçümler çarpan 1 ile korunur.
- `interval` için `(device_id, period_start)` unique. Enerjiler negatif olamaz.
- `cron_job_definition.job_name` unique. `schedule` zamanlamayı tutar; metadata JSON nesnesidir.
- `calculation_job.cron_job_definition_id` boş olabilir; elle başlatılan iş cron'a bağlı olmayabilir.
- İşte `started_at` ve `completed_at` başlangıçta boştur.
- Mevcut sonuç unique anahtarı `(calculation_job_id, period_start, period_type)`.
  Farklı job ID ile yeniden hesaplamada bu anahtar tek başına yeterli değildir.
- Reaktif limitlerin bitiş tarihi boş olabilir. Aynı birim ve limit türünde tarih aralıkları çakışamaz.
- Mevcut `limit_exceedance` yalnız reaktif sonuca ve reaktif limite bağlıdır.
  Talep aşımı için aşağıdaki genişletme gerekir.

## F4 için eklenecek alanlar

Bu çizim bir tasarım önerisidir. Yeni migration ile uygulanacak; eski migration dosyaları değiştirilmeyecek.
`calculation_job` tek birim ve tek 15 dakikalık dönem için reaktif + talep hesabını temsil eder.
Günlük/aylık kümülatif sonuçlar da aynı çalıştırmada güncellenir.

```mermaid
erDiagram
    cron_job_definition {
        bigint id PK
        varchar job_name UK
        varchar schedule
        jsonb metadata "timezone ve is ayarlari"
        boolean is_active
    }
    calculation_job {
        bigint id PK
        bigint cron_job_definition_id FK "elle is icin null"
        bigint organization_unit_id FK
        varchar job_type "ENERGY_CALCULATION"
        timestamptz period_start "UTC ve 15 dakika siniri"
        varchar status
        integer attempt_count "baslangicta 0"
        uuid claimed_by "calistirma sahipligi; null olabilir"
        timestamptz lease_until "sahiplik sonu; null olabilir"
        timestamptz next_attempt_at "tekrar deneme zamani"
        text last_error "null olabilir"
        timestamptz started_at "null olabilir"
        timestamptz completed_at "null olabilir"
        timestamptz created_at
    }
    reactive_result {
        bigint id PK
        bigint calculation_job_id FK
        bigint organization_unit_id FK
        timestamptz period_start
        varchar period_type "INTERVAL DAY MONTH"
        numeric inductive_ratio "aktif sifirsa null"
        numeric capacitive_ratio "aktif sifirsa null"
        timestamptz created_at
    }
    demand_result {
        bigint id PK
        bigint calculation_job_id FK
        bigint organization_unit_id FK
        timestamptz period_start
        varchar period_type "INTERVAL DAY MONTH"
        numeric demand_kw
        numeric export_demand_kw "uretim talebi; yeni alan"
        timestamptz created_at
    }
    power_limit_config {
        bigint id PK
        bigint organization_unit_id FK
        varchar limit_type "IMPORT EXPORT"
        numeric limit_kw
        timestamptz valid_from
        timestamptz valid_to "null olabilir"
    }
    limit_exceedance {
        bigint id PK
        bigint organization_unit_id FK
        bigint reactive_result_id FK "reaktif asimda dolu"
        bigint demand_result_id FK "talep asiminda dolu"
        bigint reactive_limit_config_id FK "reaktif asimda dolu"
        bigint power_limit_config_id FK "talep asiminda dolu"
        timestamptz period_start
        varchar period_type
        varchar limit_type
        numeric actual_value
        numeric limit_value
        timestamptz created_at
    }
    event_outbox {
        bigint id PK
        uuid event_id UK
        varchar destination
        varchar message_key
        jsonb payload
        timestamptz created_at
        timestamptz published_at "gonderilmediyse null"
    }
    organization_unit ||--o{ calculation_job : hesaplanir
    cron_job_definition o|--o{ calculation_job : baslatir
    organization_unit ||--o{ power_limit_config : guc_limiti
    calculation_job ||--o{ reactive_result : reaktif
    calculation_job ||--o{ demand_result : talep
    reactive_result o|--o{ limit_exceedance : reaktif_asim
    demand_result o|--o{ limit_exceedance : talep_asimi
    reactive_limit_config o|--o{ limit_exceedance : reaktif_limit
    power_limit_config o|--o{ limit_exceedance : guc_limiti
```

`event_outbox` mesajı kalıcı saklar. Job/sonuç ile aynı PostgreSQL transaction'ında yazılır.
Ayrı bir gönderici bekleyen mesajları RabbitMQ veya Kafka'ya iletir. Broker onayı alınca
`published_at` doldurulur. Onaydan sonra uygulama kapanırsa tekrar gönderilebilir;
tüketici job ID veya event ID ile tekrarları ayırır. Bu, mesajın yalnız bir kez teslim edildiği anlamına gelmez.

## F4 unique ve index kuralları

| Yer | Kural | Neden? |
|---|---|---|
| `calculation_job` | UNIQUE `(organization_unit_id, job_type, period_start)` | Üç replika aynı birim/dönem için tek iş oluşturur. |
| `calculation_job` | INDEX `(status, period_start)` | Bekleyen işleri bulmak. |
| `calculation_job` | INDEX `(status, lease_until)` | Süresi dolmuş RUNNING işleri kurtarmak. |
| Sonuç tabloları | UNIQUE `(organization_unit_id, period_start, period_type)` | Yeni job ID ile yeniden hesaplama da aynı sonucu günceller. |
| `limit_exceedance` | UNIQUE `(organization_unit_id, period_start, period_type, limit_type)` | Aynı dönem yeniden hesaplanınca ikinci aşım oluşmaz. |
| `power_limit_config` | Aynı birim/tür için tarih aralıkları çakışmaz | O dönemde uygulanacak limit belli olur. |
| `event_outbox` | UNIQUE `event_id`; gönderilmeyen satırlar için index | Tek olayı takip etmek ve bekleyen mesajları bulmak. |

- Job unique anahtarına nullable cron ID koymuyoruz; elle başlatılan hesap da aynı dönemi temsil eder.
- Yeniden hesaplama yeni duplicate job eklemek yerine mevcut işi güvenli biçimde tekrar sıraya alır.
  Aktif bir RUNNING iş eşzamanlı yeniden başlatılmaz. Sonuçlar yeniden hesaplanırken eski aşım
  artık geçerli değilse silme/geçersizleştirme davranışı F4-T5'te tamamlanır.
- Sonuçlarda `calculation_job_id` hesabın kaynağını gösterir; iş anahtarı değildir.
- `demand_kw` çekiş talebidir. Veriş talebi yeni `export_demand_kw` alanında tutulur;
  böylece tüketim ve üretim limitleri ayrı karşılaştırılır.
- Aşımda tam bir sonuç/limit çifti dolu olmalı: reaktif+reaktif limit veya talep+güç limiti.
  CHECK constraint ile iki çiftin aynı anda dolması veya ikisinin de boş olması engellenir.
- `period_start` dönem başlangıcıdır; `created_at` kaydın yazılma zamanıdır.
- `attempt_count` 0–3 arasında olur. Sahiplik token'ı eski worker'ın sonuç yazmasını engeller.
- Aktif enerji sıfırsa reaktif oran tanımsızdır; sıfıra bölünmez, oran alanları null tutulur.
  Ölçüm yoksa ise iş `NO_DATA` olur. Negatif enerjiler hesaplamaya alınmaz.

## Durumlar ve sonraki faz

| Alan | Değerler |
|---|---|
| `calculation_job.status` | `PENDING`, `RUNNING`, `COMPLETED`, `FAILED`, `NO_DATA` |
| `alarm.status` | `OPEN`, `ACKNOWLEDGED`, `CLOSED` |
| `report_request.status` | `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED` |

Yönergede geçen `IN_PROGRESS`, mevcut şemadaki `RUNNING` durumuna karşılık gelir.
İkinci bir durum adı eklemiyoruz.

F5'te alarm için `alarm_type`, `occurrence_count` ve aynı birim/türde kapatılmamış
alarmı tek tutan partial unique index gerekecek. Aynı Kafka olayının tekrarında sayacın
artmaması için tüketilen event ID de kalıcı tutulacak. Bunlar mevcut alarm migration'ında yok.
Rapor tabloları bu F4 revizyonunda değiştirilmedi.
