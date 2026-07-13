// src/app/api/ships/[shipKey]/cii/route.js
import {
  getShipCurrentStatus,
  getRunningCIIMonthly,
  getCIIAnnualSummary,
  getCumulativeByMonth,
  getCIIBoundaries,
  getDashboardData,
} from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET(req, { params }) {
  const { shipKey } = await params
  const { searchParams } = new URL(req.url)
  const year = parseInt(searchParams.get('year') || '2025')
  const mode = searchParams.get('mode') || 'dashboard'

  try {
    // Mode dashboard: ambil semua data sekaligus (untuk dashboard utama)
    if (mode === 'dashboard') {
      const data = await getDashboardData(shipKey, year)
      return NextResponse.json(data)
    }

    // Mode status: hanya kotak Rating CII
    if (mode === 'status') {
      const status = await getShipCurrentStatus(shipKey)
      return NextResponse.json(status)
    }

    // Mode chart: data grafik running CII bulanan
    if (mode === 'chart') {
      const [monthly, cumulative] = await Promise.all([
        getRunningCIIMonthly(shipKey, year),
        getCumulativeByMonth(shipKey, year),
      ])
      return NextResponse.json({ monthly, cumulative })
    }

    // Mode annual: kotak CII Data (akumulasi tahunan)
    if (mode === 'annual') {
      const annual = await getCIIAnnualSummary(shipKey, year)
      return NextResponse.json(annual)
    }

    // Mode boundaries: batas rating A-E
    if (mode === 'boundaries') {
      const boundaries = await getCIIBoundaries(shipKey, year)
      return NextResponse.json(boundaries)
    }

    return NextResponse.json({ error: 'mode tidak valid' }, { status: 400 })
  } catch (err) {
    console.error(`GET /api/ships/${shipKey}/cii error:`, err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}