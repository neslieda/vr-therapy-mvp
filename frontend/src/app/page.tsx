"use client";

import { useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
const N8N_WEBHOOK = process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL || "http://localhost:5678/webhook/vr-therapy";

interface Scenario {
  id: string;
  title: string;
  description: string;
  sceneCount: number;
  difficulty: string;
}

interface Job {
  id: string;
  status: string;
  progress: number;
  videoUrl: string | null;
  error: string | null;
  scenes?: Array<{ title: string; difficulty: number }>;
}

const SCENARIOS: Scenario[] = [
  {
    id: "exam-anxiety",
    title: "Sınav Anksiyetesi",
    description:
      "Sınav ortamına kademeli maruz bırakma. Sakin bir oda ile başlayıp, adım adım sınav salonuna geçiş yaparak kaygıyı yönetmeyi öğrenin.",
    sceneCount: 4,
    difficulty: "Orta",
  },
  {
    id: "social-anxiety",
    title: "Sosyal Anksiyete",
    description:
      "Kalabalık ortamlara kademeli maruz bırakma. Sessiz bir parktan başlayarak, giderek daha kalabalık sosyal ortamlara geçiş yapın.",
    sceneCount: 4,
    difficulty: "Orta",
  },
  {
    id: "acrophobia",
    title: "Yükseklik Korkusu",
    description:
      "40 katlı bir gökdelenin çatısında kademeli maruz bırakma. Ufuk çizgisinden başlayıp, aşağı bakış ve kenar deneyimine geçiş yaparak yükseklik korkusunu yönetmeyi öğrenin.",
    sceneCount: 3,
    difficulty: "Yüksek",
  },
];

const STATUS_LABELS: Record<string, string> = {
  queued: "Sıraya alındı...",
  planning: "Sahneler planlanıyor...",
  generating_panoramas: "360° panoramalar üretiliyor...",
  creating_videos: "Sahne videoları oluşturuluyor...",
  merging: "Final video birleştiriliyor...",
  completed: "Videonuz hazır!",
  failed: "Bir hata oluştu",
};

export default function Home() {
  const [selectedScenario, setSelectedScenario] = useState<Scenario | null>(null);
  const [email, setEmail] = useState("");
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startJob() {
    if (!selectedScenario) return;
    setLoading(true);
    setError(null);
    setJob(null);

    try {
      const res = await fetch(`${API_URL}/api/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenarioId: selectedScenario.id,
          scenarioTitle: selectedScenario.title,
          userEmail: email || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "İş başlatılamadı");
      }

      const { jobId } = await res.json();
      pollJob(jobId);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  }

  async function pollJob(jobId: string) {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_URL}/api/jobs/${jobId}`);
        if (!res.ok) throw new Error("Durum sorgulanamadı");
        const data: Job = await res.json();
        setJob(data);

        if (data.status === "completed" || data.status === "failed") {
          clearInterval(interval);
          setLoading(false);
        }
      } catch {
        clearInterval(interval);
        setLoading(false);
        setError("Bağlantı hatası");
      }
    }, 3000);
  }

  function reset() {
    setSelectedScenario(null);
    setJob(null);
    setError(null);
    setLoading(false);
    setEmail("");
  }

  return (
    <div>
      {!job && !loading && (
        <>
          <h2 className="section-title">Terapi Senaryosu Seçin</h2>
          <p className="section-desc">
            VR gözlüğünüzle izleyebileceğiniz 360° terapi videosu oluşturmak için
            bir senaryo seçin.
          </p>

          <div className="scenario-grid">
            {SCENARIOS.map((s) => (
              <div
                key={s.id}
                className="scenario-card"
                onClick={() => setSelectedScenario(s)}
                style={{
                  borderColor:
                    selectedScenario?.id === s.id ? "var(--primary)" : undefined,
                }}
              >
                <h3>{s.title}</h3>
                <p>{s.description}</p>
                <span className="badge">
                  {s.sceneCount} sahne · {s.difficulty}
                </span>
              </div>
            ))}
          </div>

          {selectedScenario && (
            <div style={{ marginTop: "1.5rem" }}>
              <input
                type="email"
                className="email-input"
                placeholder="E-posta (opsiyonel — video hazır olunca bildirim)"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <div className="actions" style={{ justifyContent: "flex-start" }}>
                <button className="btn btn-primary" onClick={startJob}>
                  🎬 Video Üretimini Başlat
                </button>
              </div>
            </div>
          )}

          {error && <div className="error-msg">{error}</div>}
        </>
      )}

      {(job || loading) && (
        <div className="job-status">
          <div className="status-label">
            {job ? STATUS_LABELS[job.status] || job.status : "Başlatılıyor..."}
          </div>

          <div className="progress-bar-container">
            <div
              className="progress-bar"
              style={{ width: `${job?.progress || 5}%` }}
            />
          </div>

          <div className="status-text">
            {job?.progress || 0}% tamamlandı
          </div>

          {job?.scenes && job.scenes.length > 0 && (
            <div style={{ marginTop: "1rem", textAlign: "left" }}>
              <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                Sahneler:
              </p>
              <ul style={{ listStyle: "none", padding: 0, marginTop: "0.5rem" }}>
                {job.scenes.map((scene, i) => (
                  <li
                    key={i}
                    style={{
                      fontSize: "0.85rem",
                      padding: "0.25rem 0",
                      color: "var(--text-muted)",
                    }}
                  >
                    {i + 1}. {scene.title}{" "}
                    <span style={{ opacity: 0.5 }}>
                      (zorluk: {"⬤".repeat(scene.difficulty)}
                      {"○".repeat(5 - scene.difficulty)})
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {job?.status === "completed" && job.videoUrl && (
            <div className="actions">
              <a
                href={`${API_URL}${job.videoUrl}`}
                download
                className="btn btn-success"
              >
                ⬇ Videoyu İndir
              </a>
              <button className="btn btn-primary" onClick={reset}>
                Yeni Senaryo
              </button>
            </div>
          )}

          {job?.status === "failed" && (
            <div>
              <div className="error-msg" style={{ marginBottom: "1rem" }}>
                {job.error || "Bilinmeyen hata"}
              </div>
              <button className="btn btn-primary" onClick={reset}>
                Tekrar Dene
              </button>
            </div>
          )}

          {loading && job?.status !== "completed" && job?.status !== "failed" && (
            <p
              style={{
                fontSize: "0.8rem",
                color: "var(--text-muted)",
                marginTop: "1rem",
              }}
            >
              Bu işlem birkaç dakika sürebilir. Sayfa açık kalmalıdır.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
