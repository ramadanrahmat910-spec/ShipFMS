// src/app/api/ships/[shipKey]/sim/route.js — BARU
// ================================================
// Endpoint khusus mode simulasi realtime.
//
// GET /api/ships/[shipKey]/sim?mode=...
//   mode=status&at=YYYY-MM-DD
//       → { today, prev } dari cii_daily (baris pada/tersedia sebelum tanggal virtual,
//         plus baris sehari sebelumnya untuk interpolasi angka)
//
//   mode=window&start=ISO&end=ISO
//       → { track: [...] } potongan AIS untuk animasi peta
//
//   mode=routes
//       → { voyages: [{voyage_id, from_port, to_port, date_departure,
//                      date_arrived, track: [[lat,lon],...]}] }
//         SEMUA jalur voyage (downsampled via RPC voyage_routes_sampled)
//
//   mode=ports
//       → { ports: [...] } daftar pelabuhan (untuk marker peta)

import {
  getShipStatusAtDate,
  getAISWindow,
  getVoyageRoutesSampled,
  getAllPorts,
} from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET(req, { params }) {
  const { shipKey } = await params
  const { searchParams } = new URL(req.url)
  const mode = searchParams.get('mode') || 'status'

  try {
    if (mode === 'status') {
      const at = searchParams.get('at')
      if (!at) return NextResponse.json({ error: 'parameter at wajib (YYYY-MM-DD)' }, { status: 400 })
      const data = await getShipStatusAtDate(shipKey, at)
      return NextResponse.json(data)
    }

    if (mode === 'window') {
      const start = searchParams.get('start')
      const end   = searchParams.get('end')
      if (!start || !end) return NextResponse.json({ error: 'parameter start & end wajib (ISO)' }, { status: 400 })
      const track = await getAISWindow(shipKey, start, end)
      return NextResponse.json({ track, count: track.length })
    }

    if (mode === 'routes') {
      const maxPer = parseInt(searchParams.get('maxPer') || '300')
      const voyages = await getVoyageRoutesSampled(shipKey, maxPer)
      return NextResponse.json({ voyages })
    }

    if (mode === 'ports') {
      const ports = await getAllPorts()
      return NextResponse.json({ ports })
    }

    return NextResponse.json({ error: 'mode tidak valid' }, { status: 400 })
  } catch (err) {
    console.error(`GET /api/ships/${shipKey}/sim error:`, err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}