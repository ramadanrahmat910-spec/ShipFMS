// lib/simulationClock.js — ShipCII Dashboard
// ============================================
// Jam virtual untuk mode "LIVE (Simulasi Data 2025)".
//
// Konsep: waktu nyata dipetakan ke tahun 2025 (anchored),
// lalu bisa dipercepat dengan speed multiplier. Semua komponen
// (peta, metric, grafik) membaca waktu dari jam virtual ini,
// bukan dari Date.now() langsung.

export const SIM_YEAR = 2025

export const SIM_START_MS = new Date(SIM_YEAR, 0, 1, 0, 0, 0).getTime()
export const SIM_END_MS   = new Date(SIM_YEAR, 11, 30, 23, 59, 59).getTime()
// catatan: data AIS Anda berakhir 30 Des 2025, bukan 31 Des.

/**
 * Petakan waktu nyata sekarang ke tanggal & jam yang sama di 2025.
 * Contoh: 14 Jul 2026 15:00 → 14 Jul 2025 15:00.
 * 29 Feb dipetakan ke 28 Feb (2025 bukan tahun kabisat).
 */
export function anchoredVirtualNow(realMs = Date.now()) {
  const d = new Date(realMs)
  let month = d.getMonth()
  let day = d.getDate()
  if (month === 1 && day === 29) day = 28
  const v = new Date(
    SIM_YEAR, month, day,
    d.getHours(), d.getMinutes(), d.getSeconds()
  ).getTime()
  return clampToSimYear(v)
}

/** Jaga waktu virtual tetap di dalam rentang data 2025 (loop). */
export function clampToSimYear(vMs) {
  if (vMs > SIM_END_MS)   return SIM_START_MS + (vMs - SIM_END_MS) % (SIM_END_MS - SIM_START_MS)
  if (vMs < SIM_START_MS) return SIM_START_MS
  return vMs
}

/** Format YYYY-MM-DD (lokal) dari ms virtual — untuk query cii_daily. */
export function toDateStr(vMs) {
  const d = new Date(vMs)
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Format ISO UTC dari ms virtual — untuk query ais_tracking.base_datetime. */
export function toISO(vMs) {
  return new Date(vMs).toISOString()
}

/** Fraksi hari yang sudah berlalu pada waktu virtual (0..1). Untuk interpolasi metric harian. */
export function fractionOfDay(vMs) {
  const d = new Date(vMs)
  return (d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()) / 86400
}

/** Pilihan kecepatan yang ditawarkan di UI. */
export const SPEED_OPTIONS = [
  { value: 1,    label: '1×'  },   // waktu nyata
  { value: 60,   label: '60×' },   // 1 menit nyata = 1 jam virtual
  { value: 600,  label: '600×'},   // 1 menit nyata = 10 jam virtual
  { value: 3600, label: '1 dtk = 1 jam' },
]