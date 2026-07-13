// src/app/api/input/calculate/route.js
import { NextResponse } from 'next/server';
import { getShipByKey, getAllPorts, getShipCurrentStatus } from '@/lib/db';
import { simulateVoyage } from '@/lib/ciiCalculation';

export async function POST(request) {
  try {
    const body = await request.json();
    const { shipKey, fuelType, portFrom, portTo, avgSpeed, cargo } = body;

    if (!shipKey || !portFrom || !portTo || !avgSpeed || !cargo) {
      return NextResponse.json({ error: 'Data input tidak lengkap.' }, { status: 400 });
    }

    // Pastikan kapal ada
    const ship = await getShipByKey(shipKey);
    if (!ship) {
      return NextResponse.json({ error: `Kapal '${shipKey}' tidak ditemukan.` }, { status: 404 });
    }

    // Cari koordinat pelabuhan asal & tujuan dari tabel port
    const ports = await getAllPorts();
    const originPort = ports.find((p) => p.port_name === portFrom);
    const destPort = ports.find((p) => p.port_name === portTo);

    if (!originPort || !destPort) {
      const missing = [!originPort && portFrom, !destPort && portTo].filter(Boolean).join(', ');
      return NextResponse.json(
        { error: `Pelabuhan tidak ditemukan di database: ${missing}` },
        { status: 404 }
      );
    }

    // Ambil status YTD kapal saat ini (untuk akumulasi CII setelah voyage ini)
    let currentYTD = null;
    try {
      currentYTD = await getShipCurrentStatus(shipKey);
    } catch {
      currentYTD = null;
    }

    const currentDate = new Date().toISOString().split('T')[0];
    const year = new Date().getFullYear();

    const result = simulateVoyage({
      shipKey,
      originPort,
      destPort,
      cargoTon: cargo,
      fuelType,
      avgSpeedKnot: avgSpeed,
      currentYTD,
      currentDate,
      year,
    });

    // shipName & dwt ditambahkan di sini supaya dashboard/input/page.js
    // bisa menampilkan info kapal tanpa perlu fetch terpisah.
    return NextResponse.json({
      shipName: ship.name,
      dwt: ship.dwt,
      ...result,
    });
  } catch (error) {
    console.error('[api/input/calculate]', error);
    return NextResponse.json(
      { error: error.message || 'Gagal menghitung CII.' },
      { status: 500 }
    );
  }
}