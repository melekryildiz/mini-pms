# D-04 — Keycloak ile giriş ve yetkili istek

Kullanıcı Keycloak ekranından giriş yapar. Web uygulaması oturumu cookie'de
tutar. Bir API isteği yapılınca access token'ı Gateway'e Web sunucusu ekler.

```mermaid
sequenceDiagram
    actor K as Kullanıcı
    participant W as Web / Auth.js
    participant A as Keycloak
    participant G as Gateway
    participant S as İlgili servis

    K->>W: Giriş yap
    W-->>K: Keycloak giriş ekranına yönlendir
    K->>A: Kullanıcı adı ve şifre
    A-->>K: Giriş başarılı, dönüş adresine kod ile yönlendir
    K->>W: Giriş kodunu callback adresine getir
    W->>A: Kodu token'larla değiştir
    A-->>W: Access token, refresh token ve ID token
    W-->>K: Şifreli, HttpOnly oturum cookie'si

    K->>W: API isteği (oturum cookie'si ile)
    W->>W: Oturumu ve access token süresini kontrol et
    opt Access token süresinin dolmasına 30 saniyeden az kaldı
        W->>A: Refresh token ile yeni token iste
        A-->>W: Yeni access token
    end
    W->>G: İsteği Bearer access token ile gönder
    opt Gerekli public key cache'te yok
        G->>A: İmza kontrolü için public key'leri al (JWKS)
        A-->>G: Public key'ler
    end
    G->>G: İmza, süre, issuer ve audience kontrolü
    G->>G: Endpoint rol istiyorsa kullanıcı rolünü kontrol et
    G->>S: İsteği ilet
    S-->>G: Sonuç
    G-->>W: API yanıtı
    W-->>K: Sonucu göster
```

Bu çizim başarılı giriş ve isteği gösteriyor. Hata olursa:

- Kullanıcı adı veya şifre yanlışsa Keycloak girişe izin vermez.
- Oturum yoksa veya token yenilenemezse Web proxy API isteğine 401 döner.
- Gateway eksik, geçersiz veya süresi dolmuş token için 401 döner.
- Token geçerli ama kullanıcının rolü yetersizse Gateway 403 döner.

Tarayıcıdaki JavaScript access token'ı doğrudan okumaz. Cookie isteğe otomatik
eklenir, Gateway'e giden Bearer token'ı Web sunucusu yerleştirir.
Normal `/api/auth/session` yanıtında access token bulunmaz.

Gateway her istekte Keycloak'a token doğrulatmaz. JWT'yi public key ile kendisi
kontrol eder; public key'ler gerektiğinde Keycloak'tan alınır ve cache'lenir.
Beklenen audience `mini-pms-api`, imza algoritması `RS256`dır.
