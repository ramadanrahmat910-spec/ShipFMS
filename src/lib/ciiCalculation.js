// lib/ciiCalculation.js — ShipCII Dashboard (REVISI)
// ===========================================
// Semua logic kalkulasi CII, BBM, dan simulasi voyage.
// Tidak ada fetch ke database di sini — semua fungsi menerima data sebagai parameter.
//
// PERUBAHAN REVISI:
//   - [FIX] Rekomendasi sekarang SELALU berupa array objek
//     { priority, title, description } — format tunggal yang dipakai
//     komponen RecommendationPanel. Sebelumnya voyage recommendation
//     berupa string di-join " | " → kartu rekomendasi tampil kosong.
//   - generateDashboardRecommendation ikut memakai format yang sama.

// ─── KONSTANTA ───────────────────────────────────────────────
export const SHIP_PARAMS = {
  klasogun: { dwt: 6627, a: 5247, c: 0.61 },
  balongan: { dwt: 6736, a: 5247, c: 0.61 },
}

export const REDUCTION_FACTORS = {
  2023: 0.05, 2024: 0.07, 2025: 0.09,
  2026: 0.11, 2027: 0.13625, 2028: 0.1625,
  2029: 0.18875, 2030: 0.215,
}

export const FUEL_CF = {
  'B35': 2.443, 'B-35': 2.443,
  'B40': 2.390, 'B-40': 2.390,
  'B50': 2.343, 'B-50': 2.343,
  'HSD': 3.206,
}

export const FUEL_PRICE_PER_MT = {
  'B35':  16512600, 'B-35': 16512600,
  'B40':  16512600, 'B-40': 16512600,
  'B50':  16978800, 'B-50': 16978800,
}

export const RATING_FACTORS = {
  superior: 0.86,
  lower:    0.94,
  upper:    1.06,
  inferior: 1.18,
}

export const MLR_COEF = {
  b0:  5.0801676028261635,
  b1:  0.0030303477180683,
  b2: -0.2783664235149623,
}

// ════════════════════════════════════════════════════════════
// 1. KALKULASI CII REQUIRED & BOUNDARIES
// ════════════════════════════════════════════════════════════

export function calcCIIRef(shipKey) {
  const p = SHIP_PARAMS[shipKey]
  if (!p) return null
  return p.a / Math.pow(p.dwt, p.c)
}

export function calcCIIRequired(shipKey, year = 2025) {
  const ciiRef    = calcCIIRef(shipKey)
  const reduction = REDUCTION_FACTORS[year] ?? 0.09
  return ciiRef * (1 - reduction)
}

export function calcCIIBoundaries(shipKey, year = 2025) {
  const req = calcCIIRequired(shipKey, year)
  return {
    superior: req * RATING_FACTORS.superior,
    lower:    req * RATING_FACTORS.lower,
    upper:    req * RATING_FACTORS.upper,
    inferior: req * RATING_FACTORS.inferior,
    required: req,
  }
}

export function calcGrade(ciiAttained, boundaries) {
  if (ciiAttained == null || isNaN(ciiAttained)) return 'N/A'
  const { superior, lower, upper, inferior } = boundaries
  if (ciiAttained < superior) return 'A'
  if (ciiAttained < lower)    return 'B'
  if (ciiAttained < upper)    return 'C'
  if (ciiAttained < inferior) return 'D'
  return 'E'
}

export function calcPctOfRequired(ciiAttained, ciiRequired) {
  if (!ciiRequired || !ciiAttained) return null
  return Math.round((ciiAttained / ciiRequired) * 1000) / 10
}

export function calcIMOStatus(ciiAttained, ciiRequired) {
  if (ciiAttained == null || ciiRequired == null) return 'Data tidak tersedia'
  return ciiAttained <= ciiRequired
    ? 'Memenuhi Standar IMO'
    : 'Tidak Memenuhi Standar IMO'
}

// ════════════════════════════════════════════════════════════
// 2. RUNNING CII & PROYEKSI LINEAR
// ════════════════════════════════════════════════════════════

/**
 * Hitung running CII dari akumulasi CO2 dan transport work.
 *
 * [FIX BESAR] Rumus IMO yang benar: CII = CO2(gram) / (DWT × distance_NM),
 * TANPA faktor pengali apa pun. Versi sebelumnya mengalikan hasilnya
 * dengan 1e7 — bug ini ada sejak kode ASLI (bukan hasil revisi kami),
 * dan tidak pernah ketahuan karena dashboard live membaca `running_cii`
 * yang SUDAH dihitung benar oleh pipeline/DB Anda (tidak lewat fungsi
 * ini) — hanya fitur SIMULASI VOYAGE yang memanggil fungsi ini, jadi
 * cuma di situ hasilnya meledak jadi puluhan juta.
 *
 * Dikonfirmasi silang: co2_emission_g_ytd=3.794.784.945,7 dan
 * distance_nm_ytd=190.622,4752 dari DB (ship klasogun, DWT 6627)
 * menghasilkan running_cii=3.0039734777865092 — hasil pembagian
 * langsung TANPA ×1e7 cocok persis dengan angka itu.
 */
export function calcRunningCII(co2Gram, distanceNM, dwt) {
  if (!distanceNM || distanceNM === 0) return null
  const transportWork = dwt * distanceNM
  return co2Gram / transportWork
}

export function projectCIIEndOfYear(currentCII, currentDate, year = 2025) {
  if (!currentCII) return null
  const today      = new Date(currentDate)
  const startYear  = new Date(year, 0, 1)
  const dayOfYear  = Math.floor((today - startYear) / (1000 * 60 * 60 * 24)) + 1
  const daysInYear = isLeapYear(year) ? 366 : 365
  const remaining  = daysInYear - dayOfYear
  if (dayOfYear < 30) return null
  const ciiPerDay = currentCII / dayOfYear
  return currentCII + ciiPerDay * remaining
}

export function predictLimitDate(currentCII, ciiRequired, currentDate, year = 2025) {
  if (!currentCII || !ciiRequired) return { date: null, daysFromNow: null }
  if (currentCII >= ciiRequired)   return { date: null, daysFromNow: null }
  const today     = new Date(currentDate)
  const startYear = new Date(year, 0, 1)
  const dayOfYear = Math.floor((today - startYear) / (1000 * 60 * 60 * 24)) + 1
  if (dayOfYear < 30) return { date: null, daysFromNow: null }
  const ciiPerDay = currentCII / dayOfYear
  if (ciiPerDay <= 0) return { date: null, daysFromNow: null }
  const daysNeeded = (ciiRequired - currentCII) / ciiPerDay
  if (daysNeeded > 365) return { date: null, daysFromNow: null }
  const limitDate = new Date(today)
  limitDate.setDate(today.getDate() + Math.round(daysNeeded))
  return { date: limitDate, daysFromNow: Math.round(daysNeeded) }
}

function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

// ════════════════════════════════════════════════════════════
// 3. FUEL & CO2
// ════════════════════════════════════════════════════════════

export function estimateFuelMLR(distanceNM, avgSpeedKnot) {
  if (!distanceNM || !avgSpeedKnot) return null
  const result = MLR_COEF.b0 + MLR_COEF.b1 * distanceNM + MLR_COEF.b2 * avgSpeedKnot
  return Math.max(0, result)
}

export function calcCO2(fuelTon, fuelType = 'B35') {
  const cf = FUEL_CF[fuelType] ?? 2.443
  return {
    ton:  fuelTon * cf,
    gram: fuelTon * cf * 1_000_000,
  }
}

export function calcFuelCost(fuelTon, fuelType = 'B35', priceData = null) {
  const pricePerMT = priceData?.price_per_mt ?? FUEL_PRICE_PER_MT[fuelType] ?? 16512600
  return Math.round(fuelTon * pricePerMT)
}

export function compareFuelTypes(fuelTon, newFuelType = 'B40') {
  const baseline = 'B35'
  const co2Base  = calcCO2(fuelTon, baseline)
  const co2New   = calcCO2(fuelTon, newFuelType)
  const costBase = calcFuelCost(fuelTon, baseline)
  const costNew  = calcFuelCost(fuelTon, newFuelType)

  const co2Saving    = co2Base.ton - co2New.ton
  const co2SavingPct = (co2Saving / co2Base.ton) * 100
  const costDiff     = costNew - costBase

  return {
    baseline: {
      fuelType: baseline,
      fuelTon,
      co2Ton:   Math.round(co2Base.ton * 100) / 100,
      costIDR:  costBase,
      cf:       FUEL_CF[baseline],
    },
    alternative: {
      fuelType:  newFuelType,
      fuelTon,
      co2Ton:    Math.round(co2New.ton * 100) / 100,
      costIDR:   costNew,
      cf:        FUEL_CF[newFuelType],
    },
    delta: {
      co2TonSaved:   Math.round(co2Saving * 100) / 100,
      co2PctReduced: Math.round(co2SavingPct * 10) / 10,
      costDiffIDR:   costDiff,
      costDiffPct:   Math.round((costDiff / costBase) * 1000) / 10,
    },
    recommendation: generateFuelNote(co2SavingPct, costDiff, newFuelType),
  }
}

function generateFuelNote(co2SavingPct, costDiffIDR, newFuelType) {
  const costDiffJuta = Math.round(costDiffIDR / 1_000_000)
  const sign = costDiffIDR >= 0 ? '+' : '-'
  return `Beralih ke ${newFuelType} mengurangi emisi CO₂ sebesar ${co2SavingPct.toFixed(1)}% ` +
    `dengan selisih biaya ${sign}Rp ${Math.abs(costDiffJuta).toLocaleString('id-ID')} juta per voyage. ` +
    (co2SavingPct > 3
      ? 'Direkomendasikan untuk meningkatkan performa CII jangka panjang.'
      : 'Dampak emisi moderat, pertimbangkan juga kondisi mesin kapal.')
}

// ════════════════════════════════════════════════════════════
// 4. SIMULASI VOYAGE
// ════════════════════════════════════════════════════════════

export function haversineNM(lat1, lon1, lat2, lon2) {
  const R    = 3440.065
  const toR  = d => d * Math.PI / 180
  const dLat = toR(lat2 - lat1)
  const dLon = toR(lon2 - lon1)
  const a    = Math.sin(dLat/2) ** 2
             + Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLon/2) ** 2
  return R * 2 * Math.asin(Math.sqrt(a))
}

export function simulateVoyage({
  shipKey,
  originPort,
  destPort,
  cargoTon,
  fuelType = 'B40',
  avgSpeedKnot,
  currentYTD,
  currentDate,
  year = 2025,
}) {
  const ship = SHIP_PARAMS[shipKey]
  if (!ship) throw new Error(`Ship '${shipKey}' tidak ditemukan.`)

  const distanceNM = haversineNM(
    originPort.lat, originPort.lon,
    destPort.lat,   destPort.lon
  )

  const durationHours = distanceNM / avgSpeedKnot
  const durationDays  = durationHours / 24
  const utilization   = cargoTon / ship.dwt * 100
  const fuelTon       = estimateFuelMLR(distanceNM, avgSpeedKnot) * durationDays
  const co2Voyage     = calcCO2(fuelTon, fuelType)
  const fuelCostIDR   = calcFuelCost(fuelTon, fuelType)

  const newCO2Gram    = (currentYTD?.co2_emission_g_ytd ?? 0) + co2Voyage.gram
  const newDistanceNM = (currentYTD?.distance_nm_ytd    ?? 0) + distanceNM
  const estimatedCII  = calcRunningCII(newCO2Gram, newDistanceNM, ship.dwt)

  // [BARU] "CII Voyage Ini (Terisolasi)" — metrik ILUSTRATIF, dihitung
  // HANYA dari voyage ini sendiri (bukan digabung akumulasi tahunan).
  // BUKAN CII resmi IMO (yang wajib berbasis akumulasi SUM/SUM tahunan —
  // lihat komentar di calcRunningCII), tapi berguna untuk melihat
  // sensitivitas "what-if" kecepatan/BBM secara langsung, karena tidak
  // "tertelan" oleh akumulasi tahunan yang jauh lebih besar. Muatan
  // tetap TIDAK memengaruhi angka ini — itu bukan soal terisolasi/tidak,
  // tapi karena rumus CII IMO memang tidak punya variabel muatan aktual
  // sama sekali (cuma DWT nominal).
  const isolatedCII   = calcRunningCII(co2Voyage.gram, distanceNM, ship.dwt)

  const boundaries     = calcCIIBoundaries(shipKey, year)
  const estimatedGrade = calcGrade(estimatedCII, boundaries)
  const isolatedGrade  = calcGrade(isolatedCII, boundaries)
  const fuelComparison = compareFuelTypes(fuelTon, fuelType)
  const imoStatus      = calcIMOStatus(estimatedCII, boundaries.required)

  // [FIX #3] recommendation sekarang ARRAY OBJEK {priority,timeframe,etaLabel,title,description}
  // — dipanggil DUA KALI dengan CII/Grade yang beda, supaya rekomendasinya
  // konsisten dengan angka yang dirujuk (Grade akumulasi IMO vs Grade
  // terisolasi bisa berbeda jauh, jadi rekomendasinya juga harus berbeda).
  const recommendation = generateVoyageRecommendation({
    estimatedCII,
    ciiRequired: boundaries.required,
    estimatedGrade,
    utilization,
    avgSpeedKnot,
    fuelType,
    distanceNM,
    fuelComparison,
  })

  // [BARU] Rekomendasi berbasis CII TERISOLASI (voyage ini saja, tanpa
  // akumulasi tahunan) — dipakai untuk panel rekomendasi kedua di UI.
  const recommendationIsolated = generateVoyageRecommendation({
    estimatedCII: isolatedCII,
    ciiRequired: boundaries.required,
    estimatedGrade: isolatedGrade,
    utilization,
    avgSpeedKnot,
    fuelType,
    distanceNM,
    fuelComparison,
  })

  return {
    shipKey,
    originPort:   originPort.port_name,
    destPort:     destPort.port_name,
    cargoTon,
    fuelType,
    avgSpeedKnot,

    distanceNM:      Math.round(distanceNM * 10) / 10,
    durationHours:   Math.round(durationHours * 10) / 10,
    durationDays:    Math.round(durationDays * 100) / 100,
    utilization:     Math.round(utilization * 10) / 10,
    fuelTon:         Math.round(fuelTon * 1000) / 1000,
    co2Ton:          Math.round(co2Voyage.ton * 100) / 100,
    co2Gram:         Math.round(co2Voyage.gram),
    fuelCostIDR,

    estimatedCII:    estimatedCII ? Math.round(estimatedCII * 1000) / 1000 : null,
    estimatedGrade,
    ciiRequired:     Math.round(boundaries.required * 1000) / 1000,
    imoStatus,

    isolatedCII:     isolatedCII ? Math.round(isolatedCII * 1000) / 1000 : null,
    isolatedGrade,

    fuelComparison,
    recommendation,             // array — berbasis CII akumulasi resmi IMO
    recommendationIsolated,     // [BARU] array — berbasis CII voyage terisolasi
  }
}

// ════════════════════════════════════════════════════════════
// 5. REKOMENDASI OTOMATIS
//    Format tunggal: { priority: 'high'|'medium'|'low'|'info',
//                      title, description,
//                      savingPerDay?, estimatedCIISaving? }
// ════════════════════════════════════════════════════════════

/**
 * Rekomendasi otomatis dari kondisi dashboard (tanpa input user).
 * [REVISI] Diperluas: sekarang tiap rekomendasi punya field
 * `timeframe` ('urgent' | 'menengah' | 'panjang') dan `etaLabel`
 * (teks jangka waktu yang bisa ditampilkan langsung di UI), supaya
 * terlihat sebagai decision-support system yang lebih meyakinkan —
 * bukan cuma status statis.
 *
 * @param {object} currentStatus — dari v_ship_current / cii_daily
 * @param {object} extra — { voyages?: array, dwt?: number } opsional,
 *                          untuk analisis tambahan (utilisasi muatan).
 */
export function generateDashboardRecommendation(currentStatus, shipKey, year = 2025, extra = {}) {
  const recs = []
  if (!currentStatus?.running_cii) {
    return [{
      priority: 'info', timeframe: 'panjang', etaLabel: '—',
      title: 'Data belum tersedia',
      description: 'Data CII belum tersedia untuk menghasilkan rekomendasi.',
    }]
  }

  const {
    running_cii,
    cii_required,
    date_limit_reached,
    distance_nm_ytd,
    fuel_cons_mt_ytd,
    last_data_date,
  } = currentStatus
  const grade = currentStatus.running_grade
  const pct   = calcPctOfRequired(running_cii, cii_required)

  // 1. Status berdasarkan grade saat ini
  const gradeInfo = {
    A: {
      priority: 'low', timeframe: 'panjang', etaLabel: 'Aman jangka panjang (>6 bulan)',
      title: 'Performa CII Sangat Baik',
      description: `CII kapal (${Number(running_cii).toFixed(2)}) Grade A — ${pct ?? '—'}% dari batas IMO. Tidak ada tindakan yang diperlukan; pertahankan pola operasi saat ini.`,
      basis: [
        `Running CII saat ini = ${Number(running_cii).toFixed(3)}`,
        `CII Required ${year} = ${cii_required != null ? Number(cii_required).toFixed(5) : '—'}`,
        `Posisi = (${Number(running_cii).toFixed(3)} / ${cii_required != null ? Number(cii_required).toFixed(3) : '—'}) × 100% = ${pct ?? '—'}%`,
      ],
    },
    B: {
      priority: 'low', timeframe: 'panjang', etaLabel: 'Aman jangka panjang (>6 bulan)',
      title: 'Performa CII Baik',
      description: `CII kapal Grade B (${pct ?? '—'}% dari batas IMO). Masih aman, cukup pantau tren setiap bulan.`,
      basis: [
        `Running CII saat ini = ${Number(running_cii).toFixed(3)}`,
        `Posisi terhadap batas IMO = ${pct ?? '—'}%`,
      ],
    },
    C: {
      priority: 'medium', timeframe: 'menengah', etaLabel: 'Menengah (1–3 bulan)',
      title: 'Performa CII Cukup — Perlu Perhatian',
      description: 'Grade C, masih memenuhi standar IMO namun mendekati batas. Pertimbangkan optimasi kecepatan (slow steaming) dalam 1–3 bulan ke depan agar tidak turun ke Grade D.',
      basis: [
        `Running CII saat ini = ${Number(running_cii).toFixed(3)}, berada di zona C (86%–106% dari CII Required, faktor RATING_FACTORS.upper=1.06)`,
        `Posisi terhadap batas IMO = ${pct ?? '—'}%`,
      ],
    },
    D: {
      priority: 'high', timeframe: 'urgent', etaLabel: 'Mendesak (≤ 30 hari)',
      title: 'Performa CII Buruk — Tindakan Diperlukan',
      description: 'Grade D, tidak memenuhi standar IMO. Evaluasi konsumsi BBM dan rute pelayaran dalam 30 hari ke depan untuk mencegah penurunan lebih lanjut.',
      basis: [
        `Running CII saat ini = ${Number(running_cii).toFixed(3)}, melebihi ambang Grade C (faktor RATING_FACTORS.upper=1.06 × CII Required)`,
        `Posisi terhadap batas IMO = ${pct ?? '—'}%`,
      ],
    },
    E: {
      priority: 'high', timeframe: 'urgent', etaLabel: 'Mendesak (≤ 7 hari)',
      title: 'Performa CII Sangat Buruk — Tindakan Segera',
      description: 'Grade E, jauh melampaui batas IMO. Diperlukan rencana perbaikan korektif segera, dalam 7 hari ke depan.',
      basis: [
        `Running CII saat ini = ${Number(running_cii).toFixed(3)}, melebihi ambang Grade D (faktor RATING_FACTORS.inferior=1.18 × CII Required)`,
        `Posisi terhadap batas IMO = ${pct ?? '—'}%`,
      ],
    },
  }
  if (gradeInfo[grade]) recs.push(gradeInfo[grade])

  // 2. Proyeksi tanggal sentuh batas IMO (dari kolom date_limit_reached di DB)
  if (date_limit_reached) {
    const limitDate  = new Date(date_limit_reached)
    const ref        = last_data_date ? new Date(last_data_date) : new Date()
    const daysFromNow = Math.round((limitDate - ref) / 86400000)
    const formatted  = limitDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })

    let timeframe = 'panjang', priority = 'low', etaLabel = 'Aman jangka panjang (>6 bulan)'
    if (daysFromNow <= 30) {
      timeframe = 'urgent'; priority = 'high'
      etaLabel = `Mendesak (≤ ${Math.max(daysFromNow, 0)} hari)`
    } else if (daysFromNow <= 180) {
      timeframe = 'menengah'; priority = 'medium'
      etaLabel = 'Menengah (1–6 bulan)'
    }

    recs.push({
      priority, timeframe, etaLabel,
      title: 'Proyeksi Batas IMO',
      description: `Berdasarkan tren saat ini, CII kapal diproyeksikan menyentuh batas IMO sekitar ${formatted} (±${daysFromNow} hari lagi). ${daysFromNow <= 30 ? 'Perlu tindakan preventif segera.' : 'Pantau tren dan siapkan langkah preventif.'}`,
      basis: [
        `Tanggal proyeksi sentuh batas (dari model tren linear cii_daily) = ${formatted}`,
        `Selisih dari tanggal data terakhir (${ref.toLocaleDateString('id-ID')}) = ${daysFromNow} hari`,
      ],
    })
  }

  // 3. Proyeksi akhir tahun (memakai model proyeksi linear yang sudah ada)
  if (last_data_date) {
    const projected = projectCIIEndOfYear(running_cii, last_data_date, year)
    if (projected != null && cii_required) {
      const willBreach = projected > cii_required
      const monthsLeft = 12 - (new Date(last_data_date).getMonth() + 1)
      if (willBreach) {
        const timeframe = monthsLeft <= 3 ? 'urgent' : 'menengah'
        recs.push({
          priority: timeframe === 'urgent' ? 'high' : 'medium',
          timeframe,
          etaLabel: timeframe === 'urgent' ? 'Mendesak (≤ 3 bulan)' : 'Menengah (3–6 bulan)',
          title: 'Proyeksi Akhir Tahun Melampaui Standar',
          description: `Jika tren saat ini berlanjut, CII akhir tahun diproyeksikan ${projected.toFixed(2)} — melebihi standar IMO (${Number(cii_required).toFixed(2)}). Perlu penyesuaian operasional sebelum akhir tahun.`,
          basis: [
            `Proyeksi linear: CII_akhir_tahun = CII_saat_ini + (CII_saat_ini/hari_ke_${new Date(last_data_date).getDate()}) × hari_tersisa`,
            `Hasil proyeksi = ${projected.toFixed(3)}, CII Required ${year} = ${Number(cii_required).toFixed(3)}`,
          ],
        })
      } else {
        recs.push({
          priority: 'low', timeframe: 'panjang', etaLabel: 'Aman jangka panjang (>6 bulan)',
          title: 'Proyeksi Akhir Tahun Aman',
          description: `Proyeksi CII akhir tahun ${projected.toFixed(2)}, masih di bawah standar IMO (${Number(cii_required).toFixed(2)}). Tren operasional saat ini sudah baik.`,
          basis: [
            `Hasil proyeksi linear = ${projected.toFixed(3)}, CII Required ${year} = ${Number(cii_required).toFixed(3)}`,
          ],
        })
      }
    }
  }

  // 4. Transisi BBM (informasional, jangka panjang)
  recs.push({
    priority: 'info', timeframe: 'panjang', etaLabel: 'Jangka panjang (evaluasi sebelum 2026)',
    title: 'Transisi BBM B35 → B40/B50',
    description: 'Data 2025 menggunakan B35 (Cf 2.443). Untuk operasi 2026, beralih ke B50 dapat mengurangi emisi CO₂ hingga 4.1% dengan selisih biaya +Rp 466.200 per MT BBM.',
  })

  // 5. Efisiensi BBM per NM
  if (fuel_cons_mt_ytd && distance_nm_ytd) {
    const fuelPerNM = fuel_cons_mt_ytd / distance_nm_ytd
    if (fuelPerNM > 0.05) {
      recs.push({
        priority: 'medium', timeframe: 'menengah', etaLabel: 'Menengah (1–2 bulan)',
        title: 'Konsumsi BBM per NM Tinggi',
        description: `Rata-rata konsumsi ${(fuelPerNM * 100).toFixed(1)} MT per 100 NM. Pertimbangkan slow steaming atau evaluasi kondisi mesin dalam 1–2 bulan ke depan.`,
        basis: [
          `Konsumsi per NM = fuel_cons_mt_ytd / distance_nm_ytd = ${Number(fuel_cons_mt_ytd).toFixed(1)} / ${Math.round(distance_nm_ytd)} = ${fuelPerNM.toFixed(4)} MT/NM`,
          'Ambang yang dipakai: 0.05 MT/NM (setara 5 MT per 100 NM).',
        ],
      })
    }
  }

  // 6. Utilisasi muatan rata-rata dari voyage terakhir (kalau tersedia)
  if (extra?.voyages?.length && extra?.dwt) {
    const recent = extra.voyages
      .filter(v => v.cargo_ton != null)
      .slice(0, 5)
    if (recent.length >= 2) {
      const avgUtil = (recent.reduce((s, v) => s + v.cargo_ton, 0) / recent.length / extra.dwt) * 100
      if (avgUtil < 60) {
        recs.push({
          priority: 'medium', timeframe: 'menengah', etaLabel: 'Menengah (voyage berikutnya)',
          title: 'Utilisasi Muatan Rendah',
          description: `Rata-rata muatan ${recent.length} voyage terakhir hanya ${avgUtil.toFixed(0)}% dari DWT. Optimalkan muatan pada voyage berikutnya untuk menurunkan CII per ton-mil.`,
          basis: [
            `Rata-rata cargo_ton dari ${recent.length} voyage terakhir = ${(recent.reduce((s, v) => s + v.cargo_ton, 0) / recent.length).toFixed(0)} ton`,
            `Utilisasi = rata-rata cargo_ton / DWT (${extra.dwt}) = ${avgUtil.toFixed(1)}%`,
          ],
        })
      }
    }
  }

  return recs
}

/**
 * [REVISI] Rekomendasi hasil simulasi voyage — array objek dengan
 * field timeframe/etaLabel (sama seperti generateDashboardRecommendation),
 * plus item tambahan: peringatan "mendekati batas", kuantifikasi
 * potensi hemat BBM dari penurunan kecepatan, dan perbandingan BBM
 * vs baseline B35 (kalau fuelComparison disediakan).
 */
function generateVoyageRecommendation({
  estimatedCII, ciiRequired, estimatedGrade, utilization,
  avgSpeedKnot, fuelType, distanceNM, fuelComparison,
}) {
  const recs = []

  // 1. Status grade hasil voyage ini
  if (['D', 'E'].includes(estimatedGrade)) {
    recs.push({
      priority: 'high', timeframe: 'urgent', etaLabel: 'Mendesak — sebelum keberangkatan',
      title: `Voyage Mendorong CII ke Grade ${estimatedGrade}`,
      description: 'Estimasi CII setelah voyage ini tidak memenuhi standar IMO. Pertimbangkan mengurangi kecepatan atau meningkatkan muatan sebelum keberangkatan.',
      basis: [
        `Estimasi CII setelah voyage = ${estimatedCII != null ? estimatedCII.toFixed(3) : '—'}`,
        `CII Required tahun ini = ${ciiRequired != null ? ciiRequired.toFixed(5) : '—'}`,
      ],
    })
  } else if (estimatedGrade === 'C') {
    recs.push({
      priority: 'medium', timeframe: 'menengah', etaLabel: 'Menengah (1–3 bulan)',
      title: 'Voyage Mempertahankan Grade C',
      description: 'Masih memenuhi standar IMO, namun mendekati batas. Pantau voyage berikutnya agar grade tidak turun ke D.',
      basis: [
        `Estimasi CII setelah voyage = ${estimatedCII != null ? estimatedCII.toFixed(3) : '—'}`,
        `Posisi berada di zona C (86%–106% dari CII Required, RATING_FACTORS.upper=1.06)`,
      ],
    })
  } else {
    recs.push({
      priority: 'low', timeframe: 'panjang', etaLabel: 'Aman jangka panjang (>6 bulan)',
      title: `Voyage Aman — Grade ${estimatedGrade}`,
      description: 'Estimasi CII setelah voyage ini tetap di bawah batas IMO dengan margin yang sehat.',
      basis: [
        `Estimasi CII setelah voyage = ${estimatedCII != null ? estimatedCII.toFixed(3) : '—'}`,
        `CII Required tahun ini = ${ciiRequired != null ? ciiRequired.toFixed(5) : '—'}`,
      ],
    })
  }

  // 2. Peringatan dini kalau sudah dekat batas walau grade masih aman (A/B/C)
  const pctOfReq = ciiRequired ? (estimatedCII / ciiRequired) * 100 : null
  if (pctOfReq != null && pctOfReq >= 90 && pctOfReq < 100) {
    recs.push({
      priority: 'medium', timeframe: 'menengah', etaLabel: 'Menengah (voyage berikutnya)',
      title: 'Mendekati Batas IMO',
      description: `Estimasi CII berada di ${pctOfReq.toFixed(0)}% dari batas IMO. Voyage berikutnya dengan pola serupa berisiko melewati batas — pertimbangkan penyesuaian mulai sekarang.`,
      basis: [
        `Posisi = (${estimatedCII.toFixed(3)} / ${ciiRequired.toFixed(3)}) × 100% = ${pctOfReq.toFixed(1)}%`,
      ],
    })
  }

  // 3. Utilisasi muatan
  if (utilization < 60) {
    recs.push({
      priority: 'medium', timeframe: 'menengah', etaLabel: 'Menengah (voyage berikutnya)',
      title: 'Muatan Belum Optimal',
      description: `Muatan hanya ${utilization.toFixed(0)}% dari DWT. Optimalkan muatan pada voyage berikutnya untuk meningkatkan transport work dan menurunkan CII per ton-mil.`,
      basis: [
        `Utilisasi = cargo_ton / DWT = ${utilization.toFixed(1)}%`,
        'Ambang efisien yang dipakai: 60% dari DWT.',
      ],
    })
  }

  // 4. Kecepatan — dengan kuantifikasi potensi hemat BBM (bukan cuma imbauan umum)
  if (avgSpeedKnot > 12 && distanceNM) {
    const targetSpeed   = Math.max(8, avgSpeedKnot - 2)
    const fuelAtCurrent = estimateFuelMLR(distanceNM, avgSpeedKnot)
    const fuelAtLower   = estimateFuelMLR(distanceNM, targetSpeed)
    const savingPct = (fuelAtCurrent && fuelAtLower && fuelAtCurrent > 0)
      ? Math.round(((fuelAtCurrent - fuelAtLower) / fuelAtCurrent) * 100)
      : null
    recs.push({
      priority: 'medium', timeframe: 'menengah', etaLabel: 'Menengah (voyage berikutnya)',
      title: 'Kecepatan Tergolong Tinggi',
      description: `Kecepatan ${avgSpeedKnot} knot di atas rentang efisien.` +
        (savingPct != null
          ? ` Menurunkan ke ${targetSpeed} knot berpotensi menghemat konsumsi BBM harian ~${savingPct}% (konsumsi mesin ∝ kecepatan³).`
          : ' Slow steaming di 8–10 knot dapat mengurangi konsumsi BBM secara signifikan.'),
      basis: [
        `Model MLR: Fuel (MT/hari) = ${MLR_COEF.b0.toFixed(3)} + ${MLR_COEF.b1.toFixed(6)}×distance − ${Math.abs(MLR_COEF.b2).toFixed(6)}×speed`,
        `Pada ${avgSpeedKnot} knot: estimasi ${fuelAtCurrent != null ? fuelAtCurrent.toFixed(2) : '—'} MT/hari`,
        `Pada ${targetSpeed} knot: estimasi ${fuelAtLower != null ? fuelAtLower.toFixed(2) : '—'} MT/hari`,
      ],
    })
  }

  // 5. Pertimbangan B50 kalau masih pakai B40
  if (fuelType === 'B40') {
    recs.push({
      priority: 'info', timeframe: 'panjang', etaLabel: 'Jangka panjang',
      title: 'Pertimbangkan B50',
      description: 'Voyage ini memakai B40. B50 menawarkan pengurangan emisi lebih lanjut jika tersedia di pelabuhan tujuan.',
      basis: [`Cf B40 = ${FUEL_CF.B40}, Cf B50 = ${FUEL_CF.B50} — B50 lebih rendah emisinya per ton BBM.`],
    })
  }

  // 6. Perbandingan kuantitatif vs baseline B35 (kalau tersedia)
  if (fuelComparison?.delta) {
    const { co2PctReduced, costDiffIDR } = fuelComparison.delta
    const meaningful = Math.abs(co2PctReduced) > 3
    recs.push({
      priority: meaningful ? 'medium' : 'info',
      timeframe: meaningful ? 'menengah' : 'panjang',
      etaLabel: meaningful ? 'Menengah (evaluasi kontrak BBM)' : 'Jangka panjang',
      title: 'Potensi Dampak Emisi & Biaya vs B35',
      description: `Dibanding baseline B35, opsi BBM voyage ini ${
        co2PctReduced > 0
          ? `mengurangi emisi ${co2PctReduced.toFixed(1)}%`
          : `menambah emisi ${Math.abs(co2PctReduced).toFixed(1)}%`
      } dengan selisih biaya ${costDiffIDR >= 0 ? '+' : '-'}Rp ${Math.abs(costDiffIDR).toLocaleString('id-ID')}.`,
      basis: [
        `Emisi baseline B35 (Cf ${FUEL_CF.B35}): ${fuelComparison.baseline.co2Ton} ton CO₂`,
        `Emisi opsi terpilih: ${fuelComparison.alternative.co2Ton} ton CO₂`,
        `Selisih biaya total: Rp ${Math.abs(costDiffIDR).toLocaleString('id-ID')}`,
      ],
    })
  }

  return recs
}

// ════════════════════════════════════════════════════════════
// 5b. REKOMENDASI UNTUK VOYAGE HISTORIS TERPILIH
//     (dipakai saat user memilih voyage dari dropdown "Riwayat
//     Perjalanan" di dashboard — BEDA dari generateVoyageRecommendation
//     di atas yang untuk hasil SIMULASI. Di sini datanya voyage yang
//     SUDAH TERJADI, dan setiap rekomendasi menyertakan `basis`: array
//     string berisi angka & rumus yang mendasari kesimpulan, supaya
//     pengguna bisa melihat sendiri alasan di baliknya — bukan cuma
//     kesimpulan tanpa penjelasan.
// ════════════════════════════════════════════════════════════

/**
 * @param {object} voyage — objek voyage dari /api/ships/[shipKey]/voyages/[voyageId]
 *                          (hasil getVoyageById + dwt/cii_param dari ship)
 * @param {string} shipKey
 * @param {number} year
 * @returns array rekomendasi { priority, timeframe, etaLabel, title, description, basis[] }
 */
export function generateVoyageHistoryRecommendation(voyage, shipKey, year = 2025) {
  if (!voyage) return []
  const recs = []

  const dwt          = voyage.dwt ?? SHIP_PARAMS[shipKey]?.dwt ?? null
  const ciiRequired  = calcCIIRequired(shipKey, year)
  const cii          = voyage.cii_attained != null ? Number(voyage.cii_attained) : null
  const boundaries   = calcCIIBoundaries(shipKey, year)
  const grade        = voyage.rating ?? (cii != null ? calcGrade(cii, boundaries) : null)
  const pct          = (cii != null && ciiRequired) ? calcPctOfRequired(cii, ciiRequired) : null
  const utilization  = (voyage.cargo_ton != null && dwt) ? (voyage.cargo_ton / dwt) * 100 : null
  const fuelTon      = voyage.fuel_cons_actual ?? voyage.fuel_cons_mlr ?? null
  const distanceNM   = voyage.distance_nm ?? null
  const avgSpeedKnot = voyage.avg_speed_knots ?? null

  // 1. Status grade voyage ini — dengan basis perhitungan CII eksplisit
  if (cii != null && ciiRequired) {
    const gradeInfo = {
      A: { priority: 'low',    timeframe: 'panjang',  etaLabel: 'Praktik baik — jadikan acuan',
           title: 'Voyage Ini Berkontribusi Sangat Baik pada CII' },
      B: { priority: 'low',    timeframe: 'panjang',  etaLabel: 'Praktik baik — jadikan acuan',
           title: 'Voyage Ini Berkontribusi Baik pada CII' },
      C: { priority: 'medium', timeframe: 'menengah', etaLabel: 'Pelajaran untuk voyage serupa',
           title: 'Voyage Ini Mendekati Batas IMO' },
      D: { priority: 'high',   timeframe: 'urgent',   etaLabel: 'Evaluasi segera pola operasinya',
           title: 'Voyage Ini Melampaui Batas IMO' },
      E: { priority: 'high',   timeframe: 'urgent',   etaLabel: 'Evaluasi segera pola operasinya',
           title: 'Voyage Ini Jauh Melampaui Batas IMO' },
    }
    const g = gradeInfo[grade] ?? gradeInfo.C
    recs.push({
      ...g,
      description: `CII voyage ini ${cii.toFixed(2)} (Grade ${grade}) — ${pct}% dari CII Required ${year} (${ciiRequired.toFixed(2)}).`,
      basis: [
        `CII Attained (tercatat) = ${cii.toFixed(3)}`,
        `CII Required ${year} = a/DWT^c × (1 − reduction factor 9%) = ${ciiRequired.toFixed(5)}`,
        `Posisi terhadap batas = (${cii.toFixed(3)} / ${ciiRequired.toFixed(3)}) × 100% = ${pct}%`,
      ],
    })
  }

  // 2. Utilisasi muatan — basis: cargo_ton / DWT
  if (utilization != null) {
    const good = utilization >= 60
    recs.push({
      priority: good ? 'low' : 'medium',
      timeframe: good ? 'panjang' : 'menengah',
      etaLabel: good ? 'Praktik baik — pertahankan' : 'Untuk voyage serupa berikutnya',
      title: good ? 'Utilisasi Muatan Voyage Ini Baik' : 'Utilisasi Muatan Voyage Ini Rendah',
      description: good
        ? `Utilisasi muatan ${utilization.toFixed(0)}% dari DWT — mendukung efisiensi transport work (DWT×jarak).`
        : `Muatan ${voyage.cargo_ton?.toLocaleString('id-ID')} ton dari kapasitas DWT ${dwt?.toLocaleString('id-ID')} ton — utilisasi hanya ${utilization.toFixed(0)}%, di bawah ambang efisien 60%.`,
      basis: [
        `Utilisasi = cargo_ton / DWT = ${voyage.cargo_ton} / ${dwt} = ${utilization.toFixed(1)}%`,
        !good && 'Transport work lebih rendah dari potensi maksimal kapal, sehingga CII per ton-mil cenderung naik.',
      ].filter(Boolean),
    })
  }

  // 3. Kecepatan vs efisiensi — basis: model MLR, dihitung ulang untuk 2 knot lebih rendah
  if (avgSpeedKnot != null && distanceNM != null) {
    if (avgSpeedKnot > 12) {
      const targetSpeed   = Math.max(8, avgSpeedKnot - 2)
      const fuelAtCurrent = estimateFuelMLR(distanceNM, avgSpeedKnot)
      const fuelAtLower   = estimateFuelMLR(distanceNM, targetSpeed)
      const savingPct = (fuelAtCurrent && fuelAtLower && fuelAtCurrent > 0)
        ? Math.round(((fuelAtCurrent - fuelAtLower) / fuelAtCurrent) * 100)
        : null
      recs.push({
        priority: 'medium', timeframe: 'menengah', etaLabel: 'Untuk voyage serupa berikutnya',
        title: 'Kecepatan Voyage Ini Tergolong Tinggi',
        description: `Kecepatan rata-rata ${avgSpeedKnot} knot.` +
          (savingPct != null ? ` Model MLR memperkirakan penurunan ke ${targetSpeed} knot berpotensi menghemat BBM ~${savingPct}% pada jarak sejauh ini.` : ''),
        basis: [
          `Model MLR: Fuel (MT/hari) = ${MLR_COEF.b0.toFixed(3)} + ${MLR_COEF.b1.toFixed(6)}×distance − ${Math.abs(MLR_COEF.b2).toFixed(6)}×speed`,
          `Pada ${avgSpeedKnot} knot: estimasi ${fuelAtCurrent != null ? fuelAtCurrent.toFixed(2) : '—'} MT/hari`,
          `Pada ${targetSpeed} knot: estimasi ${fuelAtLower != null ? fuelAtLower.toFixed(2) : '—'} MT/hari`,
        ],
      })
    } else {
      recs.push({
        priority: 'low', timeframe: 'panjang', etaLabel: 'Praktik baik — pertahankan',
        title: 'Kecepatan Voyage Ini Sudah Efisien',
        description: `Kecepatan rata-rata ${avgSpeedKnot} knot berada dalam rentang efisien (≤12 knot).`,
        basis: [`Kecepatan tercatat: ${avgSpeedKnot} knot (ambang efisien yang dipakai: 12 knot).`],
      })
    }
  }

  // 4. Perbandingan BBM aktual vs B50 — basis: Cf IMO & harga per fuel type
  if (fuelTon != null) {
    const actualFuelType = voyage.fuel_type ?? 'B35'
    const cmp = compareFuelTypes(fuelTon, 'B50')
    const meaningful = cmp.delta.co2PctReduced > 1
    recs.push({
      priority: meaningful ? 'medium' : 'info',
      timeframe: meaningful ? 'menengah' : 'panjang',
      etaLabel: meaningful ? 'Pertimbangkan untuk kontrak BBM berikutnya' : 'Jangka panjang',
      title: `Potensi Jika Voyage Ini Memakai B50`,
      description: `Total BBM voyage ini ${fuelTon.toFixed(2)} MT (tercatat sebagai ${actualFuelType}). Jika memakai B50, emisi CO₂ ${
        cmp.delta.co2PctReduced > 0 ? `berkurang ${cmp.delta.co2PctReduced.toFixed(1)}%` : 'relatif tidak berubah'
      }, selisih biaya ${cmp.delta.costDiffIDR >= 0 ? '+' : '-'}Rp ${Math.abs(cmp.delta.costDiffIDR).toLocaleString('id-ID')}.`,
      basis: [
        `Emisi tercatat (Cf ${actualFuelType} = ${FUEL_CF[actualFuelType] ?? FUEL_CF.B35}): ${fuelTon.toFixed(2)} × ${FUEL_CF[actualFuelType] ?? FUEL_CF.B35} = ${(fuelTon * (FUEL_CF[actualFuelType] ?? FUEL_CF.B35)).toFixed(2)} ton CO₂`,
        `Emisi jika B50 (Cf ${FUEL_CF.B50}): ${fuelTon.toFixed(2)} × ${FUEL_CF.B50} = ${cmp.alternative.co2Ton} ton CO₂`,
        `Selisih harga per MT: Rp ${FUEL_PRICE_PER_MT.B50.toLocaleString('id-ID')} (B50) vs Rp ${FUEL_PRICE_PER_MT.B35.toLocaleString('id-ID')} (B35)`,
      ],
    })
  }

  return recs
}

// ════════════════════════════════════════════════════════════
// 6. FORMAT HELPERS (untuk tampilan di UI)
// ════════════════════════════════════════════════════════════

export function formatCII(value) {
  if (value == null || isNaN(value)) return '—'
  return Number(value).toFixed(2)
}

export function formatIDR(value) {
  if (value == null) return '—'
  return 'Rp ' + Math.round(value).toLocaleString('id-ID')
}

export function formatNum(value, decimals = 1, suffix = '') {
  if (value == null || isNaN(value)) return '—'
  return Number(value).toFixed(decimals) + (suffix ? ` ${suffix}` : '')
}

/**
 * [BARU] Format durasi dari desimal hari ke teks yang mudah dibaca.
 * Contoh: 0.15 → "3 jam 36 menit", 2.5 → "2 hari 12 jam"
 */
export function formatDuration(days) {
  if (days == null || isNaN(days)) return '—'
  const totalMinutes = Math.round(days * 24 * 60)
  const d = Math.floor(totalMinutes / 1440)
  const h = Math.floor((totalMinutes % 1440) / 60)
  const m = totalMinutes % 60
  const parts = []
  if (d > 0) parts.push(`${d} hari`)
  if (h > 0) parts.push(`${h} jam`)
  if (m > 0 && d === 0) parts.push(`${m} menit`)
  return parts.length ? parts.join(' ') : '< 1 menit'
}

/**
 * [BARU] Format jarak NM dengan konversi km supaya lebih intuitif
 * bagi pembaca yang tidak familiar dengan satuan nautical mile.
 */
export function formatDistanceNM(nm) {
  if (nm == null || isNaN(nm)) return '—'
  const km = nm * 1.852
  return `${Number(nm).toLocaleString('id-ID', { maximumFractionDigits: 1 })} NM (~${km.toLocaleString('id-ID', { maximumFractionDigits: 0 })} km)`
}

export function formatCO2(gram) {
  if (gram == null) return '—'
  if (gram >= 1_000_000_000) return `${(gram / 1_000_000_000).toFixed(2)} Gg`
  if (gram >= 1_000_000)     return `${(gram / 1_000_000).toFixed(2)} ton`
  if (gram >= 1_000)         return `${(gram / 1_000).toFixed(1)} kg`
  return `${Math.round(gram)} g`
}

export function gradeColor(grade) {
  const map = {
    A: { bg: 'bg-green-100',  text: 'text-green-800',  border: 'border-green-300' },
    B: { bg: 'bg-blue-100',   text: 'text-blue-800',   border: 'border-blue-300'  },
    C: { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-300'},
    D: { bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-300'},
    E: { bg: 'bg-red-100',    text: 'text-red-800',    border: 'border-red-300'   },
  }
  return map[grade] ?? { bg: 'bg-gray-100', text: 'text-gray-600', border: 'border-gray-300' }
}

export function recommendationColor(type) {
  const map = {
    success: 'bg-green-50 border-green-200 text-green-800',
    warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    danger:  'bg-red-50 border-red-200 text-red-800',
    info:    'bg-blue-50 border-blue-200 text-blue-800',
  }
  return map[type] ?? map.info
}