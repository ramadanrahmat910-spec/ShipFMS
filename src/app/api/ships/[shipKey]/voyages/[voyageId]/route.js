// src/app/api/ships/[shipKey]/voyages/[voyageId]/route.js
import { query } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET(req, { params }) {
  // ✅ params adalah Promise di Next.js 15, harus di-await lebih dulu
  const { shipKey, voyageId } = await params;

  try {
    const voyageRes = await query(`
      SELECT v.*, s.dwt, s.cii_param_a, s.cii_param_c
      FROM voyage v
      JOIN ship s ON s.id = v.ship_id
      WHERE v.id = $1 AND s.ship_key = $2
    `, [voyageId, shipKey]);

    if (voyageRes.rowCount === 0) {
      return NextResponse.json({ error: 'Voyage tidak ditemukan' }, { status: 404 });
    }

    const voyage = voyageRes.rows[0];

    // Ambil track AIS untuk voyage ini
    const trackRes = await query(`
      SELECT lat, lon, base_datetime, sog, cog, weather
      FROM ais_tracking
      WHERE voyage_id = $1
      ORDER BY base_datetime
    `, [voyageId]);

    let track = trackRes.rows;
    if (track.length === 0) {
      const fromPort = await query(`SELECT lat, lon FROM port WHERE port_name = $1`, [voyage.from_port]);
      const toPort = await query(`SELECT lat, lon FROM port WHERE port_name = $1`, [voyage.to_port]);
      if (fromPort.rowCount > 0 && toPort.rowCount > 0) {
        track = [
          { lat: fromPort.rows[0].lat, lon: fromPort.rows[0].lon },
          { lat: toPort.rows[0].lat, lon: toPort.rows[0].lon },
        ];
      }
    }

    return NextResponse.json({ voyage, track });
  } catch (err) {
    console.error('Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}