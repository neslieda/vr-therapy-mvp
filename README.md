# AI Destekli 360 VR Terapi Video Pipeline (MVP)

Kullanıcıların VR gözlük ile izleyebileceği kısa 360° terapi videoları üreten uçtan uca pipeline.

## Mimari

```
Kullanıcı → Next.js UI → Media Service API (port 3001)
                              ↓
                     LLM Sahne Planlama (GPT-4o-mini)
                              ↓
                     ComfyUI Panorama Üretimi (Cloud GPU)
                              ↓
                     FFmpeg Video İşleme
                              ↓
                     Final 360° VR Video → Kullanıcıya Teslim
```

## Bileşenler

| Klasör | Açıklama |
|--------|----------|
| `frontend/` | Next.js/React — senaryo seçimi, iş durumu, video indirme |
| `media-service/` | Express API + FFmpeg video işleme, panorama entegrasyonu, job yönetimi |
| `orchestration/` | n8n workflow export ve ComfyUI workflow JSON |
| `data/` | Çalışma zamanı verileri (videos, temp, panoramas) |
| `docs/` | ComfyUI cloud GPU kurulum rehberi |

## Hızlı Başlangıç (Tek Komut)

```bash
# 1. Repo'ya gir
cd /Users/eda/Projects/vr-therapy-mvp

# 2. Kurulum ve başlatma scripti
./setup.sh
```

Script otomatik olarak:
- `.env` dosyasını oluşturur
- Bağımlılıkları kurar
- Gerekli dizinleri yaratır
- Lokalde veya Docker ile başlatır

## Manuel Başlatma

### Ön Koşullar
- **Node.js 20+** ve npm
- **FFmpeg** (macOS: `brew install ffmpeg`)
- **Docker & Docker Compose** (opsiyonel, n8n için)
- **OpenAI API key** (sahne planlama için)
- **Cloud GPU** (ComfyUI panorama üretimi için — yoksa placeholder ile çalışır)

### Adım 1: Ortam Değişkenleri
```bash
cp .env.example .env
# .env dosyasını düzenle — en az OPENAI_API_KEY gerekli
```

### Adım 2: Media Service
```bash
cd media-service
npm install
npm run dev    # http://localhost:3001
```

### Adım 3: Frontend
```bash
cd frontend
npm install
npm run dev    # http://localhost:3000
```

### Adım 4 (Opsiyonel): Docker Compose (n8n dahil)
```bash
docker compose up -d
# n8n: http://localhost:5678 (admin / change-me)
```

## Geliştirme Modu

ComfyUI cloud GPU olmadan geliştirme yapabilirsiniz:
- Media service, ComfyUI erişilemezse **otomatik olarak placeholder panorama** üretir
- Bu sayede pipeline uçtan uca test edilebilir (renkli kutular video olarak üretilir)
- Gerçek panorama için `.env` dosyasında `COMFYUI_API_URL` ayarlayın

## Cloud GPU Kurulumu (ComfyUI)

Detaylı rehber: `docs/comfyui-setup.md`

### Özet:
1. **RunPod** veya **Vast.ai** üzerinden GPU kiralayın
2. ComfyUI'yi kurun, SD 1.5 modelini indirin
3. `COMFYUI_API_URL=http://<GPU_IP>:8188` olarak `.env`'e ekleyin
4. Pipeline otomatik gerçek panorama üretmeye başlar

### Önerilen GPU:
| GPU | VRAM | Platform | Maliyet | Not |
|-----|------|----------|---------|-----|
| **RTX 4090** | 24GB | RunPod | ~$0.44/saat | En hızlı, tavsiye edilen |
| **RTX 3090** | 24GB | Vast.ai | ~$0.25/saat | İyi fiyat/performans |
| **RTX A4000** | 16GB | RunPod | ~$0.28/saat | Yeterli, uygun fiyat |

## Terapi Senaryoları (MVP)

1. **Sınav Anksiyetesi** — Sınav salonuna kademeli maruz bırakma (4 sahne, SD 1.5)
2. **Sosyal Anksiyete** — Kalabalık ortamlara kademeli maruz bırakma (4 sahne, SD 1.5)
3. **Yükseklik Korkusu (Akrofobi)** — Gökdelen çatısında kademeli maruz bırakma (3 sahne, **SDXL + ControlNet Depth + SVD**)

> **Akrofobi senaryosu** ileri düzey pipeline kullanır: SDXL ile ultra-gerçekçi görüntü üretimi,
> ControlNet Depth ile mekansal doğruluk, ve Stable Video Diffusion ile doğal kamera sallantısı.
> Detaylı kurulum: `docs/sdxl-acrophobia-pipeline.md`

## API Endpoints

| Method | Endpoint | Açıklama |
|--------|----------|----------|
| `POST` | `/api/jobs` | Yeni video üretim işi başlat |
| `GET` | `/api/jobs/:id` | İş durumu sorgula |
| `GET` | `/api/jobs/:id/download` | Tamamlanan videoyu indir |
| `GET` | `/api/jobs` | Tüm işleri listele |
| `GET` | `/health` | Servis sağlık kontrolü |
