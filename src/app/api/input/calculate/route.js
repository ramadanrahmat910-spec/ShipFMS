// src/app/api/input/calculate/route.js
import { query } from '@/lib/db';
import { NextResponse } from 'next/server';
import { computeFullCII } from '@/lib/ciiCalculation';

// Haversine (nautical miles)
function haversine(lat1, lon1, lat2, lon2) {
  const R = 3440.065;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function POST(req) {
  const { shipKey, portFrom, portTo, distance, days, cargo } = await req.json();

  // 1. Data kapal
  const shipRes = await query('SELECT * FROM ship WHERE ship_key = $1', [shipKey]);
  if (shipRes.rowCount === 0) {
    return NextResponse.json({ error: 'Kapal tidak ditemukan' }, { status: 404 });
  }
  const ship = shipRes.rows[0];

  // 2. Koordinat pelabuhan
  const portRes = await query('SELECT port_name, lat, lon FROM port WHERE port_name IN ($1,$2)', [portFrom, portTo]);
  const coords = {};
  portRes.rows.forEach(p => coords[p.port_name] = { lat: p.lat, lon: p.lon });

  // 3. Jarak: gunakan input user atau hitung Haversine
  let distNm = distance ? parseFloat(distance) : null;
  if (!distNm && coords[portFrom] && coords[portTo]) {
    distNm = Math.round(haversine(
      coords[portFrom].lat, coords[portFrom].lon,
      coords[portTo].lat, coords[portTo].lon
    ));
  }
  if (!distNm || distNm <= 0) {
    return NextResponse.json({ error: 'Jarak tidak valid' }, { status: 400 });
  }

  // 4. Hitung total konsumsi BBM
  let totalFuel;
  if (shipKey === 'balongan' && ship.fuel_coef_speed != null && ship.fuel_intercept != null) {
    // Gunakan model regresi untuk Balongan
    const speedKnot = 10; // kecepatan asumsi 10 knot
    const fuelPerHour = ship.fuel_coef_speed * Math.pow(speedKnot, 3) + ship.fuel_intercept;
    const totalHours = (parseFloat(days) || 5.5) * 24;
    totalFuel = fuelPerHour * totalHours;
  } else {
    // Fallback: rata‑rata konsumsi per nm dari fuel_annual 2025
    const fuelRes = await query(
      'SELECT fuel_cons_mt, distance_nm FROM fuel_annual WHERE ship_id = $1 AND year = 2025',
      [ship.id]
    );
    if (fuelRes.rowCount === 0) {
      return NextResponse.json({ error: 'Data konsumsi 2025 tidak tersedia' }, { status: 500 });
    }
    const { fuel_cons_mt, distance_nm } = fuelRes.rows[0];
    const fuelPerNm = fuel_cons_mt / distance_nm;
    totalFuel = distNm * fuelPerNm;
  }

  // 5. Hitung CII
  const result = computeFullCII({
    fuelME: totalFuel,
    fuelAE: 2.5,
    fuelType: 'B40',
    dwt: parseFloat(ship.dwt),
    distance: distNm,
    shipType: 'Tanker',
    ciiParams: {
      a: parseFloat(ship.cii_param_a),
      c: parseFloat(ship.cii_param_c),
    },
    speed: 10,
    days: parseFloat(days) || 1,
  });

  return NextResponse.json({
    shipName: ship.name,
    actualCII: result.actualCII,
    refCII: result.refCII,
    rating: result.rating,
    optimalCII: result.optimalCII,
    optimalRating: result.optimalRating,
    recommendations: result.recommendations,
    distance: distNm,
    fuelConsumption: totalFuel.toFixed(2),
    fuelType: 'B40',
  });
}