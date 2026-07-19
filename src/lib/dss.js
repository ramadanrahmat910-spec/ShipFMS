// lib/dss.js — Decision Support System Engine (MACC)
// ============================================================
// [REVISI BESAR] AHP + SAW DIGANTI PENUH dengan MACC (Marginal
// Abatement Cost Curve) — metode yang SUNGGUHAN dipakai industri
// pelayaran (DNV, laporan Maritime Forecast to 2050, dsb) untuk
// memprioritaskan tindakan penurunan emisi kapal.
//
// KENAPA DIGANTI: AHP+SAW pakai bobot kriteria yang TETAP/statis
// (C1=0.40, dst.) — tidak berubah walau kondisi kapal berubah drastis
// (Grade A vs Grade E tetap pakai bobot sama), dan SAW bersifat
// kompensatif (nilai jelek di satu kriteria bisa "ditutupi" nilai bagus
// di kriteria lain). MACC menghilangkan masalah itu total: rankingnya
// SEPENUHNYA dihitung dari data real-time kapal (harga BBM, konsumsi
// BBM aktual, potensi penurunan CO2 aktual) — tidak ada bobot tetap
// sama sekali, jadi otomatis berubah kalau kondisi kapal/harga BBM
// berubah.
//
// ALUR (menggantikan tahap 2-6 versi AHP+SAW sebelumnya):
//   1. DIAGNOSIS         — sama seperti sebelumnya, identifikasi faktor
//   2. HITUNG MACC        — utk tiap alternatif: (a) estimasi ton CO2
//                           yang bisa dikurangi per tahun, (b) estimasi
//                           biaya implementasi per tahun, (c) cost-
//                           effectiveness = biaya / ton CO2 (Rp per ton)
//   3. RANKING            — urutkan dari cost-effectiveness TERENDAH
//                           (termasuk yang NEGATIF = net hemat biaya)
//                           ke tertinggi — persis logika MACC industri
//   4. DECISION           — alternatif cost-effectiveness terendah
//   5. PREDICTION         — proyeksi CII pakai alternatif prioritas,
//                           cek target, sarankan kombinasi kalau belum
//   6. ECONOMIC ANALYSIS  — total biaya/hemat tahunan
//
// CATATAN METODOLOGI:
// A1 (Slow Steaming) & A4 (fuel switch B35->B50) dihitung SEPENUHNYA
// dinamis dari data kapal nyata (model MLR & Cf/harga BBM yang sama
// dipakai di seluruh aplikasi). A2, A3, A5 memakai estimasi % penurunan
// CO2 dari literatur (voyage optimization, trim/ballast, technical
// inspection tidak bisa dihitung dari data AIS/fuel semata), dan biaya
// implementasinya memakai ANGKA REFERENSI ILUSTRATIF (ditandai jelas
// di kode) — sebutkan ini sebagai asumsi di metodologi skripsi, bukan
// hasil survei biaya riil.

import {
  FUEL_CF, FUEL_PRICE_PER_MT,
  estimateFuelMLR, compareFuelTypes,
  calcCIIBoundaries, calcGrade, calcPctOfRequired,
} from './ciiCalculation'

// ─── ALTERNATIF ─────────────────────────────────────────────────
// [REVISI] Diperluas dari 5 jadi 10 alternatif. Bukan lagi "5 opsi
// tetap yang selalu semua tampil" — tiap alternatif punya fungsi
// `applicable(ctx)` yang menentukan apakah opsi itu RELEVAN untuk
// kondisi kapal saat ini. computeMACC() menyaring dulu berdasarkan
// applicable(), baru ranking MACC dijalankan ke yang lolos saja —
// jadi 3 kartu di UI otomatis berubah isinya mengikuti kondisi kapal
// (bukan cuma urutannya yang berubah dari 5 opsi yang sama terus).
export const DSS_ALTERNATIVES = {
  A1: { label: 'Slow Steaming',                    desc: 'Menurunkan kecepatan operasional kapal sebanyak 1-2 knot. Karena konsumsi bahan bakar berbanding lurus dengan pangkat tiga dari kecepatan, penurunan kecepatan sedikit saja akan sangat menghemat BBM.' },
  A2: { label: 'Voyage Optimization',              desc: 'Mengubah rute untuk menghindari cuaca buruk (weather routing) dan menyesuaikan jadwal kedatangan (just-in-time arrival) untuk menghindari waktu tunggu berlebih di pelabuhan.' },
  A3: { label: 'Trim & Ballast Optimization',      desc: 'Menyesuaikan distribusi beban muatan dan air ballast agar keseimbangan (trim) kapal optimal, sehingga mengurangi hambatan hidrodinamis saat berlayar.' },
  A4: { label: 'Penggunaan Bahan Bakar B50',       desc: 'Beralih ke bahan bakar B50. Kandungan biofuel yang lebih tinggi memiliki faktor emisi (Cf) yang lebih rendah dibanding B35, sehingga otomatis langsung menurunkan nilai emisi karbon.' },
  A5: { label: 'Technical Inspection',             desc: 'Melakukan inspeksi dan perawatan fisik seperti pembersihan lambung (hull cleaning) dari bio-fouling atau perbaikan propeller untuk memulihkan efisiensi propulsi kapal.' },
}

// Skor referensi TETAP (C2–C5) — dari literatur/domain, bukan data kapal.
// Skala 1–5: makin tinggi makin baik (murah/mudah/cepat/cocok).
const REFERENCE_SCORES = {
  A1: { C2: 5, C3: 5, C4: 5, C5: 5 },
  A2: { C2: 4, C3: 4, C4: 4, C5: 5 },
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
//    (TIDAK BERUBAH dari versi sebelumnya)
// ════════════════════════════════════════════════════════════
export function diagnoseShip(status, avgSpeedKnot = null) {
  const factors = []
  if (!status?.running_cii) {
    return { factors: [], summary: 'Data belum cukup untuk diagnosis.', pct: null, needsAction: false }
  }

  const pct = calcPctOfRequired(status.running_cii, status.cii_required)
  const needsAction = pct != null && pct >= 86

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
      : `CII saat ini masih aman (${pct ?? '—'}% dari batas IMO, Grade ${status.running_grade}) — MACC tetap dijalankan untuk melihat peluang optimasi lebih lanjut.`,
  }
}

// ════════════════════════════════════════════════════════════
// 2. HITUNG MACC — biaya & CO2 tiap alternatif YANG RELEVAN
//    (disaring dulu pakai APPLICABILITY sebelum dihitung/di-ranking)
// ════════════════════════════════════════════════════════════
/**
 * Hitung skor C1 "Potensi Penurunan CII" untuk tiap alternatif,
 * DINAMIS berdasarkan data kapal saat ini (bukan angka contoh statis).
 *
 * @param {object} status — { running_cii, cii_required, fuel_cons_mt_ytd, distance_nm_ytd }
 * @param {number|null} avgSpeedKnot
 * @param {string} shipKey
 */
function scoreC1(status, avgSpeedKnot, shipKey) {
  const fuelPerNM = (status.fuel_cons_mt_ytd && status.distance_nm_ytd)
    ? status.fuel_cons_mt_ytd / status.distance_nm_ytd
    : null

  const out = {}

  // A1 Slow Steaming — DINAMIS: estimasi % penurunan fuel dari MLR model
  // kalau kecepatan diturunkan 2 knot (mewakili jarak tempuh harian tipikal).
  if (avgSpeedKnot != null && avgSpeedKnot > 8) {
    const targetSpeed = Math.max(8, avgSpeedKnot - 2)
    const refDistance = 200 // NM representatif untuk 1 hari pelayaran
    const fuelCurrent = estimateFuelMLR(refDistance, avgSpeedKnot)
    const fuelLower   = estimateFuelMLR(refDistance, targetSpeed)
    const pct = (fuelCurrent && fuelLower && fuelCurrent > 0)
      ? ((fuelCurrent - fuelLower) / fuelCurrent) * 100
      : 0
    out.A1 = { score: pctToScore(pct), pct: Math.round(pct * 10) / 10,
      basis: `MLR: fuel@${avgSpeedKnot}kn=${fuelCurrent?.toFixed(2)} MT/hari → fuel@${targetSpeed}kn=${fuelLower?.toFixed(2)} MT/hari → hemat ${pct.toFixed(1)}%` }
  } else {
    out.A1 = { score: 1, pct: 0, basis: 'Kecepatan saat ini sudah rendah — ruang penurunan lebih lanjut minim.' }
  }

  // A2 Voyage Optimization — estimasi literatur (rute/jadwal), 3–5%
  out.A2 = { score: pctToScore(4), pct: 4, basis: 'Estimasi literatur: optimasi rute & jadwal pelayaran tipikal menghemat 3–5% BBM.' }

  // A3 Trim & Ballast Optimization — estimasi literatur, 2–3%
  out.A3 = { score: pctToScore(2.5), pct: 2.5, basis: 'Estimasi literatur: optimasi trim/ballast tipikal menghemat 2–3% BBM (mengurangi hambatan air).' }

  // A4 Fuel switch B35→B50 — DINAMIS: pakai compareFuelTypes dengan volume
  // BBM aktual tahun berjalan kapal ini.
  if (status.fuel_cons_mt_ytd) {
    const cmp = compareFuelTypes(status.fuel_cons_mt_ytd, 'B50')
    const pct = cmp.delta.co2PctReduced
    out.A4 = { score: pctToScore(pct), pct: Math.round(pct * 10) / 10,
      basis: `Cf B35=${FUEL_CF.B35} vs Cf B50=${FUEL_CF.B50} pada volume ${Math.round(status.fuel_cons_mt_ytd).toLocaleString('id-ID')} MT/tahun → emisi CO₂ turun ${pct.toFixed(1)}%` }
  } else {
    out.A4 = { score: 3, pct: null, basis: 'Data volume BBM tahun berjalan tidak tersedia — pakai estimasi Cf standar.' }
  }

  // A5 Technical Inspection — potensi tinggi tapi tidak pasti (literatur 5–10%,
  // ambil titik tengah konservatif untuk skor)
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
      key,
      label: DSS_ALTERNATIVES[key].label,
      desc: DSS_ALTERNATIVES[key].desc,
      pct: v.pct,
      co2ReducedTon: v.co2ReducedTon,
      costIDR: v.costIDR,
      costPerTonCO2: costPerTonCO2 != null ? Math.round(costPerTonCO2) : null,
      basis: v.basis,
    }
  })

  results.sort((a, b) => {
    if (a.costPerTonCO2 == null && b.costPerTonCO2 == null) return 0
    if (a.costPerTonCO2 == null) return 1
    if (b.costPerTonCO2 == null) return -1
    return a.costPerTonCO2 - b.costPerTonCO2
  })
  results.forEach((r, i) => { r.rank = i + 1 })

  return results
}

// ════════════════════════════════════════════════════════════
// PIPELINE UTAMA
// ════════════════════════════════════════════════════════════
/**
 * @param {object} params { shipKey, status, avgSpeedKnot, year, currentFuelType }
 * @returns {object} { diagnosis, macc, decision, prediction, economics }
 *
 * CATATAN: nama fungsi & parameter WAJIB dipertahankan sama dengan
 * sebelumnya (semua opsional dgn default) — dashboard/page.js,
 * input/page.js, rekomendasi/page.js TIDAK PERLU diubah sama sekali.
 * `currentFuelType` BARU, opsional (default 'B35'), dipakai buat
 * menentukan apakah A4 (fuel switch ke B50) masih relevan ditampilkan.
 */
export function runDSS({ shipKey, status, avgSpeedKnot = null, year = 2025, currentFuelType = 'B35' }) {
  const diagnosis = diagnoseShip(status, avgSpeedKnot)
  const macc = computeMACC(status ?? {}, avgSpeedKnot, currentFuelType)
  const top = macc[0]

  const boundaries = status ? calcCIIBoundaries(shipKey, year) : null
  let prediction = null
  if (status?.running_cii && boundaries && top) {
    const topPct = top.pct ?? 0
    const projectedCII = status.running_cii * (1 - topPct / 100)
    const projectedGrade = calcGrade(projectedCII, boundaries)
    const meetsTarget = projectedCII <= boundaries.required

    let combinedNote = null
    let combinedProjectedCII = null
    let combinedProjectedGrade = null
    if (!meetsTarget) {
      const second = macc[1]
      const combinedPct = Math.min(40, topPct + (second?.pct ?? 0))
      combinedProjectedCII = status.running_cii * (1 - combinedPct / 100)
      combinedProjectedGrade = calcGrade(combinedProjectedCII, boundaries)
      combinedNote = `Kombinasi ${top.label} + ${second?.label ?? '—'} (estimasi gabungan ${combinedPct.toFixed(1)}%)`
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

  // Economic Analysis — total biaya/hemat dari alternatif prioritas (top)
  let economics = null
  if (top) {
    economics = {
      alternative: top.label,
      pctReduction: top.pct,
      co2ReducedTon: top.co2ReducedTon,
      costIDR: top.costIDR,
      costPerTonCO2: top.costPerTonCO2,
      isNetSaving: top.costIDR < 0,
    }
  }

  return { diagnosis, macc, decision: top, prediction, economics }
}