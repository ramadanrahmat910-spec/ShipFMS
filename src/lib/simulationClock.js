// lib/simulationClock.js — ShipCII Dashboard
// ============================================
// Jam virtual untuk mode "LIVE (Simulasi Data 2025)".
//
// Konsep: waktu nyata dipetakan ke tahun 2025 (anchored),
// lalu bisa dipercepat dengan speed multiplier. Semua komponen
// (peta, metric, grafik) membaca waktu dari jam virtual ini,
// bukan dari Date.now() langsung.

export const SIM_YEAR = 2025

// ─── DISPLAY-ONLY YEAR OFFSET (PER KAPAL) ─────────────────────
// Data backbone tetap 2025 (SIM_YEAR) — SEMUA query & kalkulasi CII
// WAJIB pakai 2025 karena datanya memang di situ, dan REDUCTION_FACTORS
// beda antar tahun (2025=0.09, 2026=0.11) sehingga menggeser tahun di
// logika akan mengubah grade CII secara keliru.
//
// Sesuai instruksi: HANYA kapal "balongan" yang tanggalnya digeser +1
// tahun di UI (2025 → 2026), supaya webpage terlihat current date 2026
// meski backbone-nya 2025. Klasogun TIDAK digeser — nanti tanggalnya
// datang asli dari streaming AIS ITS (yang memang 2026), jadi offset 0.
// Aturan: "2025 untuk query & kalkulasi, 2026 hanya untuk tampilan Balongan."
export const DISPLAY_YEAR_OFFSET_BY_SHIP = {
  balongan: 1,
  klasogun: 0,
}

/** Offset tahun tampilan untuk sebuah kapal (default 0 = tidak digeser). */
export function displayOffsetFor(shipKey) {
  return DISPLAY_YEAR_OFFSET_BY_SHIP[shipKey] ?? 0
}

/**
 * Geser sebuah waktu virtual (ms) ke tahun tampilan (+offset kapal), TANPA
 * mengubah tanggal/jam. Dipakai HANYA untuk memformat string yang
 * ditampilkan ke pengguna — JANGAN dipakai untuk query database.
 */
export function toDisplayMs(vMs, shipKey) {
  const offset = displayOffsetFor(shipKey)
  if (offset === 0) return vMs
  const d = new Date(vMs)
  return new Date(
    d.getFullYear() + offset, d.getMonth(), d.getDate(),
    d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds()
  ).getTime()
}

/**
 * Format tanggal virtual untuk DITAMPILKAN (sudah +offset kapal).
 */
export function formatDisplayDate(vMs, shipKey, opts = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }, locale = 'id-ID') {
  return new Date(toDisplayMs(vMs, shipKey)).toLocaleDateString(locale, opts)
}

/**
 * Label tahun tampilan untuk sebuah kapal (mis. balongan → 2026,
 * klasogun → 2025). Untuk header/badge.
 */
export function displayYear(shipKey, backboneYear = SIM_YEAR) {
  return backboneYear + displayOffsetFor(shipKey)
}

/**
 * Format tanggal DARI DATABASE (string 'YYYY-MM-DD' / Date) untuk
 * DITAMPILKAN dengan tahun +offset kapal. Backbone DB tetap 2025.
 * '—' jika input kosong/invalid.
 */
export function formatDbDateDisplay(dbDate, shipKey, opts = { day: 'numeric', month: 'short', year: 'numeric' }, locale = 'id-ID') {
  if (dbDate == null || dbDate === '') return '—'
  const parsed = new Date(dbDate)
  if (isNaN(parsed.getTime())) return '—'
  return new Date(toDisplayMs(parsed.getTime(), shipKey)).toLocaleDateString(locale, opts)
}

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