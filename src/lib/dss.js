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
  A1: { label: 'Slow Steaming', desc: 'Menurunkan kecepatan rata-rata operasional' },
  A2: { label: 'Voyage Optimization', desc: 'Optimasi rute & jadwal pelayaran' },
  A3: { label: 'Trim & Ballast Optimization', desc: 'Optimasi trim/ballast untuk kurangi hambatan air' },
  A4: { label: 'Penggunaan Bahan Bakar B50', desc: 'Beralih ke BBM dengan Cf lebih rendah' },
  A5: { label: 'Technical Inspection', desc: 'Inspeksi teknis mesin & lambung (kondisi serius)' },
  A6: { label: 'Hull Cleaning & Antifouling', desc: 'Bersihkan & lapisi ulang lambung untuk kurangi hambatan' },
  A7: { label: 'Propeller Polishing', desc: 'Poles baling-baling untuk pulihkan efisiensi dorong' },
  A8: { label: 'Weather Routing', desc: 'Rute mengikuti cuaca/arus untuk kurangi hambatan jarak jauh' },
  A9: { label: 'Engine Tuning & Preventive Maint.', desc: 'Penyetelan/perawatan mesin preventif' },
  A10: { label: 'Evaluasi Penggunaan Fuel Consumption', desc: 'Optimalisasikan efisiensi penggunaan bahan bakar' },
}

// [ASUMSI ILUSTRATIF — sebutkan di metodologi] Biaya & %CO2 untuk
// alternatif yang TIDAK bisa dihitung langsung dari data kapal.
// A1 & A4 dihitung dinamis (lihat computeMACC), tidak pakai tabel ini.
const REFERENCE_ANNUAL_COST_IDR = {
  A2: 50_000_000,
  A3: 20_000_000,     // one-time, diamortisasi (lihat AMORTIZATION_YEARS)
  A5: 500_000_000,    // one-time, diamortisasi
  A6: 150_000_000,    // one-time (docking), diamortisasi tiap ~2 tahun (fouling terbentuk lagi)
  A7: 30_000_000,     // one-time per tahun (dilakukan rutin tahunan)
  A8: 40_000_000,     // langganan layanan routing per tahun
  A9: 80_000_000,     // one-time, diamortisasi
  A10: 10_000_000,     // pelatihan per tahun — paling murah, kandidat "quick win"
}
const AMORTIZATION_YEARS = { A3: 5, A5: 5, A6: 2, A7: 1, A9: 3 }
const REFERENCE_CO2_REDUCTION_PCT = { A2: 4.0, A3: 2.5, A5: 7.0, A6: 5.0, A7: 1.5, A8: 3.0, A9: 3.5, A10: 1.5 }

/**
 * Aturan kelayakan tiap alternatif — menentukan apakah opsi ini
 * relevan ditampilkan untuk kondisi kapal SAAT INI. `ctx` berisi
 * { status, avgSpeedKnot, fuelPerNM, needsAction, currentFuelType }.
 */
const APPLICABILITY = {
  A1: (ctx) => ctx.avgSpeedKnot != null && ctx.avgSpeedKnot > 9,
  A2: () => true,
  A3: () => true,
  A4: (ctx) => ctx.currentFuelType !== 'B50',
  A5: (ctx) => ctx.needsAction,   // "last resort" — cuma relevan kalau kondisi memang perlu tindakan
  A6: (ctx) => ctx.fuelPerNM == null || ctx.fuelPerNM > 0.035,
  A7: () => true,
  A8: (ctx) => (ctx.status?.distance_nm_ytd ?? 0) > 5000,   // relevan utk operasi jarak jauh/reguler
  A9: (ctx) => ctx.fuelPerNM != null && ctx.fuelPerNM > 0.05,   // sinyal indikasi mesin kurang efisien
  A10: () => true,
}

function pctToScore(pct) {
  if (pct == null || isNaN(pct)) return 1
  if (pct >= 15) return 5
  if (pct >= 10) return 4
  if (pct >= 5) return 3
  if (pct >= 2) return 2
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
function computeMACC(status, avgSpeedKnot, currentFuelType = 'B35') {
  const annualFuelMT = status?.fuel_cons_mt_ytd ?? null
  const cfRef = FUEL_CF.B35   // asumsi Cf baseline utk konversi fuel->CO2 (konsisten dgn data 2025)
  const fuelPerNM = (status?.fuel_cons_mt_ytd && status?.distance_nm_ytd)
    ? status.fuel_cons_mt_ytd / status.distance_nm_ytd
    : null
  const pctOfRequired = calcPctOfRequired(status?.running_cii, status?.cii_required)
  const needsAction = pctOfRequired != null && pctOfRequired >= 86

  const ctx = { status, avgSpeedKnot, fuelPerNM, needsAction, currentFuelType }

  // [BARU] Saring dulu: alternatif mana yang RELEVAN untuk kondisi
  // kapal saat ini — bukan langsung hitung semua 10 lalu tampilkan
  // semua. Ini yang bikin isi kartu benar-benar berubah mengikuti
  // kondisi kapal, bukan cuma urutannya saja.
  const applicableKeys = Object.keys(DSS_ALTERNATIVES).filter(key => APPLICABILITY[key](ctx))

  const items = {}

  // ── A1: Slow Steaming — DINAMIS penuh (model MLR + harga BBM aktual) ──
  if (applicableKeys.includes('A1')) {
    const targetSpeed = Math.max(8, avgSpeedKnot - 2)
    const refDistance = 200
    const fuelCurrent = estimateFuelMLR(refDistance, avgSpeedKnot)
    const fuelLower = estimateFuelMLR(refDistance, targetSpeed)
    const pct = (fuelCurrent && fuelLower && fuelCurrent > 0)
      ? ((fuelCurrent - fuelLower) / fuelCurrent) * 100
      : 0
    const fuelSavedMT = (annualFuelMT ?? 0) * (pct / 100)
    const co2ReducedTon = fuelSavedMT * cfRef
    const costIDR = -(fuelSavedMT * FUEL_PRICE_PER_MT.B35)
    items.A1 = {
      pct: Math.round(pct * 10) / 10,
      co2ReducedTon: Math.round(co2ReducedTon * 100) / 100,
      costIDR: Math.round(costIDR),
      basis: `Model MLR @${avgSpeedKnot}kn vs @${targetSpeed}kn → hemat fuel ${pct.toFixed(1)}%/tahun (${fuelSavedMT.toFixed(1)} MT), CO2 turun ${co2ReducedTon.toFixed(1)} ton, hemat biaya BBM Rp ${Math.abs(Math.round(costIDR)).toLocaleString('id-ID')}/tahun.`,
    }
  }

  // ── A4: Fuel switch ke B50 — DINAMIS penuh (Cf & harga BBM aktual) ──
  if (applicableKeys.includes('A4') && annualFuelMT) {
    const cmp = compareFuelTypes(annualFuelMT, 'B50')
    const co2ReducedTon = Math.max(0, cmp.delta.co2TonSaved)
    const costIDR = cmp.delta.costDiffIDR
    items.A4 = {
      pct: cmp.delta.co2PctReduced,
      co2ReducedTon: Math.round(co2ReducedTon * 100) / 100,
      costIDR: Math.round(costIDR),
      basis: `Cf ${currentFuelType}=${FUEL_CF[currentFuelType] ?? FUEL_CF.B35} vs Cf B50=${FUEL_CF.B50} pada volume ${Math.round(annualFuelMT).toLocaleString('id-ID')} MT/tahun → CO2 turun ${cmp.delta.co2PctReduced.toFixed(1)}% (${co2ReducedTon.toFixed(1)} ton), selisih biaya BBM Rp ${Math.round(costIDR).toLocaleString('id-ID')}/tahun.`,
    }
  }

  // ── Sisanya (A2,A3,A5,A6,A7,A8,A9,A10) — referensi literatur,
  //    dihitung GENERIK dari tabel konstanta, cuma untuk yang lolos
  //    filter applicable() ──
  for (const key of applicableKeys) {
    if (items[key]) continue   // A1/A4 sudah dihitung khusus di atas
    if (!annualFuelMT) continue   // tidak ada basis volume BBM utk estimasi
    const pct = REFERENCE_CO2_REDUCTION_PCT[key]
    const co2ReducedTon = annualFuelMT * (pct / 100) * cfRef
    const rawCost = REFERENCE_ANNUAL_COST_IDR[key]
    const years = AMORTIZATION_YEARS[key] ?? 1
    const costIDR = Math.round(rawCost / years)
    items[key] = {
      pct, co2ReducedTon: Math.round(co2ReducedTon * 100) / 100, costIDR,
      basis: `Estimasi literatur: ${DSS_ALTERNATIVES[key].label.toLowerCase()} berpotensi hemat ${pct}% BBM/tahun. Biaya (referensi ilustratif${years > 1 ? `, diamortisasi ${years} tahun` : '/tahun'}): Rp ${costIDR.toLocaleString('id-ID')}/tahun.`,
    }
  }

  // ── Cost-effectiveness = Rp per ton CO2 dikurangi ──
  const results = Object.entries(items).map(([key, v]) => {
    const costPerTonCO2 = v.co2ReducedTon > 0 ? v.costIDR / v.co2ReducedTon : null
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

  return { diagnosis, macc, decision: top, prediction, economics, boundaries }
}