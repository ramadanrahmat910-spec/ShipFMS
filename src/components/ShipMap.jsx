"use client"
// components/ShipMap.jsx — ShipCII Dashboard (REWRITE)
// =====================================================
// Peta gaya APBS:
//   - Basemap gelap nautical (CARTO dark)
//   - SEMUA jalur voyage dari database digambar (garis putus-putus biru)
//   - Voyage yang sedang berjalan pada jam virtual di-highlight oranye
//   - Kedua kapal tampil sebagai ikon panah yang berotasi sesuai heading,
//     bergerak mengikuti data AIS 2025 lewat jam virtual (interpolasi antar titik)
//   - Trail (jejak 3 jam terakhir) di belakang tiap kapal
//   - Klik ikon kapal → ganti kapal aktif
//   - Marker pelabuhan dari tabel port
//
// WAJIB: komponen ini di-import secara dynamic dengan ssr:false
// (sudah dilakukan di dashboard/page.js), dan SimulationProvider
// harus membungkusnya.
//
// Props:
//   ships          [{ship_key, name}]
//   selectedKey    string
//   onSelectShip   (shipKey) => void
//   focusVoyageId  number|null — kalau diisi, jalur voyage itu di-highlight
//                   & peta zoom ke sana (dipakai dropdown riwayat perjalanan)

import { useEffect, useRef, useState } from "react"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import { useSimulation } from "@/components/SimulationProvider"
import { toISO, displayYear, formatDbDateDisplay } from "@/lib/simulationClock"

// ─── KONSTANTA TAMPILAN ──────────────────────────────────────
const COLORS = {
  routeIdle:     "#3b82f6",   // jalur voyage biasa (biru, dashed)
  routeDim:      "#475569",   // jalur kapal yang tidak dipilih
  routeActive:   "#f59e0b",   // voyage yang sedang berjalan (oranye)
  routeFocus:    "#14b8a6",   // voyage yang dipilih dari dropdown (teal)
  trail:         "#38bdf8",
  shipSelected:  "#22c55e",
  shipOther:     "#94a3b8",
  port:          "#e2e8f0",
}

const TRAIL_HOURS   = 3          // panjang jejak di belakang kapal
const BUFFER_BACK_H = 5          // buffer AIS: 5 jam ke belakang
const BUFFER_FWD_H  = 4          // dan 4 jam ke depan
const REFETCH_MARGIN_MS = 30 * 60 * 1000  // refetch kalau sisa buffer < 30 menit virtual

// ─── HELPERS ─────────────────────────────────────────────────
function bearingDeg(a, b) {
  const toR = d => d * Math.PI / 180
  const dLon = toR(b.lon - a.lon)
  const y = Math.sin(dLon) * Math.cos(toR(b.lat))
  const x = Math.cos(toR(a.lat)) * Math.sin(toR(b.lat))
        - Math.sin(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.cos(dLon)
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
}

/**
 * Interpolasi posisi kapal pada waktu t dari buffer AIS (sorted by t).
 * Kalau gap antar titik > 2 jam (kapal sandar / data kosong), kapal
 * ditahan di titik terakhir — tidak "terbang" melompati gap.
 */
function positionAt(buf, t) {
  if (!buf || buf.length === 0) return null
  if (t <= buf[0].t) return { ...buf[0], hdg: buf[0].cog }
  if (t >= buf[buf.length - 1].t) {
    const p = buf[buf.length - 1]
    return { ...p, hdg: p.cog }
  }
  let lo = 0, hi = buf.length - 1
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1
    if (buf[m].t <= t) lo = m; else hi = m
  }
  const a = buf[lo], b = buf[hi]
  if (b.t - a.t > 2 * 3600 * 1000) return { ...a, hdg: a.cog }   // gap besar → tahan
  const f = (t - a.t) / (b.t - a.t)
  const moved = Math.abs(b.lat - a.lat) > 1e-5 || Math.abs(b.lon - a.lon) > 1e-5
  return {
    lat: a.lat + (b.lat - a.lat) * f,
    lon: a.lon + (b.lon - a.lon) * f,
    sog: a.sog ?? b.sog ?? 0,
    hdg: moved ? bearingDeg(a, b) : (a.cog ?? 0),
    t,
  }
}

function trailPoints(buf, t, hours = TRAIL_HOURS) {
  if (!buf) return []
  const from = t - hours * 3600 * 1000
  return buf.filter(p => p.t >= from && p.t <= t).map(p => [p.lat, p.lon])
}

function shipDivIcon(color, selected) {
  const size = selected ? 30 : 22
  const glow = selected ? `filter: drop-shadow(0 0 6px ${color});` : ""
  return L.divIcon({
    className: "ship-icon",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `
      <div class="ship-rot" style="width:${size}px;height:${size}px;transform:rotate(0deg);transition:transform .4s linear;${glow}">
        <svg viewBox="0 0 24 24" width="${size}" height="${size}">
          <path d="M12 2 L19 20 L12 15.5 L5 20 Z"
                fill="${color}" stroke="#0f172a" stroke-width="1"/>
        </svg>
      </div>`,
  })
}

// ─── KOMPONEN ────────────────────────────────────────────────
export default function ShipMap({ ships = [], selectedKey, onSelectShip, focusVoyageId = null, livePositions = {} }) {
  const { getVirtualNow } = useSimulation()

  // [FIX] Root cause dari crash "Cannot read properties of undefined
  // (reading 'min')": kita menambahkan Polyline ke map SEBELUM Leaflet
  // benar-benar selesai inisialisasi (pixel origin / ukuran container
  // belum settle), sehingga perhitungan bounds internal Leaflet gagal.
  // Ini muncul async (lewat requestAnimationFrame internal Leaflet saat
  // render vector layer), makanya lolos dari try/catch sinkron kita.
  // Solusi: tunggu map.whenReady() dulu, tandai lewat state `mapReady`,
  // dan baru fetch/gambar apa pun setelah itu benar-benar true.
  const [mapReady, setMapReady] = useState(false)
  // [BARU] Toggle "Tampilkan semua jalur histori" — default MATI supaya
  // peta tidak langsung penuh sarang laba-laba dari ~100+ voyage kedua
  // kapal sekaligus. Saat mati: hanya voyage yang SEDANG BERJALAN (live)
  // dan/atau voyage yang di-fokus dari dropdown riwayat yang tampil.
  const [showAllRoutes, setShowAllRoutes] = useState(false)

  const mapRef      = useRef(null)   // instance L.Map
  const containerRef= useRef(null)
  const stateRef    = useRef({
    routes:   {},   // shipKey → [{voyage_id, dep, arr, from_port, to_port, line: L.Polyline}]
    buffers:  {},   // shipKey → { start, end, points[], loading }
    markers:  {},   // shipKey → { marker, trail: L.Polyline, el }
    portLayer: null,
    followed: true,
  })
  const propsRef = useRef({ selectedKey, focusVoyageId, onSelectShip, ships, showAllRoutes, livePositions })
  propsRef.current = { selectedKey, focusVoyageId, onSelectShip, ships, showAllRoutes, livePositions }

  // ── Init peta (sekali) ──
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return
    const map = L.map(containerRef.current, {
      center: [-7.15, 112.75],   // Selat Madura — area operasi kedua kapal
      zoom: 9,
      zoomControl: true,
      attributionControl: true,
    })
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      maxZoom: 18,
    }).addTo(map)
    mapRef.current = map

    // [FIX] ResizeObserver: paksa Leaflet menghitung ulang ukuran kalau
    // container berubah dimensi (mis. karena layout di atasnya masih
    // loading saat peta pertama kali dibuat). Tanpa ini, map bisa
    // "terjebak" di ukuran 0 dan bikin semua perhitungan bounds gagal.
    const ro = new ResizeObserver(() => map.invalidateSize())
    ro.observe(containerRef.current)

    // [FIX] Tunggu Leaflet BENAR-BENAR siap (pixel origin & size sudah
    // settle) sebelum menandai peta ready. Semua fetch/gambar layer
    // vector (jalur, marker) menunggu flag ini via effect lain di bawah.
    map.whenReady(() => {
      map.invalidateSize()
      setMapReady(true)
    })

    return () => {
      ro.disconnect()
      map.remove()
      mapRef.current = null
      setMapReady(false)
    }
  }, [])

  // ── Pelabuhan (setelah map benar-benar siap) ──
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady || stateRef.current.portLayer) return
    fetch("/api/ships/klasogun/sim?mode=ports")
      .then(r => r.json())
      .then(d => {
        if (!mapRef.current) return   // map sempat di-unmount saat fetch berjalan
        const layer = L.layerGroup()
        ;(d.ports ?? []).forEach(p => {
          L.circleMarker([p.lat, p.lon], {
            radius: 4, color: COLORS.port, weight: 1.5,
            fillColor: "#0f172a", fillOpacity: 1,
          })
            .bindTooltip(p.port_name, { direction: "top", offset: [0, -6] })
            .addTo(layer)
        })
        layer.addTo(map)
        stateRef.current.portLayer = layer
      })
      .catch(() => {})
  }, [mapReady])

  // ── Muat SEMUA jalur voyage per kapal (sekali per kapal) ──
  useEffect(() => {
    if (!mapRef.current || !mapReady || ships.length === 0) return
    const st = stateRef.current

    ships.forEach(s => {
      if (st.routes[s.ship_key]) return   // sudah dimuat
      st.routes[s.ship_key] = []          // tandai sedang dimuat
      fetch(`/api/ships/${s.ship_key}/sim?mode=routes`)
        .then(r => r.json())
        .then(d => {
          // [FIX] pakai mapRef.current SEGAR di sini (bukan variabel `map`
          // yang di-capture di awal effect) — kalau peta sempat di-unmount
          // & dibuat ulang selagi fetch berjalan, kita tidak menempelkan
          // layer ke instance map yang sudah tidak berlaku lagi.
          const map = mapRef.current
          if (!map) return

          const voyagesData = d.voyages ?? []
          const skipped = voyagesData.filter(v => !v.track || v.track.length < 2).length
          if (skipped > 0) {
            console.warn(`ShipMap: ${skipped} voyage(s) untuk ${s.ship_key} dilewati (track < 2 titik).`)
          }
          st.routes[s.ship_key] = voyagesData
            .filter(v => v.track && v.track.length >= 2)   // jaga-jaga: cegah polyline 1 titik crash Leaflet
            .map(v => {
              // try/catch per-voyage: satu voyage bermasalah tidak
              // menjatuhkan seluruh peta — cukup dilewati & dicatat.
              try {
                // [FIX] noClip:true — melewati fungsi internal Leaflet
                // _clipPoints() yang menjadi sumber crash "reading 'min'
                // of undefined". Fungsi itu memotong garis di luar
                // viewport untuk optimasi performa, tapi pada kombinasi
                // versi Leaflet + Next.js/Turbopack tertentu, perhitungan
                // pxBounds-nya gagal walau koordinat valid. noClip
                // membuat Leaflet menggambar garis apa adanya tanpa
                // clipping — aman untuk jumlah garis sekecil ini (~100-200).
                const line = L.polyline(v.track, {
                  color: COLORS.routeIdle, weight: 1.5, opacity: 0.55,
                  dashArray: "4 5", noClip: true,
                })
                  .bindTooltip(
                    `${v.from_port ?? "?"} → ${v.to_port ?? "?"}<br/><span style="opacity:.7">${v.date_departure ? formatDbDateDisplay(v.date_departure, s.ship_key) : ""}</span>`,
                    { sticky: true }
                  )
                return {
                  voyage_id: v.voyage_id,
                  dep: v.date_departure ? new Date(v.date_departure).getTime() : null,
                  arr: v.date_arrived   ? new Date(v.date_arrived).getTime() + 86399000 : null,
                  line,
                }
              } catch (e) {
                console.error(`ShipMap: gagal gambar voyage_id=${v.voyage_id} (${s.ship_key}):`, e, v.track)
                return null
              }
            })
            .filter(Boolean)
          restyleRoutes()
        })
        .catch(err => console.error("routes fetch:", err))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ships, mapReady])

  // ── Restyle jalur saat kapal aktif / fokus voyage / toggle histori berubah ──
  function restyleRoutes() {
    const map = mapRef.current
    const st = stateRef.current
    // Baca dari propsRef (bukan closure langsung) supaya SELALU dapat nilai
    // terbaru, walau dipanggil dari effect lama yang closure-nya beku
    // (mis. loop animasi yang deps-nya tidak termasuk showAllRoutes).
    const { selectedKey, focusVoyageId, showAllRoutes } = propsRef.current
    const vNow = getVirtualNow()

    Object.entries(st.routes).forEach(([key, list]) => {
      const isSelectedShip = key === selectedKey
      list.forEach(r => {
        const isFocus  = focusVoyageId != null && r.voyage_id === focusVoyageId
        const isActive = isSelectedShip && r.dep != null && r.arr != null
                       && vNow >= r.dep && vNow <= r.arr
        const shouldShow = showAllRoutes || isFocus || isActive

        // [BARU] Sembunyikan betul-betul (removeLayer), bukan cuma opacity 0 —
        // supaya tooltip/hover-nya juga tidak "nyangkut" saat disembunyikan.
        if (!shouldShow) {
          if (map && map.hasLayer(r.line)) map.removeLayer(r.line)
          return
        }
        if (map && !map.hasLayer(r.line)) r.line.addTo(map)

        if (isFocus) {
          r.line.setStyle({ color: COLORS.routeFocus, weight: 3.5, opacity: 0.95, dashArray: null })
          r.line.bringToFront()
        } else if (isActive) {
          r.line.setStyle({ color: COLORS.routeActive, weight: 3, opacity: 0.95, dashArray: null })
          r.line.bringToFront()
        } else {
          r.line.setStyle({
            color: isSelectedShip ? COLORS.routeIdle : COLORS.routeDim,
            weight: 1.5,
            opacity: isSelectedShip ? 0.55 : 0.3,
            dashArray: "4 5",
          })
        }
      })
    })
  }

  useEffect(() => {
    restyleRoutes()
    // Zoom ke voyage yang dipilih dari dropdown
    if (focusVoyageId != null) {
      const st = stateRef.current
      for (const list of Object.values(st.routes)) {
        const r = list.find(x => x.voyage_id === focusVoyageId)
        if (r) { mapRef.current?.fitBounds(r.line.getBounds(), { padding: [30, 30] }); break }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey, focusVoyageId, showAllRoutes])

  // ── Buffer AIS per kapal ──
  async function ensureBuffer(shipKey, vNow) {
    const st  = stateRef.current
    let buf = st.buffers[shipKey]
    const need =
      !buf ||
      (!buf.loading && (
        vNow < buf.start ||
        vNow > buf.end - REFETCH_MARGIN_MS
      ))
    if (!need) return
    if (buf?.loading) return

    const start = vNow - BUFFER_BACK_H * 3600 * 1000
    const end   = vNow + BUFFER_FWD_H  * 3600 * 1000
    st.buffers[shipKey] = { ...(buf ?? {}), loading: true, start: buf?.start ?? start, end: buf?.end ?? end, points: buf?.points ?? [] }

    try {
      const res = await fetch(
        `/api/ships/${shipKey}/sim?mode=window&start=${encodeURIComponent(toISO(start))}&end=${encodeURIComponent(toISO(end))}`
      )
      const d = await res.json()
      const points = (d.track ?? []).map(p => ({
        t: new Date(p.base_datetime).getTime(),
        lat: p.lat, lon: p.lon,
        sog: p.sog, cog: p.cog ?? p.heading,
      }))
      stateRef.current.buffers[shipKey] = { start, end, points, loading: false }
    } catch (e) {
      console.error("AIS window fetch:", e)
      stateRef.current.buffers[shipKey] = { start, end, points: [], loading: false }
    }
  }

  // ── Marker kapal + loop animasi ──
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady || ships.length === 0) return
    const st = stateRef.current

    // Buat marker sekali per kapal
    ships.forEach(s => {
      if (st.markers[s.ship_key]) return
      const selected = s.ship_key === propsRef.current.selectedKey
      const color = selected ? COLORS.shipSelected : COLORS.shipOther
      const marker = L.marker([-7.15, 112.75], {
        icon: shipDivIcon(color, selected),
        zIndexOffset: selected ? 1000 : 500,
      })
        .bindTooltip("", { direction: "top", offset: [0, -12] })
        .on("click", () => propsRef.current.onSelectShip?.(s.ship_key))
        .addTo(map)
      const trail = L.polyline([], {
        color: COLORS.trail, weight: 2.5, opacity: 0.8, noClip: true,
      }).addTo(map)
      st.markers[s.ship_key] = { marker, trail }
    })

    // Loop animasi ~5 fps (cukup mulus, hemat CPU)
    let raf, last = 0, lastRestyle = 0
    const tick = (ts) => {
      raf = requestAnimationFrame(tick)
      if (ts - last < 200) return
      last = ts
      const vNow = getVirtualNow()
      const { selectedKey, livePositions } = propsRef.current

      ships.forEach(s => {
        const m = st.markers[s.ship_key]
        if (!m) return

        // [BARU] Prioritaskan posisi LIVE dari WebSocket AIS ITS bila ada
        // & masih baru (< 30 dtk). Kalau tidak ada (WS belum konek / belum
        // ada API key), jatuh balik ke data simulasi 2025 seperti biasa.
        const lp = livePositions?.[s.ship_key]
        const liveFresh = lp && (Date.now() - (lp.ts ?? 0) < 30000)

        let pos = null
        if (liveFresh) {
          pos = { lat: lp.lat, lon: lp.lon, sog: lp.sog, hdg: lp.heading ?? lp.cog }
        } else {
          ensureBuffer(s.ship_key, vNow)
          const buf = st.buffers[s.ship_key]
          if (!buf) return
          pos = positionAt(buf.points, vNow)
        }
        if (!pos) return

        m.marker.setLatLng([pos.lat, pos.lon])
        // Rotasi ikon
        const el = m.marker.getElement()?.querySelector(".ship-rot")
        if (el && pos.hdg != null) el.style.transform = `rotate(${Math.round(pos.hdg)}deg)`
        // Tooltip info — tandai LIVE bila dari WebSocket
        m.marker.setTooltipContent(
          `<b>${s.name}</b>${liveFresh ? ' <span style="color:#f87171">● LIVE</span>' : ''}<br/>` +
          `Speed: ${pos.sog != null ? Number(pos.sog).toFixed(1) : "—"} kn · COG: ${pos.hdg != null ? Math.round(pos.hdg) : "—"}°`
        )
        // Trail — hanya untuk mode simulasi (WS live: trail dibangun bertahap)
        if (liveFresh) {
          const arr = m._liveTrail ?? (m._liveTrail = [])
          arr.push([pos.lat, pos.lon])
          if (arr.length > 200) arr.shift()
          m.trail.setLatLngs(arr)
        } else {
          const buf = st.buffers[s.ship_key]
          const pts = trailPoints(buf.points, vNow)
          pts.push([pos.lat, pos.lon])
          m.trail.setLatLngs(pts)
        }
        m.trail.setStyle({ opacity: s.ship_key === selectedKey ? 0.85 : 0.35 })
      })

      // Restyle jalur aktif tiap ±5 detik (murah, cek dep/arr saja)
      if (ts - lastRestyle > 5000) { lastRestyle = ts; restyleRoutes() }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ships, mapReady])

  // ── Update warna ikon saat kapal aktif berubah ──
  useEffect(() => {
    const st = stateRef.current
    Object.entries(st.markers).forEach(([key, m]) => {
      const selected = key === selectedKey
      m.marker.setIcon(shipDivIcon(selected ? COLORS.shipSelected : COLORS.shipOther, selected))
      m.marker.setZIndexOffset(selected ? 1000 : 500)
    })
    // Pan lembut ke kapal aktif
    const m = st.markers[selectedKey]
    if (m && mapRef.current) {
      const ll = m.marker.getLatLng()
      if (ll && !mapRef.current.getBounds().contains(ll)) {
        mapRef.current.panTo(ll, { animate: true })
      }
    }
  }, [selectedKey])

  return (
    <div className="relative bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      {/* Header overlay */}
      <div className="absolute top-3 left-3 z-[500] bg-slate-900/85 backdrop-blur text-white text-xs rounded-lg px-3 py-2 border border-slate-700">
        <div className="font-semibold">Peta Pergerakan Kapal</div>
        <div className="text-slate-400 mt-0.5">Jalur & posisi dari data AIS {displayYear(selectedKey)}</div>
      </div>
      {/* [BARU] Toggle tampilkan semua jalur histori — default mati */}
      <button
        onClick={() => setShowAllRoutes(v => !v)}
        className={`absolute top-3 right-3 z-[500] text-xs px-3 py-2 rounded-lg border backdrop-blur transition-colors ${
          showAllRoutes
            ? "bg-blue-600/90 border-blue-400 text-white"
            : "bg-slate-900/85 border-slate-700 text-slate-300 hover:bg-slate-800"
        }`}
      >
        {showAllRoutes ? "✓ Semua jalur histori" : "Tampilkan semua jalur histori"}
      </button>
      {/* Legenda */}
      <div className="absolute bottom-3 right-3 z-[500] bg-slate-900/85 backdrop-blur text-slate-200 text-[11px] rounded-lg px-3 py-2 border border-slate-700 flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="inline-block w-5 border-t-2 border-dashed" style={{ borderColor: COLORS.routeIdle }} />
          {showAllRoutes ? "Jalur voyage (histori)" : "Jalur histori (disembunyikan)"}
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block w-5 border-t-[3px]" style={{ borderColor: COLORS.routeActive }} />
          Voyage sedang berjalan
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block w-5 border-t-2" style={{ borderColor: COLORS.trail }} />
          Jejak 3 jam terakhir
        </div>
        <div className="flex items-center gap-2">
          <svg viewBox="0 0 24 24" width="12" height="12"><path d="M12 2 L19 20 L12 15.5 L5 20 Z" fill={COLORS.shipSelected}/></svg>
          Kapal aktif (klik panah untuk ganti)
        </div>
      </div>
      <div ref={containerRef} className="w-full h-[440px]" />
    </div>
  )
}