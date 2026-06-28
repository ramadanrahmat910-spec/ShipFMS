import { query } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET(req, { params }) {
  const { shipKey } = await params   // ✅ perbaikan

  try {
    const ciiRes = await query(`
      SELECT cb.year, cb.cii_ref, cb.cii_req, cb.cii_attained, cb.rating,
             cb.boundary_superior, cb.boundary_lower,
             cb.boundary_upper, cb.boundary_inferior,
             cb.reduction_factor
      FROM cii_boundaries cb
      JOIN ship s ON s.id = cb.ship_id
      WHERE s.ship_key = $1
      ORDER BY cb.year ASC
    `, [shipKey])

    const fuelRes = await query(`
      SELECT fa.year, fa.fuel_cons_mt, fa.distance_nm
      FROM fuel_annual fa
      JOIN ship s ON s.id = fa.ship_id
      WHERE s.ship_key = $1
      ORDER BY fa.year ASC
    `, [shipKey])

    const voyageStats = await query(`
      SELECT
        COUNT(*) FILTER (WHERE sail_condition = 'Laden')   AS laden_count,
        COUNT(*) FILTER (WHERE sail_condition = 'Ballast') AS ballast_count,
        SUM(distance_nm)                                   AS total_distance,
        SUM(sea_time_hours)                                AS total_hours,
        AVG(avg_speed_knots)                               AS avg_speed,
        AVG(distance_nm)                                   AS avg_distance_per_voyage
      FROM voyage v
      JOIN ship s ON s.id = v.ship_id
      WHERE s.ship_key = $1
    `, [shipKey])

    return NextResponse.json({
      ciiByYear: ciiRes.rows,
      fuelByYear: fuelRes.rows,
      voyageStats: voyageStats.rows[0],
    })
  } catch (err) {
    console.error(`GET /api/ships/${shipKey}/cii error:`, err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}