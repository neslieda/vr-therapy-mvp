import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "",
  port: parseInt(process.env.SMTP_PORT || "587"),
  secure: false,
  auth: {
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
  },
});

export async function sendEmail(to, scenarioTitle, videoUrl) {
  if (!process.env.SMTP_HOST) {
    console.log("SMTP yapılandırılmamış, e-posta atlanıyor");
    return;
  }

  const fullUrl = `${process.env.PUBLIC_URL || "http://localhost:3001"}${videoUrl}`;

  await transporter.sendMail({
    from: process.env.SMTP_FROM || "noreply@vrtherapy.local",
    to,
    subject: `VR Terapi Videonuz Hazır: ${scenarioTitle}`,
    html: `
      <h2>VR Terapi Videonuz Hazır!</h2>
      <p>Senaryo: <strong>${scenarioTitle}</strong></p>
      <p>Videonuzu aşağıdaki linkten indirebilirsiniz:</p>
      <p><a href="${fullUrl}">Videoyu İndir</a></p>
      <p><small>Bu video VR gözlük ile 360° olarak izlenebilir.</small></p>
    `,
  });

  console.log(`E-posta gönderildi: ${to}`);
}
