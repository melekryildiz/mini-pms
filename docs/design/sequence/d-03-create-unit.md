# D-03 — Birim oluşturma

Kullanıcı formu doldurur. İstek Gateway üzerinden Unit Service'e gider.
Birim ve işlem logu birlikte kaydedilir, ardından Neo4j güncellenir.

```mermaid
sequenceDiagram
    actor K as Kullanıcı
    participant W as Web
    participant G as Gateway
    participant R as RabbitMQ
    participant U as Unit Service
    participant P as PostgreSQL
    participant N as Neo4j

    K->>W: Birim formunu gönder
    W->>G: Oturumu kontrol et, isteği token ile ilet
    G->>G: Token, rol ve form bilgilerini kontrol et
    G->>R: unit.create isteği
    R->>U: İsteği ilet
    U->>P: Üst birim gerekiyorsa getir
    P-->>U: Üst birim bilgisi
    U->>U: Birim türü ve üst birim kurallarını kontrol et
    U->>P: Birimi ve CREATE logunu aynı işlemde kaydet
    P-->>U: Kayıt tamamlandı (commit)
    U->>N: Birimi ve varsa üst birim bağlantısını güncelle
    N-->>U: Güncellendi
    U-->>R: Oluşturulan birim
    R-->>G: Sonucu ilet
    G-->>W: 201 — Birim oluşturuldu
    W-->>K: Sonucu göster
```

Bu çizim başarılı işlemi gösteriyor. Hata olursa:

- Giriş veya yetki yoksa istek reddedilir.
- Üst birim uygun değilse birim oluşturulmaz.
- Birim ya da log kaydedilemezse ikisi de geri alınır.
- Neo4j güncellenemezse hata döner, ama PostgreSQL kaydı kalır.

Üst birim kuralı: trafo merkezi köktür; transformatör trafo merkezine,
fider ise transformatöre bağlanır. Seçilen üst birim aktif olmalıdır.
