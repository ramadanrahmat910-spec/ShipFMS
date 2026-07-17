// src/app/api/input/calculate/route.js — REVISI
// =================================================
// [FIX] Sebelumnya: `year = new Date().getFullYear()` → 2026 (tahun asli
//       saat request dibuat), padahal currentYTD diambil dari
//       getShipCurrentStatus() yang bersumber dari data 2025. Akibatnya
//       boundaries CII dihitung pakai reduction factor 2026 (11%) tapi
//       akumulasi CO2/distance yang dipakai adalah akumulasi 2025 —
//       CII estimasi jadi tidak konsisten.
//       Sekarang: year dikunci ke tahun data yang sama dengan currentYTD
//       (SIM_YEAR = 2025, sama seperti dashboard & simulasi realtime),
//       bukan tahun kalender asli. currentDate tetap "hari ini" (real)
//       karena hanya dipakai proyeksi hari-dalam-tahun secara relatif.

import { NextResponse } from 'next/server'
import { getShipByKey, getAllPorts, getShipStatusAtDate } from '@/lib/db'
import { simulateVoyage } from '@/lib/ciiCalculation'
import { SIM_YEAR } from '@/lib/simulationClock'

export async function POST(request) {
  try {
    const body = await request.json()
    const { shipKey, fuelType, portFrom, portTo, avgSpeed, cargo } = body

    if (!shipKey || !portFrom || !portTo || !avgSpeed || !cargo) {
      return NextResponse.json({ error: 'Data input tidak lengkap.' }, { status: 400 })
    }

    const ship = await getShipByKey(shipKey)
    if (!ship) {
      return NextResponse.json({ error: `Kapal '${shipKey}' tidak ditemukan.` }, { status: 404 })
    }

    const ports = await getAllPorts()
    const originPort = ports.find((p) => p.port_name === portFrom)
    const destPort = ports.find((p) => p.port_name === portTo)
    if (!originPort || !destPort) {
      const missing = [!originPort && portFrom, !destPort && portTo].filter(Boolean).join(', ')
      return NextResponse.json(
        { error: `Pelabuhan tidak ditemukan di database: ${missing}` },
        { status: 404 }
      )
    }

    // [FIX] BUG SEBELUMNYA: pakai getShipCurrentStatus() (view v_ship_current)
    // yang kalau gagal/field-nya tidak seperti diharapkan, silently jadi
    // null tanpa log — akibatnya currentYTD.co2_emission_g_ytd/distance_nm_ytd
    // dianggap 0, dan estimatedCII dihitung SEOLAH voyage kecil ini adalah
    // SATU-SATUNYA aktivitas setahun penuh → rasio CO2/jarak meledak jadi
    // puluhan juta (jarak pendek dibagi sedikit, hasil tidak masuk akal).
    //
    // PERBAIKAN: pakai getShipStatusAtDate() dari cii_daily — sumber yang
    // SAMA dan SUDAH TERBUKTI reliable dipakai di seluruh dashboard live.
    // Kalau tetap gagal, errornya sekarang di-log jelas (bukan silent),
    // dan currentYTD tetap null sehingga estimatedCII yang dihasilkan HANYA
    // mencerminkan voyage ini sendiri — flag ini ikut dikirim ke frontend
    // (lihat `isolatedEstimate`) supaya tidak disalahartikan sebagai CII
    // tahunan yang valid.
    let currentYTD = null
    try {
      const statusResult = await getShipStatusAtDate(shipKey, `${SIM_YEAR}-12-31`)
      currentYTD = statusResult?.today ?? null
      if (!currentYTD) {
        console.warn(`[api/input/calculate] Tidak ada baris cii_daily untuk ${shipKey} s/d ${SIM_YEAR}-12-31 — estimasi CII akan berbasis voyage ini saja.`)
      }
    } catch (e) {
      console.error('[api/input/calculate] Gagal ambil currentYTD dari cii_daily:', e)
      currentYTD = null
    }

    // [FIX] year dikunci ke SIM_YEAR (2025) — tahun yang sama dengan
    // sumber currentYTD — bukan tahun kalender asli.
    const year = SIM_YEAR
    const currentDate = `${year}-12-31`   // titik akumulasi YTD yang konsisten dgn currentYTD

    const result = simulateVoyage({
      shipKey,
      originPort,
      destPort,
      cargoTon: cargo,
      fuelType,
      avgSpeedKnot: avgSpeed,
      currentYTD,
      currentDate,
      year,
    })

    return NextResponse.json({
      shipName: ship.name,
      dwt: ship.dwt,
      isolatedEstimate: !currentYTD,   // true kalau baseline YTD gagal diambil
      baselineCII: currentYTD?.running_cii ?? null,
      baselineDistanceNM: currentYTD?.distance_nm_ytd ?? null,
      baselineFuelMT: currentYTD?.fuel_cons_mt_ytd ?? null,   // [BARU] untuk DSS di halaman Prediksi CII
      ...result,
    })
  } catch (error) {
    console.error('[api/input/calculate]', error)
    return NextResponse.json(
      { error: error.message || 'Gagal menghitung CII.' },
      { status: 500 }
    )
  }
}


