import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VR Terapi — 360° Video Üretici",
  description: "AI destekli 360 derece VR terapi videoları",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="tr">
      <body>
        <header className="header">
          <div className="container">
            <h1 className="logo">🎯 VR Terapi</h1>
            <p className="tagline">AI Destekli 360° Maruz Bırakma Terapisi</p>
          </div>
        </header>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
