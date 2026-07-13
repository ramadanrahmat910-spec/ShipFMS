// src/app/api/ships/[shipKey]/voyages/[voyageId]/route.js
import { supabase, getVoyageById, getShipByKey, getAllPorts } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET(req, { params }) {
  // params adalah Promise di Next.js 15, harus di-await lebih dulu
  const { shipKey, voyageId } = await params;

  try {
    // 1. Ambil voyage
    let voyage;
    try {
      voyage = await getVoyageById(voyageId);
    } catch {
      return NextResponse.json({ error: 'Voyage tidak ditemukan' }, { status: 404 });
    }

    // 2. Ambil data kapal, pastikan voyage ini memang milik shipKey yang diminta
    const ship = await getShipByKey(shipKey);
    if (!ship || voyage.ship_id !== ship.id) {
      return NextResponse.json({ error: 'Voyage tidak ditemukan untuk kapal ini' }, { status: 404 });
    }

    // Gabungkan info kapal ke object voyage, meniru hasil JOIN versi lama
    const voyageWithShip = {
      ...voyage,
      dwt: ship.dwt,
      cii_param_a: ship.cii_param_a,
      cii_param_c: ship.cii_param_c,
    };

    // 3. Ambil track AIS untuk voyage ini
    const { data: trackRows, error: trackError } = await supabase
      .from('ais_tracking')
      .select('lat, lon, base_datetime, sog, cog, weather')
      .eq('voyage_id', voyageId)
      .order('base_datetime');

    if (trackError) {
      console.error('Gagal ambil ais_tracking:', trackError.message);
    }

    let track = trackRows ?? [];

    // 4. Fallback: kalau tidak ada track AIS, pakai garis lurus dari-ke pelabuhan
    if (track.length === 0) {
      const ports = await getAllPorts();
      const fromPort = ports.find((p) => p.port_name === voyage.from_port);
      const toPort = ports.find((p) => p.port_name === voyage.to_port);
      if (fromPort && toPort) {
        track = [
          { lat: fromPort.lat, lon: fromPort.lon },
          { lat: toPort.lat, lon: toPort.lon },
        ];
      }
    }

    return NextResponse.json({ voyage: voyageWithShip, track });
  } catch (err) {
    console.error('Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}