// lib/db.js — ShipCII Dashboard (REVISI)
// ================================
// Query layer ke Supabase.
// Semua fungsi fetch data terpusat di sini,
// API routes tinggal panggil fungsi dari file ini.
//
// PERUBAHAN REVISI:
//   - [BARU] getShipStatusAtDate()      → status CII pada tanggal virtual (mode simulasi)
//   - [BARU] getAISWindow()             → potongan AIS antar dua waktu (animasi peta)
//   - [BARU] getVoyageRoutesSampled()   → semua jalur voyage (downsampled via RPC)
//   - [FIX]  haversine duplikat dihapus — sekarang import dari ciiCalculation.js
//
// Supabase client menggunakan @supabase/supabase-js v2.
// Pastikan env variable sudah ada di .env.local:
//   NEXT_PUBLIC_SUPABASE_URL=...
//   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
//   SUPABASE_SERVICE_ROLE_KEY=...  (hanya server-side)

import { createClient } from '@supabase/supabase-js'
import { haversineNM } from './ciiCalculation'

// ─── CLIENT ──────────────────────────────────────────────────
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
 * [BARU — MODE SIMULASI]
 * Status CII "pada tanggal virtual" untuk mode realtime-simulasi.
 * Mengambil baris cii_daily terakhir yang <= tanggal virtual,
 * PLUS baris sehari sebelumnya — dipakai frontend untuk interpolasi
 * angka (distance/fuel/CII berjalan mulus sepanjang hari virtual).
 *
 * @returns {{ today: object|null, prev: object|null }}
 */
export async function getShipStatusAtDate(shipKey, dateStr) {
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
      .lte('date', dateStr)
      .order('date', { ascending: false })
      .limit(2),
    'getShipStatusAtDate'
  )
  return { today: data?.[0] ?? null, prev: data?.[1] ?? null }
}

export async function getRunningCIIMonthly(shipKey, year = 2025) {
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
  const counts = Array(12).fill(0)
  data.forEach(row => {
    const month = new Date(row.date_departure).getMonth()
    counts[month]++
  })
  return counts.map((count, i) => ({ month: i + 1, count }))
}

/**
 * [BARU — PETA]
 * Ambil SEMUA jalur voyage satu kapal, sudah di-downsample lewat
 * fungsi Postgres voyage_routes_sampled (lihat sql/simulation_functions.sql).
 * Voyage tanpa track AIS fallback ke garis lurus antar pelabuhan.
 *
 * @returns [{voyage_id, from_port, to_port, date_departure, date_arrived, track: [[lat,lon],...]}]
 */
export async function getVoyageRoutesSampled(shipKey, maxPerVoyage = 300) {
  const ship = await getShipByKey(shipKey)

  const [voyages, rpcRes, ports] = await Promise.all([
    getVoyagesByShip(shipKey, 200),
    supabase.rpc('voyage_routes_sampled', {
      p_ship_id: ship.id,
      p_max_per_voyage: maxPerVoyage,
    }),
    getAllPorts(),
  ])
  const rows = throwIfError(rpcRes, 'voyage_routes_sampled')

  // [FIX] Urutkan baris secara kronologis agar garis di peta tidak acak-acakan (zigzag)
  // RPC terkadang mengembalikan data tanpa jaminan urutan (tergantung plan PostgreSQL).
  if (rows.length > 0 && rows[0].base_datetime) {
    rows.sort((a, b) => new Date(a.base_datetime) - new Date(b.base_datetime))
  } else if (rows.length > 0 && rows[0].id) {
    rows.sort((a, b) => a.id - b.id)
  }

  // [FIX] Supabase/PostgREST kadang mengembalikan kolom numeric/double
  // sebagai STRING (untuk menjaga presisi), atau ada baris dengan lat/lon
  // di luar rentang valid. Tanpa validasi ini, koordinat rusak (NaN/null)
  // membuat Leaflet crash saat menghitung bounds polyline ("reading 'min'
  // of undefined"). Semua titik di-koersi ke Number dan divalidasi dulu.
  function toValidLatLon(lat, lon) {
    const la = Number(lat), lo = Number(lon)
    if (!Number.isFinite(la) || !Number.isFinite(lo)) return null
    if (la < -90 || la > 90 || lo < -180 || lo > 180) return null
    return [la, lo]
  }

  // Kelompokkan titik per voyage_id, sekaligus validasi, buang duplikat, dan buang anomali GPS (teleport)
  const tracks = {}
  for (const r of rows) {
    const pt = toValidLatLon(r.lat, r.lon)
    if (!pt) continue
    if (!tracks[r.voyage_id]) tracks[r.voyage_id] = []
    const arr = tracks[r.voyage_id]
    const last = arr[arr.length - 1]
    
    const timeMs = r.base_datetime ? new Date(r.base_datetime).getTime() : 0;

    // Filter anomali GPS (zigzag/teleport): jika kecepatan melebihi 20 knots, abaikan titik ini.
    // (Kapal tanker/kargo umumnya berjalan < 15 knots, kecepatan > 20 knots hampir pasti error GPS)
    if (last && timeMs && last[2]) {
      const distNm = haversineNM(last[0], last[1], pt[0], pt[1]);
      const hours = (timeMs - last[2]) / 3600000;
      if (hours > 0 && (distNm / hours) > 20) {
        continue; // Lewati titik yang terlalu jauh dalam waktu terlalu singkat
      }
    }

    if (!last || last[0] !== pt[0] || last[1] !== pt[1]) {
      // Simpan koordinat dan waktu (waktu disimpan sementara di index 2 untuk filter, Leaflet hanya pakai [0,1])
      arr.push([pt[0], pt[1], timeMs])
    }
  }

  return voyages.map(v => {
    let track = tracks[v.id] ?? []
    if (track.length < 2) {
      // Fallback: garis lurus dari pelabuhan asal ke tujuan
      const fromP = ports.find(p => p.port_name === v.from_port)
      const toP   = ports.find(p => p.port_name === v.to_port)
      const a = fromP ? toValidLatLon(fromP.lat, fromP.lon) : null
      const b = toP   ? toValidLatLon(toP.lat, toP.lon)     : null
      if (a && b && (a[0] !== b[0] || a[1] !== b[1])) track = [a, b]
    }
    return {
      voyage_id:      v.id,
      from_port:      v.from_port,
      to_port:        v.to_port,
      date_departure: v.date_departure,
      date_arrived:   v.date_arrived,
      track,
    }
  }).filter(v => v.track.length >= 2)
}

// ════════════════════════════════════════════════════════════
// 4. AIS TRACKING — posisi kapal
// ════════════════════════════════════════════════════════════

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
 * [BARU — MODE SIMULASI]
 * Potongan AIS antara dua waktu (ISO). Dipakai peta untuk buffer
 * animasi pergerakan kapal pada jam virtual.
 */
export async function getAISWindow(shipKey, startISO, endISO) {
  const ship = await getShipByKey(shipKey)
  const data = throwIfError(
    await supabase
      .from('ais_tracking')
      .select('base_datetime, lat, lon, sog, cog, heading')
      .eq('ship_id', ship.id)
      .gte('base_datetime', startISO)
      .lte('base_datetime', endISO)
      .order('base_datetime')
      .limit(5000),
    'getAISWindow'
  )
  return data
}

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

export async function getCurrentFuelPrices() {
  const data = throwIfError(
    await supabase
      .from('v_fuel_price_current')
      .select('fuel_type, price_per_liter, price_per_mt, cf_imo, bio_pct, density_kg_l, notes'),
    'getCurrentFuelPrices'
  )
  return data.reduce((acc, row) => {
    acc[row.fuel_type] = row
    return acc
  }, {})
}

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

export async function getNearestPort(lat, lon, maxDistanceNm = 5) {
  const ports = await getAllPorts()
  let nearest = null
  let minDist = Infinity
  ports.forEach(port => {
    const d = haversineNM(lat, lon, port.lat, port.lon)
    if (d < minDist) {
      minDist = d
      nearest = { ...port, distance_nm: Math.round(d * 10) / 10 }
    }
  })
  if (minDist <= maxDistanceNm) return nearest
  return null
}

// [FIX] haversine duplikat dihapus — dipakai ulang dari ciiCalculation.js.
// Alias diekspor untuk kompatibilitas kode lama yang import haversineNm dari db.js:
export { haversineNM as haversineNm }

// ════════════════════════════════════════════════════════════
// 8. CII BOUNDARIES
// ════════════════════════════════════════════════════════════

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
// 9. AGREGAT — satu panggilan untuk satu halaman
// ════════════════════════════════════════════════════════════

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

export async function getDashboardData(shipKey, year = 2025) {
  const [currentStatus, monthlyChart, cumulativeChart, voyageCount, latestAIS] =
    await Promise.all([
      getShipCurrentStatus(shipKey),
      getRunningCIIMonthly(shipKey, year),
      getCumulativeByMonth(shipKey, year),
      getVoyageCountByMonth(shipKey, year),
      getLatestAISPosition(shipKey),
    ])
  return { currentStatus, monthlyChart, cumulativeChart, voyageCount, latestAIS }
}