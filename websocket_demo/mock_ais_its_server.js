#!/usr/bin/env node
/*
 * mock_ais_its_server.js — Server WebSocket TIRUAN untuk AIS ITS
 * =============================================================
 * Disesuaikan untuk mengambil titik koordinat (track) langsung 
 * dari tabel ais_tracking di database Supabase secara dinamis.
 */

const { WebSocketServer } = require('ws')
const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

// 1. Parse .env.local untuk mendapatkan kredensial Supabase
const envPath = path.resolve(process.cwd(), '.env.local')
const env = {}
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8')
  content.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/)
    if (match) {
      env[match[1].trim()] = match[2].trim().replace(/^"|"$/g, '').replace(/^'|'$/g, '')
    }
  })
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Gagal: Supabase URL atau Key tidak ditemukan di .env.local")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)
const PORT = process.env.MOCK_AIS_PORT || 8080

// MMSI dua kapal
const SHIPS = {
  klasogun: { mmsi: '525008053' },
  balongan: { mmsi: '525008118' },
}

// State penyimpanan titik koordinat dari DB
const dbTracks = {
  '525008053': [],
  '525008118': []
}

// Fungsi untuk membaca rute AIS dari database
async function loadTracks() {
  console.log("⏳ Membaca data rute AIS dari database Supabase...")
  
  for (const shipKey in SHIPS) {
    const mmsi = SHIPS[shipKey].mmsi
    
    // Ambil 1000 titik koordinat terbaru dari database untuk di loop
    const { data, error } = await supabase
      .from('ais_tracking')
      .select('lat, lon, sog, cog, true_heading, timestamp')
      .eq('mmsi', mmsi)
      .order('timestamp', { ascending: false })
      .limit(1000)
      
    if (error) {
      console.error(`❌ Gagal load rute ${shipKey}:`, error)
    } else if (data && data.length > 0) {
      // Reverse array agar titiknya maju secara berurutan (lama ke baru)
      dbTracks[mmsi] = data.reverse()
      console.log(`✅ Berhasil memuat ${data.length} titik koordinat untuk ${shipKey} (MMSI: ${mmsi})`)
    } else {
      console.log(`⚠️ Tidak ada data ditemukan untuk ${shipKey} (MMSI: ${mmsi})`)
    }
  }
}

function nextPosition(mmsi, tick) {
  const track = dbTracks[mmsi]
  if (!track || track.length === 0) {
    return { lat: 0, lon: 0, sog: 0, cog: 0, heading: 0 }
  }
  
  // Ambil titik koordinat secara berurutan (loop kembali ke awal jika sudah di titik terakhir)
  // Untuk simulasi realtime yang dinamis, kita loncat perlahan sepanjang titik
  const index = tick % track.length
  const p = track[index]
  
  return { 
    lat: p.lat, 
    lon: p.lon, 
    sog: p.sog ?? 10, 
    cog: p.cog ?? 0, 
    heading: p.true_heading ?? p.cog ?? 0 
  }
}

(async () => {
  await loadTracks()
  
  const wss = new WebSocketServer({ port: PORT })
  console.log(`\n🛰️  Mock AIS ITS WebSocket berjalan di ws://localhost:${PORT}`)
  console.log('   Sumber Data: Database Supabase (Tabel ais_tracking)')
  console.log('   Menunggu koneksi dari dashboard...')
  
  wss.on('connection', (ws) => {
    console.log('🔗 Klien terhubung dari Dashboard.')
    let mmsiFilter = null
    let tick = 0
    let timer = null
  
    ws.on('message', (data) => {
      try {
        const sub = JSON.parse(data.toString())
        if (Array.isArray(sub.FiltersShipMMSI) && sub.FiltersShipMMSI.length) {
          mmsiFilter = sub.FiltersShipMMSI.map(String)
        }
      } catch {
        // Abaikan
      }
  
      if (timer) clearInterval(timer)
      
      // Kirim koordinat setiap 1 detik
      timer = setInterval(() => {
        tick += 1
        for (const shipKey in SHIPS) {
          const mmsi = SHIPS[shipKey].mmsi
          if (mmsiFilter && !mmsiFilter.includes(mmsi)) continue
          
          const p = nextPosition(mmsi, tick)
          
          const message = {
            MessageType: 'PositionReport',
            MetaData: { MMSI: Number(mmsi), time_utc: new Date().toISOString() },
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
})()