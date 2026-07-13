// lib/db.js — ShipCII Dashboard
// ================================
// Query layer ke Supabase.
// Semua fungsi fetch data terpusat di sini,
// API routes tinggal panggil fungsi dari file ini.
//
// Supabase client menggunakan @supabase/supabase-js v2.
// Pastikan env variable sudah ada di .env.local:
//   NEXT_PUBLIC_SUPABASE_URL=https://qjqpepkgjfpbbwnvzuts.supabase.co
//   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key dari Supabase dashboard>
//   SUPABASE_SERVICE_ROLE_KEY=<service role key — hanya untuk server-side>

import { createClient } from '@supabase/supabase-js'

// ─── CLIENT ──────────────────────────────────────────────────
// Dua client:
// - supabase     : anon key, untuk query read-only (aman di browser)
// - supabaseAdmin: service role key, HANYA untuk API routes (server-side)

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)


// ─── HELPER ──────────────────────────────────────────────────
function throwIfError({ data, error }, context = '') {
  if (error) throw new Error(`[db.js${context ? ' ' + context : ''}] ${error.message}`)
  return data
}


// ════════════════════════════════════════════════════════════
// 1. SHIP — data kapal
// ════════════════════════════════════════════════════════════

/**
 * Ambil semua kapal.
 * Dipakai untuk dropdown pilih kapal di header dashboard.
 */
export async function getAllShips() {
  const data = throwIfError(
    await supabase
      .from('ship')
      .select('id, ship_key, name, mmsi, dwt, cii_param_a, cii_param_c, cii_ref_value')
      .order('name'),
    'getAllShips'
  )
  return data
}

/**
 * Ambil satu kapal berdasarkan ship_key ('klasogun' | 'balongan').
 */
export async function getShipByKey(shipKey) {
  const data = throwIfError(
    await supabase
      .from('ship')
      .select('*')
      .eq('ship_key', shipKey)
      .single(),
    'getShipByKey'
  )
  return data
}


// ════════════════════════════════════════════════════════════
// 2. CII DAILY — running CII harian (sumber semua grafik)
// ════════════════════════════════════════════════════════════

/**
 * Ambil data running CII terkini per kapal.
 * Dipakai untuk: kotak Rating CII, kotak CII Data, status IMO.
 * Menggunakan view v_ship_current yang sudah menggabungkan semua info.
 */
export async function getShipCurrentStatus(shipKey) {
  const data = throwIfError(
    await supabase
      .from('v_ship_current')
      .select('*')
      .eq('ship_key', shipKey)
      .single(),
    'getShipCurrentStatus'
  )
  return data
}

/**
 * Ambil running CII per bulan untuk grafik Running Annual CII.
 * Return: array 12 bulan dengan running_cii dan cii_required.
 */
export async function getRunningCIIMonthly(shipKey, year = 2025) {
  // Ambil ship_id dulu
  const ship = await getShipByKey(shipKey)

  const data = throwIfError(
    await supabase
      .from('v_running_cii_monthly')
      .select('month, last_date_of_month, running_cii, cii_required, running_grade, distance_nm_month, fuel_cons_mt_month')
      .eq('ship_id', ship.id)
      .eq('year', year)
      .order('month'),
    'getRunningCIIMonthly'
  )
  return data
}

/**
 * Ambil data harian dalam rentang tanggal tertentu.
 * Dipakai untuk grafik detail dan filter tanggal di dashboard.
 */
export async function getCIIDailyRange(shipKey, startDate, endDate) {
  const ship = await getShipByKey(shipKey)

  const data = throwIfError(
    await supabase
      .from('cii_daily')
      .select(`
        date, year, month,
        distance_nm_day, fuel_cons_mt_day, co2_emission_g_day,
        distance_nm_ytd, fuel_cons_mt_ytd, co2_emission_g_ytd,
        transport_work_ytd, running_cii, cii_required,
        running_grade, projected_cii_eoy,
        days_to_limit, date_limit_reached
      `)
      .eq('ship_id', ship.id)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date'),
    'getCIIDailyRange'
  )
  return data
}

/**
 * Ambil data satu hari tertentu.
 * Dipakai untuk kotak Ship Operational (distance, speed, tujuan hari ini).
 */
export async function getCIIDailyByDate(shipKey, targetDate) {
  const ship = await getShipByKey(shipKey)

  const data = throwIfError(
    await supabase
      .from('v_ship_operational_daily')
      .select('*')
      .eq('ship_id', ship.id)
      .eq('date', targetDate)
      .maybeSingle(),
    'getCIIDailyByDate'
  )
  return data
}

/**
 * Ambil data akumulasi tahunan untuk kotak CII Data.
 * Return: distance_nm_annual, fuel_cons_mt_annual, co2_emission_g_annual, transport_work_annual
 */
export async function getCIIAnnualSummary(shipKey, year = 2025) {
  const ship = await getShipByKey(shipKey)

  const data = throwIfError(
    await supabase
      .from('v_cii_data_card')
      .select('*')
      .eq('ship_id', ship.id)
      .eq('year', year)
      .maybeSingle(),
    'getCIIAnnualSummary'
  )
  return data
}

/**
 * Ambil data kumulatif per bulan untuk grafik Distance dan Fuel kumulatif.
 */
export async function getCumulativeByMonth(shipKey, year = 2025) {
  const ship = await getShipByKey(shipKey)

  const data = throwIfError(
    await supabase
      .from('v_running_cii_monthly')
      .select('month, distance_nm_month, fuel_cons_mt_month, co2_emission_g_month')
      .eq('ship_id', ship.id)
      .eq('year', year)
      .order('month'),
    'getCumulativeByMonth'
  )

  // Hitung nilai kumulatif dari data bulanan
  let cumDist = 0, cumFuel = 0, cumCO2 = 0
  return data.map(row => {
    cumDist += row.distance_nm_month  || 0
    cumFuel += row.fuel_cons_mt_month || 0
    cumCO2  += row.co2_emission_g_month || 0
    return {
      month:            row.month,
      distance_nm_cum:  Math.round(cumDist),
      fuel_cons_mt_cum: Math.round(cumFuel * 100) / 100,
      co2_g_cum:        Math.round(cumCO2),
    }
  })
}


// ════════════════════════════════════════════════════════════
// 3. VOYAGE — daftar perjalanan
// ════════════════════════════════════════════════════════════

/**
 * Ambil semua voyage satu kapal, diurutkan terbaru dulu.
 * Dipakai untuk: history list, dropdown pilih voyage di simulasi.
 */
export async function getVoyagesByShip(shipKey, limit = 50) {
  const ship = await getShipByKey(shipKey)

  const data = throwIfError(
    await supabase
      .from('voyage')
      .select(`
        id, voyage_code, date_departure, date_arrived,
        from_port, to_port, distance_nm,
        avg_speed_knots, sea_time_days,
        sail_condition, cargo_ton, fuel_type,
        fuel_cons_actual, fuel_cons_mlr,
        co2_emission_ton, cii_attained, rating
      `)
      .eq('ship_id', ship.id)
      .order('date_departure', { ascending: false })
      .limit(limit),
    'getVoyagesByShip'
  )
  return data
}

/**
 * Ambil satu voyage berdasarkan ID.
 * Dipakai untuk detail voyage dan input simulasi.
 */
export async function getVoyageById(voyageId) {
  const data = throwIfError(
    await supabase
      .from('voyage')
      .select('*')
      .eq('id', voyageId)
      .single(),
    'getVoyageById'
  )
  return data
}

/**
 * Ambil jumlah voyage per bulan untuk grafik opsional.
 */
export async function getVoyageCountByMonth(shipKey, year = 2025) {
  const ship = await getShipByKey(shipKey)

  const data = throwIfError(
    await supabase
      .from('voyage')
      .select('date_departure')
      .eq('ship_id', ship.id)
      .gte('date_departure', `${year}-01-01`)
      .lte('date_departure', `${year}-12-31`),
    'getVoyageCountByMonth'
  )

  // Hitung per bulan
  const counts = Array(12).fill(0)
  data.forEach(row => {
    const month = new Date(row.date_departure).getMonth() // 0-indexed
    counts[month]++
  })
  return counts.map((count, i) => ({ month: i + 1, count }))
}


// ════════════════════════════════════════════════════════════
// 4. AIS TRACKING — posisi kapal
// ════════════════════════════════════════════════════════════

/**
 * Ambil posisi AIS terbaru satu kapal (untuk peta live).
 */
export async function getLatestAISPosition(shipKey) {
  const ship = await getShipByKey(shipKey)

  const data = throwIfError(
    await supabase
      .from('ais_tracking')
      .select('base_datetime, lat, lon, sog, cog, heading, status')
      .eq('ship_id', ship.id)
      .order('base_datetime', { ascending: false })
      .limit(1)
      .single(),
    'getLatestAISPosition'
  )
  return data
}

/**
 * Ambil track AIS satu hari (untuk visualisasi rute harian di peta).
 */
export async function getAISDailyTrack(shipKey, targetDate) {
  const ship = await getShipByKey(shipKey)

  const data = throwIfError(
    await supabase
      .from('ais_tracking')
      .select('base_datetime, lat, lon, sog, heading')
      .eq('ship_id', ship.id)
      .gte('base_datetime', `${targetDate}T00:00:00Z`)
      .lt('base_datetime',  `${targetDate}T23:59:59Z`)
      .order('base_datetime'),
    'getAISDailyTrack'
  )
  return data
}

/**
 * Ambil speed rata-rata per hari dalam satu bulan.
 * Dipakai untuk analisis kecepatan di dashboard.
 */
export async function getAverageSpeedByDay(shipKey, year = 2025, month = null) {
  const ship = await getShipByKey(shipKey)

  let query = supabase
    .from('v_ship_operational_daily')
    .select('date, avg_speed_knot')
    .eq('ship_id', ship.id)

  if (month) {
    const startDate = `${year}-${String(month).padStart(2,'0')}-01`
    const endDate   = `${year}-${String(month).padStart(2,'0')}-31`
    query = query.gte('date', startDate).lte('date', endDate)
  } else {
    query = query.gte('date', `${year}-01-01`).lte('date', `${year}-12-31`)
  }

  const data = throwIfError(await query.order('date'), 'getAverageSpeedByDay')
  return data
}


// ════════════════════════════════════════════════════════════
// 5. NOON REPORT
// ════════════════════════════════════════════════════════════

/**
 * Ambil noon report dalam rentang tanggal.
 * Dipakai untuk tabel history dan cross-check fuel.
 */
export async function getNoonReportRange(shipKey, startDate, endDate) {
  const ship = await getShipByKey(shipKey)

  const data = throwIfError(
    await supabase
      .from('noon_report')
      .select(`
        voyage_date, from_port, to_port,
        avg_speed, distance_nm, steaming_time_h,
        fuel_cons_mt_per_day, fuel_cons_mlr, fuel_type,
        rpm, weather
      `)
      .eq('ship_id', ship.id)
      .gte('voyage_date', startDate)
      .lte('voyage_date', endDate)
      .order('voyage_date'),
    'getNoonReportRange'
  )
  return data
}

/**
 * Ambil noon report satu tanggal.
 */
export async function getNoonReportByDate(shipKey, targetDate) {
  const ship = await getShipByKey(shipKey)

  const data = throwIfError(
    await supabase
      .from('noon_report')
      .select('*')
      .eq('ship_id', ship.id)
      .eq('voyage_date', targetDate)
      .maybeSingle(),
    'getNoonReportByDate'
  )
  return data
}


// ════════════════════════════════════════════════════════════
// 6. FUEL PRICE — harga BBM
// ════════════════════════════════════════════════════════════

/**
 * Ambil harga BBM yang aktif saat ini (dari view v_fuel_price_current).
 * Return: { B35: {...}, B40: {...}, B50: {...} }
 */
export async function getCurrentFuelPrices() {
  const data = throwIfError(
    await supabase
      .from('v_fuel_price_current')
      .select('fuel_type, price_per_liter, price_per_mt, cf_imo, bio_pct, density_kg_l, notes'),
    'getCurrentFuelPrices'
  )
  // Ubah jadi object key by fuel_type untuk kemudahan akses
  return data.reduce((acc, row) => {
    acc[row.fuel_type] = row
    return acc
  }, {})
}

/**
 * Ambil semua harga BBM termasuk historis (untuk notes perbandingan B35 vs B40/B50).
 */
export async function getAllFuelPrices() {
  const data = throwIfError(
    await supabase
      .from('fuel_price')
      .select('fuel_type, valid_from, valid_until, price_per_liter, price_per_mt, cf_imo, bio_pct, notes')
      .order('fuel_type')
      .order('valid_from'),
    'getAllFuelPrices'
  )
  return data
}

/**
 * Ambil harga BBM untuk tanggal tertentu (untuk kalkulasi biaya historis).
 */
export async function getFuelPriceByDate(fuelType, targetDate) {
  const data = throwIfError(
    await supabase
      .from('fuel_price')
      .select('price_per_liter, price_per_mt, cf_imo, density_kg_l')
      .eq('fuel_type', fuelType)
      .lte('valid_from', targetDate)
      .or(`valid_until.is.null,valid_until.gte.${targetDate}`)
      .order('valid_from', { ascending: false })
      .limit(1)
      .maybeSingle(),
    'getFuelPriceByDate'
  )
  return data
}


// ════════════════════════════════════════════════════════════
// 7. PORT — pelabuhan
// ════════════════════════════════════════════════════════════

/**
 * Ambil semua pelabuhan.
 * Dipakai untuk dropdown origin/destination di simulasi.
 */
export async function getAllPorts() {
  const data = throwIfError(
    await supabase
      .from('port')
      .select('id, port_name, lat, lon')
      .order('port_name'),
    'getAllPorts'
  )
  return data
}

/**
 * Cari pelabuhan terdekat dari koordinat (untuk deteksi tujuan voyage dari AIS).
 * Logika: hitung jarak Haversine di sisi JS, ambil yang paling dekat.
 */
export async function getNearestPort(lat, lon, maxDistanceNm = 5) {
  const ports = await getAllPorts()

  let nearest = null
  let minDist = Infinity

  ports.forEach(port => {
    const d = haversineNm(lat, lon, port.lat, port.lon)
    if (d < minDist) {
      minDist = d
      nearest = { ...port, distance_nm: Math.round(d * 10) / 10 }
    }
  })

  // Hanya return jika dalam radius maxDistanceNm
  if (minDist <= maxDistanceNm) return nearest
  return null
}

// Haversine helper (NM) — dipakai di getNearestPort dan simulasi
export function haversineNm(lat1, lon1, lat2, lon2) {
  const R = 3440.065
  const toRad = deg => deg * Math.PI / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat/2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2) ** 2
  return R * 2 * Math.asin(Math.sqrt(a))
}


// ════════════════════════════════════════════════════════════
// 8. CII BOUNDARIES
// ════════════════════════════════════════════════════════════

/**
 * Ambil batas rating CII (A/B/C/D/E) untuk satu kapal dan tahun.
 */
export async function getCIIBoundaries(shipKey, year = 2025) {
  const ship = await getShipByKey(shipKey)

  const data = throwIfError(
    await supabase
      .from('cii_boundaries')
      .select('*')
      .eq('ship_id', ship.id)
      .eq('year', year)
      .maybeSingle(),
    'getCIIBoundaries'
  )
  return data
}


// ════════════════════════════════════════════════════════════
// 9. SIMULASI — kalkulasi voyage baru (tidak menyimpan ke DB)
// ════════════════════════════════════════════════════════════

/**
 * Ambil semua data yang dibutuhkan untuk halaman simulasi dalam satu panggilan.
 * Return: { ship, voyages, ports, fuelPrices, currentCII }
 */
export async function getSimulationPageData(shipKey) {
  const [ship, voyages, ports, fuelPrices, currentCII] = await Promise.all([
    getShipByKey(shipKey),
    getVoyagesByShip(shipKey, 100),
    getAllPorts(),
    getAllFuelPrices(),
    getShipCurrentStatus(shipKey),
  ])

  return { ship, voyages, ports, fuelPrices, currentCII }
}

/**
 * Ambil semua data yang dibutuhkan untuk dashboard utama dalam satu panggilan.
 * Mengurangi jumlah round-trip ke Supabase.
 * Return: { currentStatus, monthlyChart, cumulativeChart, voyageCount, latestAIS }
 */
export async function getDashboardData(shipKey, year = 2025) {
  const [currentStatus, monthlyChart, cumulativeChart, voyageCount, latestAIS] =
    await Promise.all([
      getShipCurrentStatus(shipKey),
      getRunningCIIMonthly(shipKey, year),
      getCumulativeByMonth(shipKey, year),
      getVoyageCountByMonth(shipKey, year),
      getLatestAISPosition(shipKey),
    ])

  return {
    currentStatus,   // untuk kotak Rating CII, CII Data, status IMO
    monthlyChart,    // untuk grafik Running Annual CII
    cumulativeChart, // untuk grafik Distance & Fuel kumulatif
    voyageCount,     // untuk grafik voyage per bulan (opsional)
    latestAIS,       // untuk peta posisi terakhir
  }
}