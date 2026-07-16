#!/usr/bin/env node
/*
 * mock_ais_its_server.js — Server WebSocket TIRUAN untuk AIS ITS
 * =============================================================
 * TUJUAN: mendemokan fitur "streaming kapal live via WebSocket" SEKARANG,
 * sebelum API key AIS ITS asli didapat. Server ini meniru perilaku AIS
 * ITS: menerima pesan subscribe (berisi "Apikey" & filter MMSI), lalu
 * mengirim "position report" terus-menerus — tapi datanya diambil dari
 * data historis 2025 yang diputar seolah-olah realtime.
 *
 * Dengan ini, saat presentasi:
 *   - Peta menampilkan kapal BERGERAK secara live via WebSocket sungguhan.
 *   - Kode klien (lib/aisItsSocket.js) TIDAK perlu diubah — cukup arahkan
 *     NEXT_PUBLIC_AISITS_WS_URL ke ws://localhost:8080.
 *   - Saat API key AIS ITS asli datang, matikan server ini dan ganti URL
 *     ke endpoint AIS ITS. Klien tetap sama.
 *
 * FORMAT PESAN mengikuti konvensi aisstream.io (yang juga dipakai klien),
 * jadi parseMessage() di sisi klien langsung cocok.
 *
 * CARA PAKAI:
 *   npm install ws
 *   node mock_ais_its_server.js
 *   (server jalan di ws://localhost:8080)
 *
 * Lalu di .env.local web:
 *   NEXT_PUBLIC_AISITS_WS_URL=ws://localhost:8080
 *   NEXT_PUBLIC_AISITS_API_KEY=demo-key-apa-saja
 */

const { WebSocketServer } = require('ws')

const PORT = process.env.MOCK_AIS_PORT || 8080

// MMSI dua kapal (samakan dengan lib/aisItsSocket.js).
const SHIPS = {
  klasogun: { mmsi: '525008053', lat: -7.20, lon: 112.80 },
  balongan: { mmsi: '525008118', lat: -8.57, lon: 116.06 },
}

// Buat jalur melingkar sederhana di sekitar posisi awal tiap kapal,
// supaya terlihat "bergerak". (Pengganti data 2025 asli — kalau mau,
// ganti bagian ini dengan pembacaan track asli dari Supabase/CSV.)
function nextPosition(ship, tick) {
  const r = 0.03                       // radius gerak (derajat)
  const angle = (tick % 360) * Math.PI / 180
  return {
    lat: ship.lat + r * Math.sin(angle),
    lon: ship.lon + r * Math.cos(angle),
    sog: 8 + 2 * Math.sin(angle),      // kecepatan 6–10 knot berayun
    cog: (tick * 3) % 360,
    heading: (tick * 3) % 360,
  }
}

const wss = new WebSocketServer({ port: PORT })
console.log(`🛰️  Mock AIS ITS WebSocket berjalan di ws://localhost:${PORT}`)
console.log('   Menunggu koneksi dari dashboard...')

wss.on('connection', (ws) => {
  console.log('✅ Klien terhubung.')
  let mmsiFilter = null    // daftar MMSI yang di-subscribe klien
  let tick = 0
  let timer = null

  ws.on('message', (data) => {
    // Klien mengirim pesan subscribe: { Apikey, BoundingBoxes, FiltersShipMMSI, ... }
    try {
      const sub = JSON.parse(data.toString())
      console.log('   Subscribe diterima. Apikey:',
        sub.Apikey ? '(ada)' : '(kosong)',
        '| MMSI:', sub.FiltersShipMMSI ?? 'semua')
      if (Array.isArray(sub.FiltersShipMMSI) && sub.FiltersShipMMSI.length) {
        mmsiFilter = sub.FiltersShipMMSI.map(String)
      }
    } catch {
      // abaikan pesan non-JSON
    }

    // Mulai streaming posisi tiap 1 detik.
    if (timer) clearInterval(timer)
    timer = setInterval(() => {
      tick += 1
      for (const ship of Object.values(SHIPS)) {
        if (mmsiFilter && !mmsiFilter.includes(ship.mmsi)) continue
        const p = nextPosition(ship, tick)
        // Bentuk pesan meniru aisstream.io position report.
        const message = {
          MessageType: 'PositionReport',
          MetaData: { MMSI: Number(ship.mmsi), time_utc: new Date().toISOString() },
          Message: {
            PositionReport: {
              Latitude: p.lat,
              Longitude: p.lon,
              Sog: p.sog,
              Cog: p.cog,
              TrueHeading: p.heading,
            },
          },
        }
        ws.send(JSON.stringify(message))
      }
    }, 1000)
  })

  ws.on('close', () => {
    console.log('❌ Klien terputus.')
    if (timer) clearInterval(timer)
  })
})