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

  const getVirtualNow = useCallback(() => {
    const a = anchorRef.current
    if (!a.playing) return a.virtualMs
    return clampToSimYear(a.virtualMs + (Date.now() - a.realMs) * a.speed)
  }, [])

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
    virtualDate: toDateStr(virtualTime),
    getVirtualNow,
    speed, setSpeed,
    playing, setPlaying,
  }

  return (
    <SimulationContext.Provider value={value}>
      {children}
    </SimulationContext.Provider>
  )
}

// ─── BAR KONTROL JAM VIRTUAL ─────────────────────────────────
// Badge "LIVE (Simulasi 2025)" + jam virtual + play/pause + kecepatan.

export function SimClockBar() {
  const { virtualTime, speed, setSpeed, playing, setPlaying } = useSimulation()

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
  const dateStr = mounted
    ? d.toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short", year: "numeric" })
    : "—"
  const timeStr = mounted
    ? d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "--.--.--"

  return (
    <div className="flex items-center gap-3 flex-wrap bg-slate-900 text-white rounded-xl px-4 py-2.5">
      {/* Badge live */}
      <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 rounded-full px-2.5 py-1">
        <span className={`w-1.5 h-1.5 rounded-full bg-emerald-400 ${playing ? "animate-pulse" : ""}`} />
        LIVE · Simulasi Data 2025
      </span>

      {/* Jam virtual */}
      <div className="text-sm font-mono tabular-nums">
        <span className="text-slate-300">{dateStr}</span>
        <span className="text-white font-semibold ml-2">{timeStr}</span>
        <span className="text-slate-500 text-xs ml-1.5">WIB</span>
      </div>

      <div className="flex-1" />

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
    </div>
  )
}