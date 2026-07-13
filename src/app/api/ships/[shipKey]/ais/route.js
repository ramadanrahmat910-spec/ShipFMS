// src/app/api/ships/[shipKey]/ais/route.js
import { getLatestAISPosition, getAISDailyTrack, getCIIDailyByDate } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET(req, { params }) {
  const { shipKey } = await params
  const { searchParams } = new URL(req.url)
  const mode = searchParams.get('mode') || 'latest'
  const date = searchParams.get('date') || new Date().toISOString().split('T')[0]

  try {
    if (mode === 'latest') {
      const position = await getLatestAISPosition(shipKey)
      return NextResponse.json({ position })
    }

    if (mode === 'track') {
      const track = await getAISDailyTrack(shipKey, date)
      return NextResponse.json({ track, count: track.length })
    }

    if (mode === 'daily') {
      const data = await getCIIDailyByDate(shipKey, date)
      return NextResponse.json(data ?? {})
    }

    return NextResponse.json({ error: 'mode tidak valid' }, { status: 400 })
  } catch (err) {
    console.error(`GET /api/ships/${shipKey}/ais error:`, err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}