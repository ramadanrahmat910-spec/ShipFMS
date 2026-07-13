// src/app/api/ships/route.js
import { getAllShips } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const ships = await getAllShips()
    return NextResponse.json({ ships })
  } catch (err) {
    console.error('GET /api/ships error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}