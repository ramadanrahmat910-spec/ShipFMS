// lib/aisItsSocket.js — Klien WebSocket AIS ITS (Ship-FMS)
// =========================================================
// Modul ini menghubungkan dashboard ke stream AIS realtime lewat
// WebSocket. Saat ini API key AIS ITS BELUM tersedia, jadi endpoint &
// key dibiarkan sebagai placeholder di .env. Begitu API key didapat,
// CUKUP isi dua variabel environment berikut — TANPA mengubah kode:
//
//   NEXT_PUBLIC_AISITS_WS_URL   = wss://<endpoint-ais-its>/stream
//   NEXT_PUBLIC_AISITS_API_KEY  = <api-key-dari-ais-its>
//
// Pola koneksi mengikuti standar layanan AIS-over-WebSocket pada umumnya
// (mis. aisstream.io): buka koneksi → kirim pesan subscribe berisi API
// key + filter (bounding box & daftar MMSI) → terima "position report"
// terus-menerus. Kalau format AIS ITS ternyata sedikit berbeda, yang
// perlu disesuaikan HANYA dua fungsi kecil di bawah: buildSubscribeMsg()
// dan parseMessage(). Sisanya (reconnect, lifecycle) tidak berubah.

// ─── KONFIG DARI ENVIRONMENT ─────────────────────────────────
// Dibaca dari .env. Placeholder aman: kalau belum diisi, klien tidak
// mencoba konek (lihat isConfigured()).
export const AISITS_WS_URL  = process.env.NEXT_PUBLIC_AISITS_WS_URL  || ''
export const AISITS_API_KEY = process.env.NEXT_PUBLIC_AISITS_API_KEY || ''

// MMSI dua kapal yang dipantau (dari data: Klasogun & Balongan).
// Nanti feed AIS ITS difilter HANYA ke MMSI ini supaya tidak menerima
// ribuan kapal lain di area yang sama.
export const SHIP_MMSI = {
  klasogun: '525008053',
  balongan: '525008118',
}

// Bounding box perairan operasi (Jawa Timur–Madura–Bali–Lombok).
// Format [ [latMin, lonMin], [latMax, lonMax] ] — silakan sesuaikan
// bila AIS ITS memakai urutan berbeda.
export const AISITS_BBOX = [[-11.0, 103.5], [-4.0, 125.0]]

/** Apakah konfigurasi AIS ITS sudah lengkap (URL + API key terisi)? */
export function isConfigured() {
  return Boolean(AISITS_WS_URL && AISITS_API_KEY)
}

// ─── PENYUSUN PESAN SUBSCRIBE ────────────────────────────────
// [SESUAIKAN BILA PERLU] Struktur pesan subscribe. Format di bawah
// mengikuti konvensi aisstream.io. Kalau dokumentasi AIS ITS memakai
// nama field lain, ubah DI SINI saja.
export function buildSubscribeMsg(mmsiList = Object.values(SHIP_MMSI)) {
  return {
    Apikey: AISITS_API_KEY,            // ← API key AIS ITS masuk di sini
    BoundingBoxes: [AISITS_BBOX],
    FiltersShipMMSI: mmsiList,
    FilterMessageTypes: ['PositionReport'],
  }
}

// ─── PARSER PESAN MASUK ──────────────────────────────────────
// [SESUAIKAN BILA PERLU] Ubah pesan mentah dari AIS ITS menjadi bentuk
// seragam yang dipakai peta: { mmsi, lat, lon, sog, cog, heading, ts }.
// Return null kalau pesan bukan position report / tidak lengkap.
export function parseMessage(raw) {
  let msg
  try {
    msg = typeof raw === 'string' ? JSON.parse(raw) : raw
  } catch {
    return null
  }

  // Bentuk aisstream.io: { MessageType, MetaData:{MMSI,...},
  //   Message:{ PositionReport:{ Latitude, Longitude, Sog, Cog, TrueHeading } } }
  const pr = msg?.Message?.PositionReport
  const meta = msg?.MetaData
  if (pr && meta) {
    return {
      mmsi:    String(meta.MMSI ?? ''),
      lat:     Number(pr.Latitude),
      lon:     Number(pr.Longitude),
      sog:     pr.Sog != null ? Number(pr.Sog) : null,
      cog:     pr.Cog != null ? Number(pr.Cog) : null,
      heading: pr.TrueHeading != null ? Number(pr.TrueHeading) : null,
      ts:      meta.time_utc ? new Date(meta.time_utc).getTime() : Date.now(),
    }
  }

  // Bentuk generik/datar (kalau AIS ITS mengirim flat JSON):
  //   { mmsi, lat/latitude, lon/longitude, sog, cog, heading, timestamp }
  const lat = msg.lat ?? msg.latitude
  const lon = msg.lon ?? msg.longitude
  if (lat != null && lon != null) {
    return {
      mmsi:    String(msg.mmsi ?? msg.MMSI ?? ''),
      lat:     Number(lat),
      lon:     Number(lon),
      sog:     msg.sog != null ? Number(msg.sog) : null,
      cog:     msg.cog != null ? Number(msg.cog) : null,
      heading: msg.heading != null ? Number(msg.heading) : null,
      ts:      msg.timestamp ? new Date(msg.timestamp).getTime() : Date.now(),
    }
  }

  return null
}

/** Peta MMSI → shipKey (kebalikan SHIP_MMSI), untuk routing ke marker. */
export function mmsiToShipKey(mmsi) {
  const m = String(mmsi)
  for (const [key, val] of Object.entries(SHIP_MMSI)) {
    if (val === m) return key
  }
  return null
}

// ─── KLIEN WEBSOCKET DENGAN AUTO-RECONNECT ───────────────────
// connectAisIts() membuka koneksi dan memanggil callback pada tiap
// posisi baru. Mengembalikan objek dengan .close() untuk memutus.
//
// Pemakaian:
//   const conn = connectAisIts({
//     onPosition: (pos) => { ... gerakkan marker ... },
//     onStatus:   (s)   => { ... 'connecting'|'open'|'closed'|'error' ... },
//   })
//   // nanti: conn.close()
export function connectAisIts({ onPosition, onStatus, mmsiList } = {}) {
  if (!isConfigured()) {
    onStatus?.('unconfigured')
    console.warn('[aisIts] URL/API key belum di-set — koneksi dilewati. ' +
      'Isi NEXT_PUBLIC_AISITS_WS_URL & NEXT_PUBLIC_AISITS_API_KEY di .env.')
    return { close() {} }
  }

  let ws = null
  let closedByUser = false
  let retry = 0
  const MAX_RETRY_DELAY = 15000   // batas jeda reconnect (ms)

  function open() {
    onStatus?.('connecting')
    ws = new WebSocket(AISITS_WS_URL)

    ws.onopen = () => {
      retry = 0
      onStatus?.('open')
      // Kirim pesan subscribe (API key + filter) segera setelah terhubung.
      ws.send(JSON.stringify(buildSubscribeMsg(mmsiList)))
    }

    ws.onmessage = (event) => {
      const pos = parseMessage(event.data)
      if (pos) onPosition?.(pos)
    }

    ws.onerror = () => onStatus?.('error')

    ws.onclose = () => {
      onStatus?.('closed')
      if (closedByUser) return
      // Exponential backoff: 1s, 2s, 4s, ... maksimal 15s.
      const delay = Math.min(MAX_RETRY_DELAY, 1000 * 2 ** retry)
      retry += 1
      setTimeout(() => { if (!closedByUser) open() }, delay)
    }
  }

  open()

  return {
    close() {
      closedByUser = true
      try { ws?.close() } catch {}
    },
  }
}