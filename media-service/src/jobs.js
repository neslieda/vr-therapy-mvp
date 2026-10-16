// ─── In-memory job store ───
// MVP için yeterli; production'da Redis veya DB'ye taşınmalı.

export const jobs = new Map();

export function updateJob(jobId, updates) {
  const job = jobs.get(jobId);
  if (!job) return;
  Object.assign(job, updates, { updatedAt: new Date().toISOString() });
  jobs.set(jobId, job);
}
