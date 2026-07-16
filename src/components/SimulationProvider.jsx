"use client"
// components/SimulationProvider.jsx — ShipCII Dashboard
// ======================================================
// Context penyedia jam virtual 2025 untuk seluruh dashboard.
//
// Pemakaian:
//   <SimulationProvider>
//     ... komponen apa pun boleh panggil useSimulation() ...
//   </SimulationProvider>
//
// useSimulation() mengembalikan:
//   virtualTime   {number}   ms virtual (state, di-update tiap 1 detik → aman untuk render UI)
//   virtualDate   {string}   'YYYY-MM-DD' dari virtualTime
//   getVirtualNow {function} hitung ms virtual presisi saat dipanggil
//                            (untuk animasi peta via requestAnimationFrame,
//                             TIDAK memicu re-render)
//   speed, setSpeed, playing, setPlaying

import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react"
import {
  anchoredVirtualNow, clampToSimYear, toDateStr, SPEED_OPTIONS,
  formatDisplayDate, displayYear,
} from "@/lib/simulationClock"

const SimulationContext = createContext(null)

export function useSimulation() {
  const ctx = useContext(SimulationContext)
  if (!ctx) throw new Error("useSimulation harus dipakai di dalam <SimulationProvider>")
  return ctx
}

export default function SimulationProvider({ children, initialSpeed = 60 }) {
  // Anchor disimpan di ref supaya getVirtualNow() stabil & presisi
  const anchorRef = useRef({
    realMs:    Date.now(),
    virtualMs: anchoredVirtualNow(),
    speed:     initialSpeed,
    playing:   true,
  })

  const [speed,   setSpeedState]   = useState(initialSpeed)
  const [playing, setPlayingState] = useState(true)
  const [virtualTime, setVirtualTime] = useState(anchorRef.current.virtualMs)

  // State untuk mode Realtime
  const [isRealtimeMode, setIsRealtimeModeState] = useState(false)
  const modeRef = useRef(false)
  
  const getVirtualNow = useCallback(() => {
    if (modeRef.current) return Date.now()

    const a = anchorRef.current
    if (!a.playing) return a.virtualMs
    return clampToSimYear(a.virtualMs + (Date.now() - a.realMs) * a.speed)
  }, [])

  const setIsRealtimeMode = useCallback((val) => {
    modeRef.current = val
    setIsRealtimeModeState(val)
    if (!val) {
      anchorRef.current.realMs = Date.now()
    }
    setVirtualTime(val ? Date.now() : getVirtualNow())
  }, [getVirtualNow])

  // Rebase anchor setiap kali speed / playing berubah,
  // supaya waktu virtual tidak melompat.
  const rebase = useCallback(() => {
    const now = getVirtualNow()
    anchorRef.current.virtualMs = now
    anchorRef.current.realMs    = Date.now()
    return now
  }, [getVirtualNow])

  const setSpeed = useCallback((s) => {
    rebase()
    anchorRef.current.speed = s
    setSpeedState(s)
  }, [rebase])

  const setPlaying = useCallback((p) => {
    rebase()
    anchorRef.current.playing = p
    setPlayingState(p)
  }, [rebase])

  // Ticker 1 detik untuk state UI (angka-angka dashboard)
  useEffect(() => {
    const id = setInterval(() => setVirtualTime(getVirtualNow()), 1000)
    return () => clearInterval(id)
  }, [getVirtualNow])

  const value = {
    virtualTime,
    virtualDate: isRealtimeMode ? new Date(virtualTime).toISOString().split('T')[0] : toDateStr(virtualTime),
    getVirtualNow,
    speed, setSpeed,
    playing, setPlaying,
    isRealtimeMode, setIsRealtimeMode,
  }

  return (
    <SimulationContext.Provider value={value}>
      {children}
    </SimulationContext.Provider>
  )
}

// ─── BAR KONTROL JAM VIRTUAL ─────────────────────────────────
// Badge "LIVE (Simulasi 2025)" + jam virtual + play/pause + kecepatan.

export function SimClockBar({ shipKey = null }) {
  const { virtualTime, speed, setSpeed, playing, setPlaying, isRealtimeMode, setIsRealtimeMode } = useSimulation()

  // [FIX] Hydration mismatch: Date.now()-derived text di-render sekali
  // di server, lalu di-hydrate di browser sepersekian detik kemudian —
  // detiknya bisa beda, bikin React komplain "server text didn't match
  // client". Solusi standar Next.js: tunda konten yang bergantung waktu
  // sampai komponen benar-benar mounted di client (render placeholder
  // statis dulu — placeholder ini SAMA baik di server maupun di render
  // pertama client, jadi hydration selalu cocok).
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const d = new Date(virtualTime)
  // Tanggal ditampilkan +offset tahun (mis. Balongan → 2026) HANYA saat
  // mode simulasi. Mode realtime pakai tanggal asli. Jam tak digeser.
  const dateStr = mounted
    ? (isRealtimeMode
        ? d.toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short", year: "numeric" })
        : formatDisplayDate(virtualTime, shipKey, { weekday: "short", day: "numeric", month: "short", year: "numeric" }))
    : "—"
  const timeStr = mounted
    ? d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "--.--.--"

  return (
    <div className="flex items-center gap-3 flex-wrap bg-slate-900 text-white rounded-xl px-4 py-2.5">
      {/* Tombol Toggle Mode */}
      <button
        onClick={() => setIsRealtimeMode(!isRealtimeMode)}
        className={`inline-flex items-center gap-1.5 text-xs font-medium rounded-full px-2.5 py-1 transition-colors ${
          isRealtimeMode 
            ? "bg-red-500/15 text-red-300 border border-red-500/30 hover:bg-red-500/25" 
            : "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25"
        }`}
        title="Klik untuk beralih antara Mode Realtime dan Mode Simulasi Historis"
      >
        <span className={`w-1.5 h-1.5 rounded-full ${isRealtimeMode ? "bg-red-400 animate-pulse" : "bg-emerald-400"} ${!isRealtimeMode && playing ? "animate-pulse" : ""}`} />
        {isRealtimeMode ? "LIVE · Data Sensor Realtime" : `LIVE · Simulasi Data ${displayYear(shipKey)}`}
      </button>

      {/* Jam virtual */}
      <div className="text-sm font-mono tabular-nums">
        <span className="text-slate-300">{dateStr}</span>
        <span className="text-white font-semibold ml-2">{timeStr}</span>
        <span className="text-slate-500 text-xs ml-1.5">WIB</span>
      </div>

      <div className="flex-1" />

      {/* Kontrol hanya muncul jika dalam mode simulasi */}
      {!isRealtimeMode && (
        <>
          {/* Play / pause */}
          <button
            onClick={() => setPlaying(!playing)}
            className="text-xs px-2.5 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 transition-colors"
            title={playing ? "Jeda simulasi" : "Jalankan simulasi"}
          >
            {playing ? "⏸ Jeda" : "▶ Jalan"}
          </button>

          {/* Kecepatan */}
          <div className="flex items-center gap-1">
            {[
              { value: 1,    label: "1×"   },
              { value: 60,   label: "60×"  },
              { value: 600,  label: "600×" },
              { value: 3600, label: "3600×" },
            ].map(opt => (
              <button
                key={opt.value}
                onClick={() => setSpeed(opt.value)}
                className={`text-xs px-2 py-1 rounded-lg transition-colors ${
                  speed === opt.value
                    ? "bg-emerald-500 text-white font-semibold"
                    : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}