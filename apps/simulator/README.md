# Simulator — F3-T1

Unit Service'ten RabbitMQ RPC ile aktif sayaçları alır. Her tamamlanan
15 dakikalık dönem için `interval` tablosunun enerji alanlarına uygun mesaj
üretir. Kafka topic: `mpms.measurement.raw`, key: `deviceId`.

## Çalıştırma

Proje kökünde, Unit Service ve broker'lar çalışırken:

```sh
pnpm exec nx build simulator
node --env-file=.env apps/simulator/dist/main.js normal
```

`normal`, `high-inductive`, `missing`, `corrupt`, `duplicate` canlı modlarıdır.
Başlangıçta son tamamlanan dönemi gönderir, sonraki çeyrek saat sınırlarını
bekler. Ctrl+C veya SIGTERM bağlantıları kapatır. Yeniden başlatmada kalıcı
checkpoint kullanılmaz; eski boşluklar backfill ile doldurulur.

```sh
node --env-file=.env apps/simulator/dist/main.js backfill \
  --from 2026-01-01T10:00:00+03:00 \
  --to 2026-01-01T11:00:00+03:00
```

Backfill başlangıç dahil, bitiş hariçtir; tarihlerin açık saat dilimi içermesi
ve 15 dakika sınırına hizalanması gerekir. İki sayaç için bu örnek 8 mesajdır.
Mevcut aktif sayaç listesi kullanılır; geçmiş cihaz envanteri modellenmez.

## Modlar ve profiller

- `normal`: gece tabanı ve gündüz/akşam tepeleri olan tüketim eğrisi.
- `high-inductive`: endüktif/aktif enerji oranı yaklaşık %55–70.
- `missing`: sayaç/dönem başına %10 olasılıkla mesaj atlanır; küçük örneklemde
  hiç atlama olmayabilir.
- `corrupt`: bilerek negatif aktif çekiş enerjisi, geçerli JSON içinde.
- `duplicate`: aynı eventId ve aynı payload iki kez gönderilir.
- `backfill`: geçmiş dönemler için normal profil, beklemeden üretim.

Varsayılan profil `consumer`dır. Cihazın mevcut metadata alanında
`"simulationProfile": "solar"` seçilirse Unit Service RPC özeti bu profili
aktarır. Gündüz üretimi tüketimi aşarsa `activeExportKwh` pozitif olur;
gece üretim sıfırdır. Profiller sentetiktir, saha verisinden kalibre edilmez.
Sayaç kapasitesi kimlikten türetilir. Mevcut cihaz kayıtları otomatik değiştirilmez.

## Test etme

Kafka ve RabbitMQ açmadan kodu test etmek için:

```sh
node apps/simulator/scripts/verify.cjs
```

Unit Service, Kafka ve RabbitMQ çalışırken mesaj gönderimini test etmek için:

```sh
node --env-file=.env apps/simulator/scripts/verify.cjs --integration
```

İkinci komut Kafka'ya test mesajları gönderip geri okur. Hatalı ve tekrar eden
mesajlar da gönderir. Veritabanına kayıt yapmaz.

Yaptığımız testlerde:

- Unit Service'ten 2 aktif sayaç geldi.
- Kafka'ya giden 20 test mesajını geri okuyabildik.
- Sayaç `3` partition `2`ye, sayaç `4` partition `1`e gitti.
  Aynı sayacın mesajları aynı partition'da kaldı.
- Duplicate aynı mesajı iki kez gönderdi; corrupt negatif enerji üretti.
- Missing modunda hem mesaj atlama hem gönderme durumunu kontrol ettik.
- Bir saatlik backfill, iki sayaç için 8 mesaj üretti.
- Günlük tüketim eğrisini ve gündüz güneş üretimini kontrol ettik.
- Testte saati ilerleterek yeni dönemlerin gönderildiğini kontrol ettik;
  gerçek 15 dakika beklemedik.
- Normal ve backfill çalışırken Ctrl+C sinyaliyle bağlantılar düzgün kapandı.

Mesajları görmek için http://localhost:8080 adresini aç:
Topics → mpms.measurement.raw → Messages.
Burada mesajın key'ini, partition'ını ve içeriğini görebilirsin.
