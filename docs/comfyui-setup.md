# ComfyUI Panorama Kurulum Rehberi (Cloud GPU)

Bu rehber, RunPod veya Vast.ai üzerinde ComfyUI ile 360° panorama üretimi kurmayı açıklar.

## 1. Cloud GPU Seçimi

| Servis | Önerilen GPU | VRAM | Yaklaşık Maliyet |
|--------|-------------|------|-----------------|
| **RunPod** | RTX 4090 | 24GB | ~$0.44/saat |
| **Vast.ai** | RTX 3090 | 24GB | ~$0.25/saat |
| **RunPod** | RTX 4070 Ti | 12GB | ~$0.25/saat (MVP minimum) |

## 2. RunPod Kurulumu

### Template ile hızlı başlangıç:
```bash
# RunPod dashboard → Pods → Deploy
# Template: "RunPod ComfyUI" (community template)
# GPU: RTX 4090 veya RTX 3090
# Disk: 50GB
```

### Manuel kurulum (SSH ile):
```bash
# ComfyUI kur
cd /workspace
git clone https://github.com/comfyanonymous/ComfyUI.git
cd ComfyUI
pip install -r requirements.txt

# Stable Diffusion modeli indir
cd models/checkpoints
wget https://huggingface.co/runwayml/stable-diffusion-v1-5/resolve/main/v1-5-pruned-emaonly.safetensors \
  -O sd_v15.safetensors

# Panorama custom node kur
cd /workspace/ComfyUI/custom_nodes
git clone https://github.com/jianqi-jin/PanoramicStableDiffusion.git
# veya alternatif:
# git clone https://github.com/Kosinkadink/ComfyUI-Advanced-Stitching.git

# Bağımlılıkları kur
cd PanoramicStableDiffusion
pip install -r requirements.txt

# ComfyUI'yi başlat
cd /workspace/ComfyUI
python main.py --listen 0.0.0.0 --port 8188
```

## 3. Panorama Workflow Yapılandırması

ComfyUI çalıştıktan sonra:

1. Tarayıcıdan `http://<GPU_IP>:8188` adresine gir
2. `comfyui-panorama-workflow.json` dosyasını yükle
3. Prompt ile test et: `"equirectangular 360 panorama, peaceful forest, warm sunlight, photorealistic, 8k"`

### Önemli ayarlar:
- **Çözünürlük:** 4096x2048 (2:1 equirectangular)
- **Fallback:** 2048x1024 (düşük VRAM için)
- **Steps:** 30 (kalite/hız dengesi)
- **CFG:** 7.5
- **Sampler:** euler_ancestral

## 4. n8n ile Bağlantı

ComfyUI cloud'da çalışırken, `.env` dosyasında şunu güncelle:

```env
COMFYUI_API_URL=http://<CLOUD_GPU_IP>:8188
```

Docker Compose'da media-service'in bu URL'e erişebildiğinden emin ol.

### Güvenlik notu:
ComfyUI API'si varsayılan olarak herkesin erişimine açıktır.
Cloud GPU kullanıyorsan, RunPod proxy veya SSH tunnel üzerinden eriş:

```bash
# SSH tunnel (önerilir)
ssh -L 8188:localhost:8188 root@<CLOUD_GPU_IP>
```

## 5. Test

```bash
# Sağlık kontrolü
curl http://localhost:8188/system_stats

# Manuel panorama üretimi
curl -X POST http://localhost:8188/prompt \
  -H "Content-Type: application/json" \
  -d @comfyui-panorama-workflow.json
```

## 6. Sorun Giderme

| Sorun | Çözüm |
|-------|-------|
| CUDA out of memory | Çözünürlüğü 2048x1024'e düşür |
| Panorama seam (dikiş izi) | PanoramicStableDiffusion overlap ayarını artır |
| Yavaş üretim (>120sn) | Steps'i 20'ye düşür, CFG'yi 6'ya indir |
| ComfyUI API yanıt vermiyor | `python main.py --listen 0.0.0.0` ile yeniden başlat |
