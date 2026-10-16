#!/usr/bin/env bash
# ──────────────────────────────────────────
# VR Therapy MVP — Tek Komut Kurulum & Başlatma
# ──────────────────────────────────────────
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

# ── Renkli çıktı ──
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[✗]${NC} $1"; }

echo ""
echo "🎯 VR Terapi MVP — Kurulum Başlıyor"
echo "──────────────────────────────────────"

# ── 1. .env kontrolü ──
if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    cp .env.example .env
    warn ".env dosyası oluşturuldu (.env.example kopyalandı)"
    warn "Lütfen .env dosyasındaki OPENAI_API_KEY değerini güncelleyin!"
  else
    error ".env.example bulunamadı!"
    exit 1
  fi
else
  info ".env dosyası mevcut"
fi

# ── 2. OPENAI_API_KEY kontrolü ──
source .env 2>/dev/null || true
if [ -z "${OPENAI_API_KEY:-}" ] || [ "$OPENAI_API_KEY" = "sk-your-key-here" ]; then
  warn "OPENAI_API_KEY ayarlanmamış!"
  echo "  → .env dosyasını düzenleyin: OPENAI_API_KEY=sk-..."
  echo ""
fi

# ── 3. Gerekli araçlar kontrolü ──
MISSING=()
for cmd in node npm docker; do
  if ! command -v "$cmd" &>/dev/null; then
    MISSING+=("$cmd")
  fi
done

if [ ${#MISSING[@]} -gt 0 ]; then
  error "Eksik araçlar: ${MISSING[*]}"
  echo "  → Node.js 20+: https://nodejs.org"
  echo "  → Docker: https://docs.docker.com/get-docker"
  exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
  error "Node.js 20+ gerekli (mevcut: $(node -v))"
  exit 1
fi
info "Node.js $(node -v), npm $(npm -v), Docker $(docker --version | cut -d' ' -f3)"

# ── 3.1. macOS'ta Node.js ve FFmpeg otomatik yükle (brew ile) ──
if [[ "$OSTYPE" == "darwin"* ]]; then
  BREW_MISSING=()
  if ! command -v brew &>/dev/null; then
    warn "Homebrew yüklü değil. Lütfen https://brew.sh ile yükleyin."
    exit 1
  fi
  for pkg in node ffmpeg; do
    if ! brew list "$pkg" &>/dev/null; then
      warn "$pkg yüklü değil, yükleniyor..."
      brew install "$pkg"
    fi
  done
fi

# ── 4. Data dizinleri ──
mkdir -p data/videos data/temp data/panoramas
info "Data dizinleri oluşturuldu"

# ── 5. Media Service bağımlılıkları ──
echo ""
echo "📦 Media Service bağımlılıkları kuruluyor..."
cd "$ROOT_DIR/media-service"
npm install --silent
info "Media Service bağımlılıkları kuruldu"

# ── 6. Frontend bağımlılıkları ──
echo ""
echo "📦 Frontend bağımlılıkları kuruluyor..."
cd "$ROOT_DIR/frontend"
npm install --silent
info "Frontend bağımlılıkları kuruldu"

cd "$ROOT_DIR"

# ── 7. Başlatma modu seçimi ──
echo ""
echo "──────────────────────────────────────"
echo "Başlatma seçenekleri:"
echo "  1) Sadece lokal (Docker olmadan) — Hızlı geliştirme"
echo "  2) Docker Compose ile — Tam stack (n8n + media-service)"
echo "  3) Sadece kurulum yap, başlatma"
echo ""
read -rp "Seçim [1/2/3]: " CHOICE

case "${CHOICE:-1}" in
  1)
    echo ""
    info "Lokal mod başlatılıyor..."
    echo ""
    echo "Terminal 1 — Media Service:"
    echo "  cd media-service && npm run dev"
    echo ""
    echo "Terminal 2 — Frontend:"
    echo "  cd frontend && npm run dev"
    echo ""
    echo "Şimdi otomatik başlatılıyor..."
    echo ""

    # Media service arka planda
    cd "$ROOT_DIR/media-service"
    npm run dev &
    MEDIA_PID=$!
    sleep 2
    info "Media Service başlatıldı (PID: $MEDIA_PID, port 3001)"

    # Frontend
    cd "$ROOT_DIR/frontend"
    info "Frontend başlatılıyor (port 3000)..."
    npm run dev
    ;;
  2)
    echo ""
    info "Docker Compose başlatılıyor..."
    docker compose up --build -d
    info "Servisler çalışıyor"
    echo ""
    echo "  🌐 Frontend:       http://localhost:3000"
    echo "  🔧 Media Service:  http://localhost:3001"
    echo "  ⚡ n8n:            http://localhost:5678"
    echo ""
    echo "Frontend'i ayrıca başlatın:"
    echo "  cd frontend && npm run dev"
    ;;
  3)
    echo ""
    info "Kurulum tamamlandı!"
    echo ""
    echo "Başlatmak için:"
    echo "  Lokal:   cd media-service && npm run dev"
    echo "           cd frontend && npm run dev"
    echo "  Docker:  docker compose up --build -d"
    ;;
  *)
    warn "Geçersiz seçim"
    ;;
esac

echo ""
echo "──────────────────────────────────────"
echo "📄 Dökümanlar: docs/comfyui-setup.md"
echo "🔑 ComfyUI GPU kurulumu için README'ye bakın"
echo "──────────────────────────────────────"
