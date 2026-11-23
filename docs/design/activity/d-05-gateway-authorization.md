# D-05 — Gateway istek yetkilendirme

Gateway önce token'ı, sonra endpoint'in istediği rolü kontrol eder.
Kontroller geçerse istek controller'a ulaşır.

```mermaid
flowchart TD
    Start([İstek Gateway'e geldi]) --> Public{Endpoint public mi?}

    Public -->|Evet| RoleRequired
    Public -->|Hayır| Bearer{Bearer token var ve boş değil mi?}
    Bearer -->|Hayır| Unauthorized[401 — Giriş gerekli]
    Bearer -->|Evet| Verify[Token imzasını, süresini, issuer ve audience bilgisini doğrula]
    Verify --> Valid{Token geçerli mi?}
    Valid -->|Hayır| Unauthorized
    Valid -->|Evet| User[Doğrulanmış kullanıcıyı request.user içine koy]

    User --> RoleRequired{Endpoint rol istiyor mu?}
    RoleRequired -->|Hayır| Allow[İsteği controller'a geçir]
    RoleRequired -->|Evet| RoleMatch{Kullanıcının rollerinden en az biri uygun mu?}
    RoleMatch -->|Hayır| Forbidden[403 — Yetki yetersiz]
    RoleMatch -->|Evet| Allow

    Allow --> Finish([Yetkilendirme tamamlandı])
    Unauthorized --> Rejected([İstek durduruldu])
    Forbidden --> Rejected
```

- Token kontrolünü `JwtAuthGuard`, rol kontrolünü `RolesGuard` yapıyor.
- Public endpoint'te token kontrolü atlanır. Rol kontrolü yine çalışır;
  public bir endpoint'e rol şartı eklenirse kullanıcı bilgisi olmadığı için
  istek 403 alır.
- Roller token içindeki `realm_access.roles` alanından okunur.
- Örneğin birim oluşturma için `admin` veya `operator` rollerinden biri yeterlidir.
- Token'ın imzası Keycloak public key'leriyle kontrol edilir. Key'ler gerektiğinde
  alınır ve cache'lenir; her istekte Keycloak'a doğrulama isteği gönderilmez.
- Yetkilendirmeden sonra DTO kontrolü ve endpoint'in kendi işlemleri çalışır.
  Yetkinin olması, işlemin mutlaka başarılı olacağı anlamına gelmez.

Bu çizim Gateway'e ulaşmış isteği gösterir. Web tarafındaki oturum ve token
yenileme akışı D-04'te yer alıyor.
