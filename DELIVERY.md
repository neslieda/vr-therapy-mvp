**Projeyi Teslim Alma & Kullanım Rehberi — VR Therapy MVP**

Amaç
- Bu doküman, projeyi devralacak kişiye hızlıca çalıştırma, test etme ve temel sorun giderme adımlarını sağlar.

**Neler Var**
- `docker-compose.yml` — n8n ve media-service container tanımı
- `media-service/` — Express API, LLM sahne planlama, ComfyUI entegrasyonu, FFmpeg işleme
- `frontend/` — Next.js UI (senaryo seçimi, iş takibi, indirme)
- `orchestration/` — n8n workflow (`n8n-workflow.json`) ve ComfyUI workflow örneği
- `docs/comfyui-setup.md` — ComfyUI cloud-GPU kurulum rehberi
- `.env.example` — gerekli ortam değişkenleri

**Önkoşullar**
- Docker & Docker Compose
- Node.js (frontend için) — `v18+` önerilir
- (Opsiyonel, ama gerçek panorama üretimi için) Cloud GPU erişimi (12GB+ VRAM önerilir)
- OpenAI API key (sahne planlama için)

**Hızlı Başlatma (lokal, placeholder modu ile)**
1. Repo köküne gidin:
```bash
cd /Users/eda/Projects/vr-therapy-mvp
```
2. `.env` oluşturun ve düzenleyin (gerekli anahtarları ekleyin):
```bash
cp .env.example .env
# .env içindeki OPENAI_API_KEY (varsa) ve COMFYUI_API_URL değerlerini kontrol edin
```
3. Docker ile n8n ve media-service'i başlatın:
```bash
docker compose up -d
```
4. Frontend'i çalıştırın (ayrı terminal):
```bash
cd frontend
npm install
npm run dev
```
5. Tarayıcıda `http://localhost:3000` (Next.js) veya `http://localhost:5678` (n8n) adreslerini kontrol edin.

**n8n Workflow İçe Aktarma**
- n8n'a giriş yapın: `http://localhost:5678`
- `Workflows` → `Import` → [orchestration/n8n-workflow.json](orchestration/n8n-workflow.json) dosyasını yükleyin.
- Webhook tetikleyiciyi test için kullanabilirsiniz (ör: `curl` ile POST gönderin).

**ComfyUI (Gerçek Panorama Üretimi) — Özet**
- Cloud GPU (RunPod/Vast.ai gibi) üzerinde ComfyUI kurun. Adımlar ve ipuçları için: [docs/comfyui-setup.md](docs/comfyui-setup.md).
- Çalışır durumda ComfyUI varsa `.env` içindeki `COMFYUI_API_URL`'i güncelleyin.
- ComfyUI yoksa media-service placeholder görüntü ile çalışır (test amaçlı).

**Test Etme (Uçtan Uca)**
1. Frontend üzerinden bir senaryo seçip `Video Üretimini Başlat` butonuna tıklayın.
2. Alternatif olarak n8n webhook'u doğrudan çağırın:
```bash
curl -X POST http://localhost:5678/webhook/vr-therapy \
  -H "Content-Type: application/json" \
  -d '{"scenarioId":"exam-anxiety","scenarioTitle":"Sınav Anksiyetesi"}'
```
3. `media-service` iş durumu endpoint'inden kontrol edebilirsiniz:
```bash
curl http://localhost:3001/api/jobs
curl http://localhost:3001/api/jobs/<jobId>
```
4. İş tamamlandığında frontend üzerinden veya `http://localhost:3001/videos/<jobId>.mp4` adresinden videoyu indirin.

**Önemli Ortam Değişkenleri**
- `OPENAI_API_KEY` — LLM sahne planlama için (zorunlu değil, yoksa placeholder kullanılır)
- `COMFYUI_API_URL` — ComfyUI API URL'si (Gerçek panorama üretimi için)
- `MEDIA_OUTPUT_DIR` / `PANORAMA_INPUT_DIR` — (Gerektiğinde) dosya yolları
(Tam liste: `.env.example`)

**Temel Sorun Giderme**
- `ComfyUI erişilemez` hatası: `COMFYUI_API_URL` doğru mu kontrol edin; firewall veya SSH tunnel gerekli olabilir.
- FFmpeg OOM veya uzun süre: çözünürlüğü `2048x1024` olarak güncelleyin (düşük VRAM fallback).
- n8n webhook boş yanıt: n8n workflow import edildi mi ve trigger path doğru mu?
- Hata logları: `docker compose logs -f media-service` ve `docker compose logs -f vr-therapy-n8n` komutları ile logları izleyin.

**Gizlilik / Üretim Notları**
- Terapötik içerik potansiyel olarak hassas olabilir. Eğer kullanıcı verisi (PHI) işlenecekse, ComfyUI veya cloud servisleri kullanmadan önce uygun DPA/HIPAA değerlendirmesi yapın.
- On-premise GPU varsa ComfyUI'yi iç ağda barındırmak en güvenli seçenektir.

**Teslim Kontrol Listesi**
- [ ] `.env` örneği güncellendi ve gerekli anahtarlar verildi
- [ ] ComfyUI cloud-GPU erişimi veya not olarak belirtildi
- [ ] n8n workflow import talimatı verildi
- [ ] Frontend test edildi (buton → job akışı çalışıyor)
- [ ] Önbellek / temp dosyaları için dokümantasyon sağlandı

**İrtibat / Notlar**
- Proje dosyaları: [README.md](README.md)
- Media service giriş noktası: [media-service/src/index.js](media-service/src/index.js)
- ComfyUI kurulum rehberi: [docs/comfyui-setup.md](docs/comfyui-setup.md)

Herhangi bir adımı benim yerime çalıştırmamı istersen, erişim bilgilerini (SSH, cloud konsol, API key) güvenli bir kanalla paylaş ve hangi adımı istediğini belirt.