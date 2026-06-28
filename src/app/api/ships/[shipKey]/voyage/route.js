import { query } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET(req, { params }) {
  const { shipKey } = await params   // ← wajib
  const { searchParams } = new URL(req.url)
  const limit = parseInt(searchParams.get('limit') || '200')

  try {
    const result = await query(`
      SELECT
        v.id, v.voyage_code, v.date_departure, v.date_arrived,
        v.from_port, v.to_port, v.distance_nm, v.sea_time_hours,
        v.sail_condition, v.avg_speed_knots,
        v.fuel_me_ton, v.fuel_ae_ton, v.cii_attained, v.rating
      FROM voyage v
      JOIN ship s ON s.id = v.ship_id
      WHERE s.ship_key = $1
      ORDER BY v.voyage_code ASC
      LIMIT $2
    `, [shipKey, limit])

    return NextResponse.json({ voyages: result.rows })
  } catch (err) {
    console.error('Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}