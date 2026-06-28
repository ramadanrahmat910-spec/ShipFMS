import { query } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET(req, { params }) {
  const { shipKey } = await params   // ✅ perbaikan

  const { searchParams } = new URL(req.url)
  const mode  = searchParams.get('mode') || 'latest'
  const limit = parseInt(searchParams.get('limit') || '200')
  const days  = parseInt(searchParams.get('days') || '7')

  try {
    let sql, queryParams

    if (mode === 'latest') {
      sql = `
        SELECT a.base_datetime, a.lat, a.lon, a.sog, a.cog, a.heading,
               a.status, a.cargo_status, a.weather, a.temperature_c,
               a.wind_speed_kn, a.wind_direction, a.beaufort_scale,
               a.ais_point_type, a.is_estimated
        FROM ais_tracking a
        JOIN ship s ON s.id = a.ship_id
        WHERE s.ship_key = $1
        ORDER BY a.base_datetime DESC
        LIMIT 1
      `
      queryParams = [shipKey]
    } else if (mode === 'track') {
      sql = `
        SELECT a.base_datetime, a.lat, a.lon, a.sog, a.cog,
               a.cargo_status, a.weather, a.temperature_c,
               a.wind_speed_kn, a.beaufort_scale, a.is_estimated
        FROM ais_tracking a
        JOIN ship s ON s.id = a.ship_id
        WHERE s.ship_key = $1
          AND a.base_datetime >= NOW() - INTERVAL '${days} days'
        ORDER BY a.base_datetime ASC
        LIMIT $2
      `
      queryParams = [shipKey, limit]
    } else {
      sql = `
        SELECT a.base_datetime, a.lat, a.lon, a.sog,
               a.weather, a.temperature_c, a.wind_speed_kn,
               a.beaufort_scale, a.cargo_status
        FROM ais_tracking a
        JOIN ship s ON s.id = a.ship_id
        WHERE s.ship_key = $1
        ORDER BY a.base_datetime DESC
        LIMIT $2
      `
      queryParams = [shipKey, limit]
    }

    const res = await query(sql, queryParams)

    if (mode === 'latest') {
      return NextResponse.json({ position: res.rows[0] || null })
    }
    return NextResponse.json({ track: res.rows, count: res.rows.length })
  } catch (err) {
    console.error(`GET /api/ships/${shipKey}/ais error:`, err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}