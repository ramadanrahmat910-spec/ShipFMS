// src/app/api/ships/route.js
import { query } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const res = await query(`
      SELECT
        s.id, s.ship_key, s.name, s.imo, s.mmsi, s.call_sign,
        s.vessel_type, s.flag, s.owner, s.year_built,
        s.dwt, s.gross_tonnage, s.length_m, s.beam_m, s.draft_m,
        s.main_engine, s.mcr_kw, s.fuel_types,
        s.cii_ref_value,
        s.cii_param_a,
        s.cii_param_c,

        -- Koefisien model regresi (Balongan)
        s.fuel_coef_speed,
        s.fuel_intercept,

        -- CII terbaru (2025)
        cb.year         AS cii_year,
        cb.cii_ref,
        cb.cii_req,
        cb.cii_attained,
        cb.rating,
        cb.boundary_superior,
        cb.boundary_lower,
        cb.boundary_upper,
        cb.boundary_inferior,

        -- Konsumsi BBM 2023-2025
        fa23.fuel_cons_mt AS fuel_cons_2023,
        fa24.fuel_cons_mt AS fuel_cons_2024,
        fa25.fuel_cons_mt AS fuel_cons_2025,
        fa25.distance_nm  AS distance_2025

      FROM ship s
      LEFT JOIN cii_boundaries cb ON cb.ship_id = s.id AND cb.year = 2025
      LEFT JOIN fuel_annual fa23 ON fa23.ship_id = s.id AND fa23.year = 2023
      LEFT JOIN fuel_annual fa24 ON fa24.ship_id = s.id AND fa24.year = 2024
      LEFT JOIN fuel_annual fa25 ON fa25.ship_id = s.id AND fa25.year = 2025
      ORDER BY s.id
    `)
    return NextResponse.json({ ships: res.rows })
  } catch (err) {
    console.error('GET /api/ships error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}