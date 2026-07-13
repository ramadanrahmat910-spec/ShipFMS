// lib/ciiCalculation.js — ShipCII Dashboard
// ===========================================
// Semua logic kalkulasi CII, BBM, dan simulasi voyage.
// Tidak ada fetch ke database di sini — semua fungsi menerima data sebagai parameter.
// Dipanggil dari komponen UI dan API routes.

// ─── KONSTANTA ───────────────────────────────────────────────

// Parameter CII per kapal (dari sheet CIICALCULATION Excel)
export const SHIP_PARAMS = {
  klasogun: { dwt: 6627, a: 5247, c: 0.61 },
  balongan: { dwt: 6736, a: 5247, c: 0.61 },
}

// Faktor reduksi CII tahunan IMO (MEPC.354(78))
export const REDUCTION_FACTORS = {
  2023: 0.05, 2024: 0.07, 2025: 0.09,
  2026: 0.11, 2027: 0.13625, 2028: 0.1625,
  2029: 0.18875, 2030: 0.215,
}

// Emission factor (Cf) per jenis BBM — IMO MEPC.364(79)
export const FUEL_CF = {
  'B35': 2.443,   // baseline 2025
  'B-35': 2.443,
  'B40': 2.390,   // berlaku Jan–Jun 2026
  'B-40': 2.390,
  'B50': 2.343,   // berlaku Jul 2026+
  'B-50': 2.343,
  'HSD': 3.206,   // solar murni (referensi)
}

// Harga BBM non-subsidi industri (Rp per MT)
// Sumber: Pertamina, MyPertamina, ESDM 2025–2026
export const FUEL_PRICE_PER_MT = {
  'B35':  16512600,   // 2025
  'B-35': 16512600,
  'B40':  16512600,   // Jan–Jun 2026
  'B-40': 16512600,
  'B50':  16978800,   // Jul 2026+
  'B-50': 16978800,
}

// Faktor batas rating IMO (dikalikan CII Required)
// Grade: A < sup < B < low < C < upp < D < inf < E
export const RATING_FACTORS = {
  superior: 0.86,   // batas A/B
  lower:    0.94,   // batas B/C
  upper:    1.06,   // batas C/D
  inferior: 1.18,   // batas D/E
}

// Koefisien MLR dari sheet Excel (β₀ + β₁×distance + β₂×speed)
export const MLR_COEF = {
  b0:  5.0801676028261635,
  b1:  0.0030303477180683,   // koef. distance (NM)
  b2: -0.2783664235149623,   // koef. avg speed (knot)
}


// ════════════════════════════════════════════════════════════
// 1. KALKULASI CII REQUIRED & BOUNDARIES
// ════════════════════════════════════════════════════════════

/**
 * Hitung CII Reference (tanpa faktor reduksi).
 * CII_ref = a / DWT^c
 */
export function calcCIIRef(shipKey) {
  const p = SHIP_PARAMS[shipKey]
  if (!p) return null
  return p.a / Math.pow(p.dwt, p.c)
}

/**
 * Hitung CII Required untuk tahun tertentu.
 * CII_req = CII_ref × (1 - reduction_factor)
 */
export function calcCIIRequired(shipKey, year = 2025) {
  const ciiRef   = calcCIIRef(shipKey)
  const reduction = REDUCTION_FACTORS[year] ?? 0.09
  return ciiRef * (1 - reduction)
}

/**
 * Hitung batas rating A/B/C/D/E dari CII Required.
 * Return: { superior, lower, upper, inferior }
 * - CII < superior  → Grade A
 * - CII < lower     → Grade B
 * - CII < upper     → Grade C
 * - CII < inferior  → Grade D
 * - CII >= inferior → Grade E
 */
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

/**
 * Tentukan grade A–E dari nilai CII attained dan boundaries.
 * Menerima boundaries dari DB atau dari calcCIIBoundaries().
 */
export function calcGrade(ciiAttained, boundaries) {
  if (ciiAttained == null || isNaN(ciiAttained)) return 'N/A'
  const { superior, lower, upper, inferior } = boundaries
  if (ciiAttained < superior) return 'A'
  if (ciiAttained < lower)    return 'B'
  if (ciiAttained < upper)    return 'C'
  if (ciiAttained < inferior) return 'D'
  return 'E'
}

/**
 * Hitung persentase posisi CII attained terhadap CII Required.
 * < 100% = masih di bawah batas (aman)
 * > 100% = sudah melewati batas (tidak comply)
 */
export function calcPctOfRequired(ciiAttained, ciiRequired) {
  if (!ciiRequired || !ciiAttained) return null
  return Math.round((ciiAttained / ciiRequired) * 1000) / 10  // 1 desimal
}

/**
 * Status kepatuhan IMO.
 */
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
 * CII = (CO2_ytd_gram / transport_work_ytd) × 1e7
 * transport_work = DWT × distance_NM
 */
export function calcRunningCII(co2Gram, distanceNM, dwt) {
  if (!distanceNM || distanceNM === 0) return null
  const transportWork = dwt * distanceNM
  return (co2Gram / transportWork) * 1e7
}

/**
 * Proyeksi linear CII ke akhir tahun.
 * Asumsi: laju perubahan CII per hari konsisten dari awal tahun.
 *
 * @param {number} currentCII   — running CII hari ini
 * @param {Date|string} currentDate — tanggal hari ini
 * @param {number} year         — tahun (default 2025)
 * @returns {number} proyeksi CII di 31 Desember
 */
export function projectCIIEndOfYear(currentCII, currentDate, year = 2025) {
  if (!currentCII) return null
  const today     = new Date(currentDate)
  const startYear = new Date(year, 0, 1)
  const endYear   = new Date(year, 11, 31)
  const dayOfYear = Math.floor((today - startYear) / (1000 * 60 * 60 * 24)) + 1
  const daysInYear = isLeapYear(year) ? 366 : 365
  const remaining  = daysInYear - dayOfYear

  if (dayOfYear < 30) return null  // terlalu awal untuk proyeksi

  const ciiPerDay  = currentCII / dayOfYear
  return currentCII + ciiPerDay * remaining
}

/**
 * Prediksi tanggal ketika running CII akan menyentuh CII Required.
 * Menggunakan proyeksi linear dari tren saat ini.
 *
 * @returns {{ date: Date|null, daysFromNow: number|null }}
 */
export function predictLimitDate(currentCII, ciiRequired, currentDate, year = 2025) {
  if (!currentCII || !ciiRequired) return { date: null, daysFromNow: null }
  if (currentCII >= ciiRequired)   return { date: null, daysFromNow: null }  // sudah lewat

  const today     = new Date(currentDate)
  const startYear = new Date(year, 0, 1)
  const dayOfYear = Math.floor((today - startYear) / (1000 * 60 * 60 * 24)) + 1

  if (dayOfYear < 30) return { date: null, daysFromNow: null }

  const ciiPerDay   = currentCII / dayOfYear
  if (ciiPerDay <= 0) return { date: null, daysFromNow: null }

  const daysNeeded  = (ciiRequired - currentCII) / ciiPerDay
  if (daysNeeded > 365) return { date: null, daysFromNow: null }  // terlalu jauh

  const limitDate   = new Date(today)
  limitDate.setDate(today.getDate() + Math.round(daysNeeded))

  return {
    date:        limitDate,
    daysFromNow: Math.round(daysNeeded),
  }
}

function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}


// ════════════════════════════════════════════════════════════
// 3. FUEL & CO2
// ════════════════════════════════════════════════════════════

/**
 * Prediksi konsumsi BBM harian dengan model MLR dari Excel.
 * Fuel (MT/day) = β₀ + β₁×distance + β₂×avgSpeed
 */
export function estimateFuelMLR(distanceNM, avgSpeedKnot) {
  if (!distanceNM || !avgSpeedKnot) return null
  const result = MLR_COEF.b0 + MLR_COEF.b1 * distanceNM + MLR_COEF.b2 * avgSpeedKnot
  return Math.max(0, result)
}

/**
 * Hitung emisi CO2 dari konsumsi BBM.
 * CO2 (ton) = Fuel (ton) × Cf
 * CO2 (gram) = Fuel (ton) × Cf × 1.000.000
 */
export function calcCO2(fuelTon, fuelType = 'B35') {
  const cf = FUEL_CF[fuelType] ?? 2.443
  return {
    ton:  fuelTon * cf,
    gram: fuelTon * cf * 1_000_000,
  }
}

/**
 * Hitung biaya BBM dalam Rupiah.
 * @param {number} fuelTon   — konsumsi BBM (MT)
 * @param {string} fuelType  — 'B35' | 'B40' | 'B50'
 * @param {object} priceData — dari DB fuel_price (opsional, override default)
 */
export function calcFuelCost(fuelTon, fuelType = 'B35', priceData = null) {
  const pricePerMT = priceData?.price_per_mt ?? FUEL_PRICE_PER_MT[fuelType] ?? 16512600
  return Math.round(fuelTon * pricePerMT)
}

/**
 * Bandingkan biaya dan emisi antara B35 (baseline) dan B40/B50 (pilihan baru).
 * Dipakai untuk notes perbandingan di halaman simulasi.
 *
 * @param {number} fuelTon       — total konsumsi BBM (MT)
 * @param {string} newFuelType   — 'B40' | 'B50'
 * @returns object perbandingan lengkap
 */
export function compareFuelTypes(fuelTon, newFuelType = 'B40') {
  const baseline = 'B35'

  const co2Base  = calcCO2(fuelTon, baseline)
  const co2New   = calcCO2(fuelTon, newFuelType)
  const costBase = calcFuelCost(fuelTon, baseline)
  const costNew  = calcFuelCost(fuelTon, newFuelType)

  const co2Saving    = co2Base.ton - co2New.ton
  const co2SavingPct = (co2Saving / co2Base.ton) * 100
  const costDiff     = costNew - costBase  // positif = lebih mahal

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
      costDiffIDR:   costDiff,      // positif = lebih mahal, negatif = lebih murah
      costDiffPct:   Math.round((costDiff / costBase) * 1000) / 10,
    },
    recommendation: generateFuelRecommendation(co2SavingPct, costDiff, newFuelType),
  }
}

function generateFuelRecommendation(co2SavingPct, costDiffIDR, newFuelType) {
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

/**
 * Hitung jarak dua koordinat dengan formula Haversine (dalam NM).
 */
export function haversineNM(lat1, lon1, lat2, lon2) {
  const R    = 3440.065  // radius bumi dalam NM
  const toR  = d => d * Math.PI / 180
  const dLat = toR(lat2 - lat1)
  const dLon = toR(lon2 - lon1)
  const a    = Math.sin(dLat/2) ** 2
              + Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLon/2) ** 2
  return R * 2 * Math.asin(Math.sqrt(a))
}

/**
 * Simulasi satu voyage baru.
 * Input: kapal, asal, tujuan, muatan, jenis BBM, kecepatan.
 * Output: semua kalkulasi yang ditampilkan di halaman simulasi.
 *
 * @param {object} params
 * @param {string} params.shipKey        — 'klasogun' | 'balongan'
 * @param {object} params.originPort     — { port_name, lat, lon }
 * @param {object} params.destPort       — { port_name, lat, lon }
 * @param {number} params.cargoTon       — muatan (ton)
 * @param {string} params.fuelType       — 'B40' | 'B50'
 * @param {number} params.avgSpeedKnot   — kecepatan rata-rata (knot)
 * @param {object} params.currentYTD     — data YTD dari DB { co2_g, distance_nm, fuel_mt }
 * @param {string} params.currentDate    — tanggal hari ini (YYYY-MM-DD)
 * @param {number} params.year           — tahun (default 2025)
 */
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

  // 1. Jarak (Haversine)
  const distanceNM = haversineNM(
    originPort.lat, originPort.lon,
    destPort.lat,   destPort.lon
  )

  // 2. Durasi
  const durationHours = distanceNM / avgSpeedKnot
  const durationDays  = durationHours / 24

  // 3. Cargo utilization
  const utilization = cargoTon / ship.dwt * 100

  // 4. Estimasi konsumsi BBM (MLR)
  const fuelTon = estimateFuelMLR(distanceNM, avgSpeedKnot) * durationDays

  // 5. CO2 emisi voyage ini
  const co2Voyage = calcCO2(fuelTon, fuelType)

  // 6. Biaya BBM voyage ini
  const fuelCostIDR = calcFuelCost(fuelTon, fuelType)

  // 7. Estimated CII setelah voyage ini
  //    (akumulasi YTD + voyage ini)
  const newCO2Gram     = (currentYTD?.co2_emission_g_ytd ?? 0) + co2Voyage.gram
  const newDistanceNM  = (currentYTD?.distance_nm_ytd    ?? 0) + distanceNM
  const estimatedCII   = calcRunningCII(newCO2Gram, newDistanceNM, ship.dwt)

  // 8. Grade setelah voyage
  const boundaries    = calcCIIBoundaries(shipKey, year)
  const estimatedGrade = calcGrade(estimatedCII, boundaries)

  // 9. Perbandingan dengan B35 baseline
  const fuelComparison = compareFuelTypes(fuelTon, fuelType)

  // 10. Status comply IMO
  const imoStatus = calcIMOStatus(estimatedCII, boundaries.required)

  // 11. Rekomendasi berdasarkan hasil simulasi
  const recommendation = generateVoyageRecommendation({
    estimatedCII,
    ciiRequired: boundaries.required,
    estimatedGrade,
    utilization,
    avgSpeedKnot,
    fuelType,
  })

  return {
    // Input
    shipKey,
    originPort:   originPort.port_name,
    destPort:     destPort.port_name,
    cargoTon,
    fuelType,
    avgSpeedKnot,

    // Kalkulasi
    distanceNM:      Math.round(distanceNM * 10) / 10,
    durationHours:   Math.round(durationHours * 10) / 10,
    durationDays:    Math.round(durationDays * 100) / 100,
    utilization:     Math.round(utilization * 10) / 10,
    fuelTon:         Math.round(fuelTon * 1000) / 1000,
    co2Ton:          Math.round(co2Voyage.ton * 100) / 100,
    co2Gram:         Math.round(co2Voyage.gram),
    fuelCostIDR:     fuelCostIDR,

    // CII setelah voyage
    estimatedCII:    estimatedCII ? Math.round(estimatedCII * 1000) / 1000 : null,
    estimatedGrade,
    ciiRequired:     Math.round(boundaries.required * 1000) / 1000,
    imoStatus,

    // Perbandingan BBM
    fuelComparison,

    // Rekomendasi
    recommendation,
  }
}


// ════════════════════════════════════════════════════════════
// 5. REKOMENDASI OTOMATIS
// ════════════════════════════════════════════════════════════

/**
 * Generate rekomendasi dari kondisi CII dashboard (tanpa input user).
 * Dipanggil otomatis di bawah dashboard.
 *
 * @param {object} currentStatus — dari v_ship_current (DB)
 * @param {string} shipKey
 * @param {number} year
 */
export function generateDashboardRecommendation(currentStatus, shipKey, year = 2025) {
  const recommendations = []

  if (!currentStatus?.running_cii) {
    return [{ type: 'info', message: 'Data CII belum tersedia untuk menghasilkan rekomendasi.' }]
  }

  const {
    running_cii,
    cii_required,
    pct_of_required,
    date_limit_reached,
    distance_nm_ytd,
    fuel_cons_mt_ytd,
  } = currentStatus

  const grade = currentStatus.running_grade

  // Rekomendasi berdasarkan grade
  if (grade === 'A') {
    recommendations.push({
      type: 'success',
      title: 'Performa CII Sangat Baik',
      message: `CII kapal (${running_cii.toFixed(2)}) berada di Grade A — jauh di bawah batas IMO. ` +
               `Pertahankan pola operasi saat ini.`,
    })
  } else if (grade === 'B') {
    recommendations.push({
      type: 'success',
      title: 'Performa CII Baik',
      message: `CII kapal berada di Grade B (${pct_of_required}% dari batas IMO). ` +
               `Masih aman, namun perhatikan tren ke depan.`,
    })
  } else if (grade === 'C') {
    recommendations.push({
      type: 'warning',
      title: 'Performa CII Cukup — Perlu Perhatian',
      message: `CII kapal di Grade C. Masih memenuhi standar IMO namun mendekati batas. ` +
               `Pertimbangkan optimasi kecepatan (slow steaming) untuk menjaga grade.`,
    })
  } else if (grade === 'D') {
    recommendations.push({
      type: 'danger',
      title: 'Performa CII Buruk — Tindakan Diperlukan',
      message: `CII kapal di Grade D. Tidak memenuhi standar IMO. ` +
               `Segera evaluasi konsumsi BBM dan rute pelayaran.`,
    })
  } else if (grade === 'E') {
    recommendations.push({
      type: 'danger',
      title: 'Performa CII Sangat Buruk — Tindakan Segera',
      message: `CII kapal di Grade E. Jauh melampaui batas IMO. ` +
               `Diperlukan rencana perbaikan korektif segera.`,
    })
  }

  // Rekomendasi prediksi limit
  if (date_limit_reached) {
    const limitDate = new Date(date_limit_reached)
    const formatted = limitDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
    recommendations.push({
      type: 'warning',
      title: 'Proyeksi Batas IMO',
      message: `Berdasarkan tren saat ini, CII kapal diproyeksikan menyentuh batas IMO ` +
               `sekitar ${formatted}. Pertimbangkan tindakan preventif sebelum tanggal tersebut.`,
    })
  }

  // Rekomendasi BBM
  recommendations.push({
    type: 'info',
    title: 'Transisi BBM B35 → B40/B50',
    message: `Data 2025 menggunakan B35 (Cf 2.443). Untuk operasi 2026, ` +
             `beralih ke B50 dapat mengurangi emisi CO₂ hingga 4.1% ` +
             `dengan selisih biaya +Rp 466.200 per MT BBM.`,
  })

  // Rekomendasi efisiensi jika utilization rendah (estimasi dari fuel/distance)
  if (fuel_cons_mt_ytd && distance_nm_ytd) {
    const fuelPerNM = fuel_cons_mt_ytd / distance_nm_ytd
    if (fuelPerNM > 0.05) {  // threshold: > 0.05 MT/NM dianggap boros
      recommendations.push({
        type: 'warning',
        title: 'Konsumsi BBM per NM Tinggi',
        message: `Rata-rata konsumsi ${(fuelPerNM * 100).toFixed(1)} MT per 100 NM. ` +
                 `Pertimbangkan slow steaming atau evaluasi kondisi mesin.`,
      })
    }
  }

  return recommendations
}

/**
 * Generate rekomendasi dari hasil simulasi voyage.
 */
function generateVoyageRecommendation({ estimatedCII, ciiRequired, estimatedGrade, utilization, avgSpeedKnot, fuelType }) {
  const recs = []

  // Rekomendasi grade
  if (['D', 'E'].includes(estimatedGrade)) {
    recs.push(`⚠ Voyage ini akan mendorong CII ke Grade ${estimatedGrade}. ` +
              `Pertimbangkan mengurangi kecepatan atau meningkatkan muatan.`)
  } else if (estimatedGrade === 'C') {
    recs.push(`Voyage ini mempertahankan Grade C. Masih memenuhi standar IMO.`)
  } else {
    recs.push(`✓ Voyage ini aman — CII estimasi tetap di Grade ${estimatedGrade}.`)
  }

  // Rekomendasi utilization
  if (utilization < 60) {
    recs.push(`Muatan hanya ${utilization.toFixed(0)}% dari DWT. ` +
              `Optimalkan muatan untuk meningkatkan efisiensi CII.`)
  }

  // Rekomendasi kecepatan
  if (avgSpeedKnot > 12) {
    recs.push(`Kecepatan ${avgSpeedKnot} knot tergolong tinggi. ` +
              `Slow steaming di 8–10 knot dapat mengurangi konsumsi BBM signifikan.`)
  }

  // Rekomendasi BBM
  if (fuelType === 'B40') {
    recs.push(`Menggunakan B40. Pertimbangkan B50 untuk pengurangan emisi lebih lanjut ` +
              `jika tersedia di pelabuhan tujuan.`)
  }

  return recs.join(' | ')
}


// ════════════════════════════════════════════════════════════
// 6. FORMAT HELPERS (untuk tampilan di UI)
// ════════════════════════════════════════════════════════════

/**
 * Format angka CII untuk tampilan (2 desimal).
 */
export function formatCII(value) {
  if (value == null || isNaN(value)) return '—'
  return Number(value).toFixed(2)
}

/**
 * Format angka besar dengan pemisah ribuan (Rupiah).
 */
export function formatIDR(value) {
  if (value == null) return '—'
  return 'Rp ' + Math.round(value).toLocaleString('id-ID')
}

/**
 * Format ton/NM dengan 1 desimal.
 */
export function formatNum(value, decimals = 1, suffix = '') {
  if (value == null || isNaN(value)) return '—'
  return Number(value).toFixed(decimals) + (suffix ? ` ${suffix}` : '')
}

/**
 * Format gram CO2 ke unit yang lebih mudah dibaca.
 */
export function formatCO2(gram) {
  if (gram == null) return '—'
  if (gram >= 1_000_000_000) return `${(gram / 1_000_000_000).toFixed(2)} Gg`
  if (gram >= 1_000_000)     return `${(gram / 1_000_000).toFixed(2)} ton`
  if (gram >= 1_000)         return `${(gram / 1_000).toFixed(1)} kg`
  return `${Math.round(gram)} g`
}

/**
 * Warna grade untuk UI (Tailwind class).
 */
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

/**
 * Warna tipe rekomendasi untuk UI.
 */
export function recommendationColor(type) {
  const map = {
    success: 'bg-green-50 border-green-200 text-green-800',
    warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    danger:  'bg-red-50 border-red-200 text-red-800',
    info:    'bg-blue-50 border-blue-200 text-blue-800',
  }
  return map[type] ?? map.info
}