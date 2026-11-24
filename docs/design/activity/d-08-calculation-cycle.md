# D-08 — 15 dakikalık hesap döngüsü

F4 için planlanan akış. Scheduler ve worker henüz uygulanmadı.
İkisi calculation-service içinde çalışır; ayrı mikroservis açılmaz.
Scheduler iş oluşturur, worker hesabı yapar.

```mermaid
flowchart TD
    subgraph Scheduler[Scheduler - is uretme]
        S0([Baslangic ve periyodik kontrol]) --> S1[PostgreSQL aktif cron tanimlarini oku]
        S1 --> S2{Cron ve timezone gecerli mi?}
        S2 -->|Hayir| SBad[Hatayi logla; bu tanimi calistirma]
        S2 -->|Evet| S3[Son tamamlanan 15 dakikalik donemi ve eksik isleri bul]
        S3 --> S4{Is uretme zamani geldi mi?}
        S4 -->|Hayir| SWait[Sonraki kontrolu bekle]
        S4 -->|Evet| S5[Redis SET NX PX ile donem kilidini dene]
        S5 --> S6{Kilit alindi mi?}
        S6 -->|Hayir veya Redis hatasi| SWait
        S6 -->|Evet| S7[Unit Service RPC ile aktif ve silinmemis birimleri al]
        S7 --> S8[Transaction: her birim icin tek job ve kuyruk outbox kaydi olustur]
        S7 -. RPC hatasi .-> SRetry
        S8 --> S9{Commit basarili mi?}
        S9 -->|Hayir| SRetry[Rollback; ayni donemi sonraki kontrolde tekrar dene]
        S9 -->|Evet| S10[Mevcut isleri tekrar ekleme; unique anahtar korur]
        SRetry --> SUnlock
        S10 --> SUnlock[Lua ile yalniz sahibiysen kilidi birak]
        SUnlock --> SWait
        SWait --> S1
        SBad --> SWait
    end

    subgraph Delivery[Kalici mesaj gonderimi]
        O1[Bekleyen outbox kayitlarini al] --> O2[RabbitMQ mpms.calculation.jobs: jobId gonder]
        O2 --> O3{Broker onayi geldi mi?}
        O3 -->|Hayir| O1
        O3 -->|Evet| O4[Gonderildi olarak isaretle]
    end
    S10 --> O1

    subgraph Worker[Worker - hesaplama]
        W0([RabbitMQ mesajini al; noAck false]) --> W1[Job icin atomik claim dene; attempt ve sahiplik tokeni yaz]
        W1 --> W2{Claim sonucu?}
        W2 -->|Zaten tamamlanmis veya baska worker sahip| WAck[ACK; tekrar hesaplama]
        W2 -->|Gecici DB hatasi| WNack[NACK requeue; gecikmeli yeniden dene]
        W2 -->|Sahiplenildi| W3[Unit Service ve Neo4j ile birimi temsil eden sayaclari bul]
        W3 --> W4[PostgreSQL interval ve donem limitlerini oku]
        W4 --> W5{Gerekli olcumler tam mi?}
        W5 -->|Hayir| WNo[Transaction: NO_DATA ve sonuc olayi outbox kaydi]
        W5 -->|Evet| W6[Reaktif oranlari ve 15 dakikalik talebi hesapla]
        W6 --> W7[Gunluk ve aylik kumulatif sonuclari guncelle]
        W7 --> W8{Limit asildi mi?}
        W8 -->|Evet| W9[Transaction: sonuc upsert ve asim upsert; asim olayi outbox]
        W8 -->|Hayir| W10[Transaction: sonuc upsert]
        W9 --> W11[COMPLETED ve hesap sonucu outbox; sahipligi kontrol edip commit et]
        W10 --> W11
        W11 --> WAck
        WNo --> WAck
        W3 -. Isleme hatasi .-> WErr{Deneme sayisi 3 oldu mu?}
        W4 -. Isleme hatasi .-> WErr
        W6 -. Isleme hatasi .-> WErr
        W7 -. Isleme hatasi .-> WErr
        W9 -. Yazma hatasi .-> WErr
        W10 -. Yazma hatasi .-> WErr
        W11 -. Commit hatasi .-> WErr
        WNo -. Commit hatasi .-> WErr
        WErr -->|Hayir| WPending[Rollback; sahipligi kontrol et; PENDING ve gecikmeli retry outbox yaz]
        WPending --> WAck
        WErr -->|Evet| WFail[FAILED ve hata nedenini kalici yaz]
        WFail --> WDead[NACK requeue false; dead-letter'a gonder]
        WPending -. Retry kaydi yazilamadi .-> WNack
        WFail -. Durum yazilamadi .-> WNack
    end
    O4 --> W0

    subgraph Recovery[Kapanan worker'i kurtarma]
        R0[RUNNING ve lease suresi dolmus isleri tara] --> R1[Sahipligi atomik kaldir; kalan deneme varsa PENDING ve retry outbox yaz]
        R1 --> O1
        R0 --> R2[3 deneme tukendiyse FAILED ve dead-letter gonderimini kalici planla]
    end
```

## Kilit ve tekrar kontrolu

- Kilit anahtarı: `lock:scheduler:{periodStart}`. Değer rastgele sahiplik ID'si, TTL 60 saniye.
- Üç replika aynı UTC dönemini hesaplar. Kilit alınamazsa kontrol daha sonra tekrarlanır.
- İş üretimi uzarsa kilit yalnız sahibi tarafından yenilenir. Sahiplik kaybolursa yeni üretim durur.
- Redis kilidi bitse bile job unique anahtarı duplicate kaydı önler.
- Her aktif birim için bir `ENERGY_CALCULATION` işi vardır. Örneğin 3 birim için dönem başına
  3 iş gerekir; 3 replika çalıştığında toplam 9 olmaz.
- Güncel cron tanımları tekrar okunur; pasif veya değişen tanımın eski zamanlaması kaldırılır.
- Servis açılınca kaçan dönemler kontrol edilir. İlk başlangıç sınırı metadata/seed ile açık seçilir;
  tüm geçmişi kendiliğinden hesaplamaya başlamaz.

## Worker ve ACK

- Mesaj `{ jobId }` taşır. Prefetch ortam değişkeninden okunur.
- Atomik claim, koşullu UPDATE ile yapılır. Deneme sayısı işi sahiplenince artar; mesaj tekrarında artmaz.
- Her çalıştırmada farklı token vardır. Sonuç yazan transaction, token ve lease hâlâ geçerli mi kontrol eder.
  Lease yenilenir; sahipliği kaybeden eski worker sonuç yazamaz.
- Gerekli veri eksikse kısmi toplamdan sonuç üretmek yerine `NO_DATA` kaydedilir.
- `RUNNING`, yönergedeki `IN_PROGRESS` karşılığıdır. Mevcut durum adını koruyoruz.
- İş ve sonuç transaction'ı tamamlanmadan ACK verilmez. Retry gerekiyorsa yeni deneme kalıcı
  planlandıktan sonra eski mesaj ACK edilir. Böylece hızlı NACK döngüsü oluşturulmaz.
- Üçüncü işleme hatasında FAILED yazıldıktan sonra NACK requeue=false ile
  `mpms.calculation.jobs.dlx` dead-letter exchange'ine gider; bağlı hata kuyruğunda incelenir.
- Bozuk/olmayan job ID mesajları hesaplamaya girmeden hata nedeniyle dead-letter'a ayrılır.
- Worker kapanınca RabbitMQ mesajı yeniden teslim edebilir. Yeni worker aktif lease varken
  işi alamaz; recovery süresi dolan işi tekrar kuyruğa koyar.

## Mesaj neden outbox'a yaziliyor?

Job kaydedildikten hemen sonra uygulama kapanırsa RabbitMQ mesajı kaybolmasın diye.
`event_outbox` job ile aynı transaction'da yazılır. Gönderici, broker onayı gelene kadar dener.
Sonuç ve aşım olaylarında da aynı yol kullanılır; topic'ler `mpms.calculation.result`
ve `mpms.limit.exceeded`. Mesaj tekrar gelebilir; job ID/event ID kontrolü tekrar işlemi önler.
Tablo ve yeni alanlar D-02'de plan olarak gösterildi; henüz kodlanmadı.

## Kontrol edecegimiz senaryolar

- 3 replika ve 3 aktif birimde, her dönem için tam 3 job oluşması.
- Scheduler kayıt sırasında kapanınca eksik işlerin sonraki kontrolde tamamlanması.
- Aynı mesaj tekrar geldiğinde tamamlanmış işin yeniden hesaplanmaması.
- Worker hesap ortasında kapanınca lease sonunda işin kurtarılması.
- Üç denemeden sonra FAILED ve dead-letter; ölçüm yokken NO_DATA.
- Aynı dönemi yeniden hesaplayınca sonuç ve aşım kayıtlarının çiftlenmemesi.
