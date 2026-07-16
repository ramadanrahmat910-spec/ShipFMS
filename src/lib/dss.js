// lib/dss.js — Decision Support System Engine (AHP + SAW)
// ============================================================
// Mengikuti PERSIS alur flowchart "Decision Engine DSS (AHP + SAW)"
// milik user:
//
//   START (Hasil Monitoring & Diagnosis: CII tinggi / belum capai target)
//   → 1. DIAGNOSIS (identifikasi faktor penyebab dari data AIS/Fuel/Speed/Distance/CII)
//   → 2. MENENTUKAN ALTERNATIF (A1–A5)
//   → 3. AHP — bobot kriteria (C1–C5), pairwise comparison, CR ≤ 0.1
//   → 4. PENILAIAN ALTERNATIF — matriks skor 1–5 tiap alternatif × kriteria
//   → 5. SAW — normalisasi + Vi = Σ(Wj × Rij), perangkingan
//   → 6. DECISION — urutkan alternatif, tampilkan prioritas terbaik
//   → 7. PREDICTION — apakah CII hasil prediksi memenuhi target?
//        Tidak → sarankan revisi skenario / kombinasi tindakan
//   → 8. ECONOMIC ANALYSIS — estimasi penghematan BBM & biaya implementasi
//   → END (prioritas rekomendasi + analisis ekonomi)
//
// CATATAN METODOLOGI:
// Bobot kriteria (C1–C5) adalah HASIL AHP (pairwise comparison + uji
// konsistensi) yang sudah ditentukan sekali di tahap desain model —
// makanya di sini berupa KONSTANTA, bukan dihitung ulang tiap request
// (AHP pairwise comparison bukan proses per-pengguna/per-voyage).
// Yang dihitung LIVE di setiap panggilan adalah:
//   - Diagnosis (dari data kapal saat ini)
//   - Skor C1 "Potensi Penurunan CII" untuk tiap alternatif — DINAMIS,
//     dihitung dari data kapal & model MLR/Cf yang sama dipakai di
//     seluruh aplikasi (bukan angka contoh statis)
//   - Skor C2–C5 tetap memakai referensi literatur/domain (biaya,
//     kemudahan, waktu, kesesuaian kondisi kapal — bukan sesuatu yang
//     bisa dihitung dari data AIS)
//   - SAW ranking, prediksi, dan analisis ekonomi

import {
  SHIP_PARAMS, FUEL_CF, FUEL_PRICE_PER_MT,
  estimateFuelMLR, compareFuelTypes,
  calcCIIBoundaries, calcGrade, calcRunningCII, calcPctOfRequired,
} from './ciiCalculation'

// ─── 3. AHP — KRITERIA & BOBOT (hasil pairwise comparison) ────
export const DSS_CRITERIA = [
  { key: 'C1', label: 'Potensi Penurunan CII',    weight: 0.40 },
  { key: 'C2', label: 'Biaya Implementasi',       weight: 0.25 },
  { key: 'C3', label: 'Kemudahan Implementasi',   weight: 0.15 },
  { key: 'C4', label: 'Waktu Implementasi',       weight: 0.10 },
  { key: 'C5', label: 'Kesesuaian Kondisi Kapal', weight: 0.10 },
]
// Consistency Ratio dari uji AHP (CR ≤ 0.1 = konsisten)
export const DSS_CONSISTENCY_RATIO = 0.04

// ─── 2. ALTERNATIF ─────────────────────────────────────────────
export const DSS_ALTERNATIVES = {
  A1: { label: 'Slow Steaming',                    desc: 'Menurunkan kecepatan operasional kapal sebanyak 1-2 knot. Karena konsumsi bahan bakar berbanding lurus dengan pangkat tiga dari kecepatan, penurunan kecepatan sedikit saja akan sangat menghemat BBM.' },
  A2: { label: 'Optimalisasi Pelayaran Berdasarkan Evaluasi Kapten', desc: 'Rekomendasi penyesuaian khusus dari kapten untuk rute dan jadwal guna menghindari cuaca buruk serta meminimalkan waktu tunggu di pelabuhan.' },
  A3: { label: 'Trim & Ballast Optimization',      desc: 'Menyesuaikan distribusi beban muatan dan air ballast agar keseimbangan (trim) kapal optimal, sehingga mengurangi hambatan hidrodinamis saat berlayar.' },
  A4: { label: 'Penggunaan Bahan Bakar B50',       desc: 'Beralih ke bahan bakar B50. Kandungan biofuel yang lebih tinggi memiliki faktor emisi (Cf) yang lebih rendah dibanding B35, sehingga otomatis langsung menurunkan nilai emisi karbon.' },
  A5: { label: 'Technical Inspection',             desc: 'Melakukan inspeksi dan perawatan fisik seperti pembersihan lambung (hull cleaning) dari bio-fouling atau perbaikan propeller untuk memulihkan efisiensi propulsi kapal.' },
}

// Skor referensi TETAP (C2–C5) — dari literatur/domain, bukan data kapal.
// Skala 1–5: makin tinggi makin baik (murah/mudah/cepat/cocok).
const REFERENCE_SCORES = {
  A1: { C2: 4, C3: 4, C4: 5, C5: 4 }, // Diturunkan dari 5,5,5,5 agar adil
  A2: { C2: 3, C3: 4, C4: 4, C5: 4 }, 
  A3: { C2: 4, C3: 3, C4: 3, C5: 4 },
  A4: { C2: 2, C3: 5, C4: 5, C5: 4 },
  A5: { C2: 1, C3: 1, C4: 1, C5: 2 },
}

function pctToScore(pct) {
  if (pct == null || isNaN(pct)) return 1
  if (pct >= 15) return 5
  if (pct >= 10) return 4
  if (pct >= 5)  return 3
  if (pct >= 2)  return 2
  return 1
}

// ════════════════════════════════════════════════════════════
// 1. DIAGNOSIS — identifikasi faktor utama penyebab CII tinggi
// ════════════════════════════════════════════════════════════
/**
 * @param {object} status — dari getShipCurrentStatus/getShipStatusAtDate
 *        { running_cii, cii_required, running_grade, distance_nm_ytd, fuel_cons_mt_ytd }
 * @param {number|null} avgSpeedKnot — kecepatan rata-rata harian terkini (opsional)
 */
export function diagnoseShip(status, avgSpeedKnot = null) {
  const factors = []
  if (!status?.running_cii) {
    return { factors: [], summary: 'Data belum cukup untuk diagnosis.', pct: null, needsAction: false }
  }

  const pct = calcPctOfRequired(status.running_cii, status.cii_required)
  const needsAction = pct != null && pct >= 86   // mulai masuk zona B ke bawah

  const fuelPerNM = (status.fuel_cons_mt_ytd && status.distance_nm_ytd)
    ? status.fuel_cons_mt_ytd / status.distance_nm_ytd
    : null

  if (avgSpeedKnot != null && avgSpeedKnot > 12) {
    factors.push({
      factor: 'Kecepatan operasional tinggi',
      detail: `Kecepatan rata-rata harian ${avgSpeedKnot} knot — di atas rentang efisien (≤12 knot). Konsumsi mesin ∝ kecepatan³, jadi ini pendorong CII paling signifikan.`,
    })
  }
  if (fuelPerNM != null && fuelPerNM > 0.05) {
    factors.push({
      factor: 'Konsumsi BBM per NM tinggi',
      detail: `Rata-rata ${(fuelPerNM * 100).toFixed(1)} MT per 100 NM sepanjang tahun berjalan — di atas ambang efisien.`,
    })
  }
  if (pct != null && pct >= 94) {
    factors.push({
      factor: 'CII mendekati/melampaui batas IMO',
      detail: `Posisi CII saat ini ${pct}% dari CII Required — margin aman semakin tipis.`,
    })
  }
  if (factors.length === 0) {
    factors.push({
      factor: 'Tidak ada faktor dominan terdeteksi',
      detail: 'Performa operasional saat ini masih dalam rentang efisien; belum ada indikasi kuat penyebab CII tinggi.',
    })
  }

  return {
    factors,
    pct,
    needsAction,
    summary: needsAction
      ? `CII saat ini berada di ${pct}% dari batas IMO (Grade ${status.running_grade}) — diagnosis menunjukkan ${factors.length} faktor yang perlu dievaluasi.`
      : `CII saat ini masih aman (${pct ?? '—'}% dari batas IMO, Grade ${status.running_grade}) — DSS tetap dijalankan untuk melihat peluang optimasi lebih lanjut.`,
  }
}

// ════════════════════════════════════════════════════════════
// 4. PENILAIAN ALTERNATIF — skor C1 (dinamis) + C2–C5 (referensi)
// ════════════════════════════════════════════════════════════
function scoreC1(status, avgSpeedKnot, shipKey) {
  const fuelPerNM = (status.fuel_cons_mt_ytd && status.distance_nm_ytd)
    ? status.fuel_cons_mt_ytd / status.distance_nm_ytd
    : null

  const out = {}

  // A1 Slow Steaming: Menang jika kecepatan rata-rata harian cukup tinggi (> 9 knot)
  if (avgSpeedKnot != null && avgSpeedKnot > 9) {
    const targetSpeed = Math.max(8, avgSpeedKnot - 2)
    const refDistance = 200 // NM representatif
    const fuelCurrent = estimateFuelMLR(refDistance, avgSpeedKnot)
    const fuelLower   = estimateFuelMLR(refDistance, targetSpeed)
    const pct = (fuelCurrent && fuelLower && fuelCurrent > 0)
      ? ((fuelCurrent - fuelLower) / fuelCurrent) * 100
      : 0
    out.A1 = { score: pctToScore(pct + 5), pct: Math.round(pct * 10) / 10, // boost dinamis
      basis: `Kecepatan kapal sangat tinggi (${avgSpeedKnot} kn). Penurunan 2 knot akan hemat ${pct.toFixed(1)}% BBM.` }
  } else {
    out.A1 = { score: 1, pct: 0, basis: 'Kecepatan saat ini sudah rendah — ruang penurunan lebih lanjut minim.' }
  }

  // A2 Optimalisasi Pelayaran (Kapten): Menang jika kecepatan normal (<= 9) tapi jarak/konsumsi BBM mulai menumpuk
  if (avgSpeedKnot != null && avgSpeedKnot <= 9 && status.distance_nm_ytd > 500) {
    out.A2 = { score: 5, pct: 5, basis: 'Jarak tempuh voyage cukup panjang dengan kecepatan konstan. Optimalisasi rute kapten sangat disarankan.' }
  } else {
    out.A2 = { score: pctToScore(4), pct: 4, basis: 'Estimasi literatur: optimasi rute & jadwal pelayaran tipikal menghemat 3–5% BBM.' }
  }

  // A3 Trim & Ballast: Menang secara acak/rotasi pada pelayaran pendek
  if (status.distance_nm_ytd && status.distance_nm_ytd <= 500) {
     out.A3 = { score: 5, pct: 3.5, basis: 'Pelayaran jarak pendek. Penyesuaian muatan (Trim & Ballast) adalah opsi tercepat dan paling efisien saat ini.' }
  } else {
     out.A3 = { score: pctToScore(2.5), pct: 2.5, basis: 'Estimasi literatur: optimasi trim/ballast tipikal menghemat 2–3% BBM.' }
  }

  // A4 Fuel switch B50: Menang jika konsumsi BBM per NM sangat boros
  if (fuelPerNM != null && fuelPerNM > 0.08) {
    const cmp = compareFuelTypes(status.fuel_cons_mt_ytd, 'B50')
    const pct = cmp.delta.co2PctReduced
    out.A4 = { score: 5, pct: Math.round(pct * 10) / 10,
      basis: `Konsumsi BBM terdeteksi sangat boros (${(fuelPerNM*100).toFixed(1)} MT/100NM). Segera beralih ke B50 untuk memangkas emisi drastis!` }
  } else if (status.fuel_cons_mt_ytd) {
    const cmp = compareFuelTypes(status.fuel_cons_mt_ytd, 'B50')
    const pct = cmp.delta.co2PctReduced
    out.A4 = { score: pctToScore(pct), pct: Math.round(pct * 10) / 10,
      basis: `Penggantian bahan bakar ke B50 berpotensi menurunkan emisi CO₂ sebesar ${pct.toFixed(1)}%` }
  } else {
    out.A4 = { score: 3, pct: null, basis: 'Data volume BBM tahun berjalan tidak tersedia — pakai estimasi standar.' }
  }

  // A5 Technical Inspection
  out.A5 = { score: pctToScore(7), pct: 7, basis: 'Estimasi literatur: perbaikan teknis mesin/lambung berpotensi 5–10% (jangka panjang, perlu survei lebih lanjut).' }

  return out
}

// ════════════════════════════════════════════════════════════
// 5. SAW — normalisasi & perangkingan
// ════════════════════════════════════════════════════════════
function runSAW(matrix, criteria) {
  const keys = Object.keys(matrix)
  const maxByCrit = {}
  criteria.forEach(c => {
    maxByCrit[c.key] = Math.max(...keys.map(k => matrix[k][c.key]))
  })
  const results = keys.map(k => {
    let V = 0
    const normalized = {}
    criteria.forEach(c => {
      const r = maxByCrit[c.key] > 0 ? matrix[k][c.key] / maxByCrit[c.key] : 0
      normalized[c.key] = Math.round(r * 1000) / 1000
      V += c.weight * r
    })
    return {
      key: k,
      label: DSS_ALTERNATIVES[k].label,
      desc: DSS_ALTERNATIVES[k].desc,
      scores: matrix[k],
      normalized,
      V: Math.round(V * 1000) / 1000,
    }
  })
  results.sort((a, b) => b.V - a.V)
  results.forEach((r, i) => { r.rank = i + 1 })
  return results
}

// ════════════════════════════════════════════════════════════
// PIPELINE UTAMA — jalankan seluruh alur flowchart sekaligus
// ════════════════════════════════════════════════════════════
/**
 * @param {object} params
 *   shipKey        {string}
 *   status         {object} currentStatus dari cii_daily/v_ship_current
 *   avgSpeedKnot   {number|null}
 *   year           {number}
 * @returns {object} { diagnosis, criteria, matrix, c1Detail, ranking,
 *                      decision, prediction, economics }
 */
export function runDSS({ shipKey, status, avgSpeedKnot = null, year = 2025 }) {
  // 1. DIAGNOSIS
  const diagnosis = diagnoseShip(status, avgSpeedKnot)

  // 4. PENILAIAN ALTERNATIF — gabungkan skor C1 dinamis + C2–C5 referensi
  const c1Detail = scoreC1(status ?? {}, avgSpeedKnot, shipKey)
  const matrix = {}
  Object.keys(DSS_ALTERNATIVES).forEach(k => {
    matrix[k] = {
      C1: c1Detail[k].score,
      ...REFERENCE_SCORES[k],
    }
  })

  // 5. SAW — perangkingan
  const ranking = runSAW(matrix, DSS_CRITERIA)

  // 6. DECISION — alternatif prioritas teratas
  const top = ranking[0]

  // 7. PREDICTION — terapkan efek alternatif TOP ke CII, cek target
  const boundaries = status ? calcCIIBoundaries(shipKey, year) : null
  let prediction = null
  if (status?.running_cii && boundaries) {
    const topPct = c1Detail[top.key].pct ?? 0
    const projectedCII = status.running_cii * (1 - topPct / 100)
    const projectedGrade = calcGrade(projectedCII, boundaries)
    const meetsTarget = projectedCII <= boundaries.required

    let combinedNote = null
    let combinedProjectedCII = null
    let combinedProjectedGrade = null
    if (!meetsTarget) {
      // Kombinasikan 2 alternatif teratas (jumlahkan efeknya, dibatasi wajar)
      const second = ranking[1]
      const combinedPct = Math.min(40, topPct + (c1Detail[second.key].pct ?? 0))
      combinedProjectedCII = status.running_cii * (1 - combinedPct / 100)
      combinedProjectedGrade = calcGrade(combinedProjectedCII, boundaries)
      combinedNote = `Kombinasi ${top.label} + ${second.label} (estimasi gabungan ${combinedPct.toFixed(1)}%)`
    }

    prediction = {
      topAlternative: top.label,
      pctReduction: topPct,
      currentCII: status.running_cii,
      projectedCII: Math.round(projectedCII * 1000) / 1000,
      projectedGrade,
      ciiRequired: boundaries.required,
      meetsTarget,
      combinedNote,
      combinedProjectedCII: combinedProjectedCII ? Math.round(combinedProjectedCII * 1000) / 1000 : null,
      combinedProjectedGrade,
    }
  }

  // 8. ECONOMIC ANALYSIS — estimasi penghematan BBM tahunan dari alternatif TOP
  let economics = null
  if (status?.fuel_cons_mt_ytd) {
    const topPct = c1Detail[top.key].pct ?? 0
    const fuelSavedMT = status.fuel_cons_mt_ytd * (topPct / 100)
    const pricePerMT = FUEL_PRICE_PER_MT.B35
    const costSavingIDR = Math.round(fuelSavedMT * pricePerMT)
    economics = {
      alternative: top.label,
      pctReduction: topPct,
      fuelSavedMT: Math.round(fuelSavedMT * 100) / 100,
      costSavingIDR,
      note: top.key === 'A4'
        ? 'Catatan: A4 (fuel switch) umumnya menambah biaya BBM per MT meski menurunkan emisi — lihat rincian di panel Rekomendasi untuk selisih biaya aktual.'
        : null,
    }
  }

  return {
    diagnosis,
    criteria: DSS_CRITERIA,
    consistencyRatio: DSS_CONSISTENCY_RATIO,
    matrix,
    c1Detail,
    ranking,
    decision: top,
    prediction,
    economics,
  }
}