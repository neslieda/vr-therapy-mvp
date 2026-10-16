# n8n Workflow — VR Therapy Pipeline

## Kurulum

1. n8n dashboard'a gir: `http://localhost:5678`
2. Sol menüden **Workflows** → **Import from File**
3. `n8n-workflow.json` dosyasını yükle
4. Webhook URL otomatik oluşacak: `http://localhost:5678/webhook/vr-therapy`

## Akış

```
POST /webhook/vr-therapy
  → Validate Input (scenarioId + scenarioTitle kontrol)
  → Start Media Job (media-service'e HTTP POST)
  → Polling Loop (5sn aralıklarla durum kontrolü, max 10dk)
  → Tamamlandı → JSON yanıt döndür
  → Başarısız → Hata fırlat
```

## Test

```bash
curl -X POST http://localhost:5678/webhook/vr-therapy \
  -H "Content-Type: application/json" \
  -d '{"scenarioId": "exam-anxiety", "scenarioTitle": "Sınav Anksiyetesi"}'
```

## Notlar

- Webhook Trigger, frontend'den gelen POST isteklerini karşılar
- Media Service (port 3001) ayrı container'da çalışır
- Docker Compose network sayesinde `media-service:3001` ile erişilir
- Polling max 120 deneme × 5sn = 10dk timeout
