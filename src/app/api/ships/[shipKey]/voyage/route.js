// src/app/api/ships/[shipKey]/voyage/route.js
import { getVoyagesByShip, getVoyageCountByMonth } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET(req, { params }) {
  const { shipKey } = await params
  const { searchParams } = new URL(req.url)
  const limit = parseInt(searchParams.get('limit') || '100')
  const mode  = searchParams.get('mode') || 'list'
  const year  = parseInt(searchParams.get('year') || '2025')

  try {
    // Mode list: daftar voyage (untuk history & dropdown simulasi)
    if (mode === 'list') {
      const voyages = await getVoyagesByShip(shipKey, limit)
      return NextResponse.json({ voyages })
    }

    // Mode count: jumlah voyage per bulan (untuk grafik opsional)
    if (mode === 'count') {
      const counts = await getVoyageCountByMonth(shipKey, year)
      return NextResponse.json({ counts })
    }

    return NextResponse.json({ error: 'mode tidak valid' }, { status: 400 })
  } catch (err) {
    console.error(`GET /api/ships/${shipKey}/voyage error:`, err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}