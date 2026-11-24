# D-09 — Hesap, limit asimi ve alarm

F4 için planlanan akış. Alarm ve WebSocket bölümü F5 planıdır;
henüz uygulanmış gibi düşünülmemeli. Scheduler ve worker calculation-service içindedir.

```mermaid
sequenceDiagram
    participant S as Scheduler
    participant R as Redis
    participant U as Unit Service
    participant N as Neo4j
    participant DB as PostgreSQL
    participant O as Outbox gondericisi
    participant Q as RabbitMQ
    participant W as Calculation worker
    participant K as Kafka
    participant A as Alarm Service - F5
    participant G as Gateway - F5
    actor B as Web - F5

    S->>DB: Aktif cron tanimlarini ve zamani gelen donemi oku
    S->>R: SET lock:scheduler:periodStart owner NX PX 60000
    alt Kilit alinamadi veya Redis hatasi
        S->>S: Bu denemede is uretme; sonraki kontrolde tekrar dene
    else Kilit alindi
        S->>U: RPC ile aktif ve silinmemis birimleri iste
        U-->>S: Birim listesi
        S->>DB: Transaction: her birim/donem icin tek job ve outbox yaz
        DB-->>S: Commit; unique anahtar duplicate isi engeller
        S->>R: Lua: sahiplik degeri ayniysa kilidi sil
        O->>DB: Bekleyen kuyruk mesajlarini oku
        O->>Q: mpms.calculation.jobs - jobId
        Q-->>O: Publisher confirm
        O->>DB: Mesaji gonderildi olarak isaretle
    end

    Q->>W: Isi teslim et; henuz ACK yok
    W->>DB: Atomik claim: PENDING ise RUNNING; token, lease ve deneme sayisi
    alt Is bitmis veya baska worker sahip
        DB-->>W: Claim basarisiz
        W->>Q: ACK; tekrar hesaplama
    else Is sahiplenildi
        W->>U: Birimi temsil eden hesap sayaclarini iste
        U->>N: Kendi MAIN veya uygun alt trafolarin MAIN sayaclarini bul
        N-->>U: Cift sayilmayan sayac listesi
        U-->>W: Sayac kimlikleri
        W->>DB: interval olcumlerini ve donemde gecerli limitleri oku
        alt Gerekli olcumler eksik
            W->>DB: Transaction: sahiplik kontrolu, NO_DATA ve sonuc outbox
        else Olcumler mevcut
            W->>W: Reaktif oranlar; 15 dk talep; gunluk ve aylik kumulatif hesap
            W->>DB: Transaction: sahiplik kontrolu ve sonuclari upsert et
            opt Limit asimi var
                W->>DB: Asimi upsert et; yeni asim olayi icin outbox yaz
            end
            W->>DB: COMPLETED ve hesap sonucu outbox; commit
        end
        W->>Q: Kalici sonuc kaydindan sonra ACK
    end

    loop Bekleyen sonuc ve asim olaylari
        O->>DB: Gonderilmemis olaylari oku
        O->>K: mpms.calculation.result - key unitId
        opt Yeni limit asimi olayi var
            O->>K: mpms.limit.exceeded - key unitId
        end
        K-->>O: Broker onayi
        O->>DB: Gonderildi olarak isaretle
    end

    Note over A,B: Asagisi F5 kapsamidir
    K->>A: mpms.limit.exceeded
    A->>DB: Transaction: event ID daha once islendi mi?
    alt Ayni olay tekrar geldi
        A->>A: Yeni alarm acma; sayaci artirma
    else Yeni olay
        A->>DB: Ayni birim ve tip icin kapatilmamis alarmi bul
        alt Acik veya onaylanmis alarm var
            A->>DB: last_seen_at ve occurrence_count guncelle
        else Acik alarm yok
            A->>DB: OPEN alarm olustur
        end
        A->>DB: Islenen event ID ve alarm olayi outbox; commit
    end
    A->>K: Kalici islemden sonra consumer offset commit
    O->>K: Alarm outbox: mpms.alarm.event - key unitId
    K->>G: Alarm olayini tuket
    G->>R: ws:alarm pub/sub ile gateway replikalarina dagit
    R-->>G: Birime yetkili baglantilar icin olay
    G-->>B: Yetkili birim odasina WebSocket bildirimi
```

## Hesap kurallari

- İşin dönemi `[period_start, period_start + 15 dakika)` aralığıdır. Henüz bitmemiş dönem hesaplanmaz.
- Trafo için kendi MAIN sayacı kullanılır. TM için alt trafoların MAIN sayaçları toplanır.
  Trafo MAIN ile alt fiderler birlikte toplanmaz. Sayaç seçimi, anlık izleme için tüm
  sayaçları döndüren uçtan farklı bir iş kuralıdır; Unit Service'in graf erişimi kullanılır.
- Endüktif oran: toplam endüktif / toplam aktif çekiş × 100. Kapasitif oran aynı şekilde hesaplanır.
- Günlük/aylık oran, dönem oranlarının ortalaması değildir; o tarih aralığındaki enerji toplamlarının oranıdır.
- Aktif çekiş sıfırsa oran null olur; sonsuz veya 0 diye yanlış sonuç yazılmaz.
- 15 dakikalık çekiş talebi aktif çekiş kWh × 4, veriş talebi aktif veriş kWh × 4 olur.
  Tüketim ve üretim limitleri ayrı karşılaştırılır. Günlük/aylık talep sonucu ilgili aralıktaki tepe taleptir.
- Eksik veri NO_DATA; negatif veri işleme hatasıdır. Bu iki durum birbirine karıştırılmaz.
- Limit değerleri koda yazılmaz. Ölçüm dönemi için geçerli konfigürasyon okunur.
- Aynı birim/dönem/tür için sonuçlar upsert edilir. Aynı aşım tekrar hesaplanınca ikinci
  satır ve yeni alarm olayı üretilmez. Değer düzeltmeleri F4-T5/F5 olay sözleşmesinde ayrıca ele alınır.
- NO_DATA dahil her tamamlanan çalıştırma için durum içeren `mpms.calculation.result` olayı planlanır.
  Son denemede FAILED olan işin sonucu da kalıcı olayla bildirilir; ara retry hataları başarı sonucu değildir.

## Hata olursa

- Scheduler transaction'ı başarısızsa rollback olur; aynı dönem yeniden denenir.
- Commit başarılı, RabbitMQ kapalıysa job kaybolmaz; outbox gönderimi bekler.
- Worker geçici hata alırsa rollback yapar; en fazla 3 deneme için kalıcı retry planlanır.
  Son denemede FAILED olur ve mesaj dead-letter'a ayrılır. Ayrıntılı dallar D-08'de.
- Worker kapanırsa lease süresi dolan RUNNING işler geri alınır. Eski worker token'ı ile
  sonuç yazılamaz. Broker yeniden teslimi tek başına sahiplenme izni değildir.
- Sonuç commit edilip ACK kaybolursa aynı job tekrar gelir; terminal durum kontrolü tekrar hesabı engeller.
- Kafka onayından sonra outbox işaretlemesi başarısız olursa aynı event ID tekrar gönderilir.
  Alarm tüketicisinin event ID kontrolü bu yüzden gerekir; yalnızca açık alarm kontrolü yeterli değildir.

Alanlar, unique anahtarlar ve henüz eklenmemiş tablolar D-02'de gösterildi.
Bu dokümanlar tasarımdır; F4/F5 migration ve servislerinin tamamlandığı anlamına gelmez.
