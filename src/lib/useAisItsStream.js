"use client"
// lib/useAisItsStream.js — React hook untuk stream AIS ITS
// ========================================================
// Membungkus connectAisIts() jadi hook yang gampang dipakai komponen.
// Mengembalikan:
//   positions {object}  → { klasogun: {lat,lon,sog,cog,heading,ts}, balongan: {...} }
//                          posisi TERBARU tiap kapal (di-update tiap pesan masuk)
//   status    {string}  → 'unconfigured' | 'connecting' | 'open' | 'closed' | 'error'
//
// Hook ini AMAN dipanggil walau API key belum ada: status akan
// 'unconfigured' dan tidak terjadi koneksi apa pun (tidak error).
//
// Contoh pakai di komponen peta:
//   const { positions, status } = useAisItsStream(true)
//   useEffect(() => {
//     if (positions.klasogun) marker.setLatLng([positions.klasogun.lat, positions.klasogun.lon])
//   }, [positions.klasogun])

import { useEffect, useRef, useState } from "react"
import { connectAisIts, mmsiToShipKey } from "./aisItsSocket"

export function useAisItsStream(enabled = true) {
  const [positions, setPositions] = useState({})  // shipKey → posisi terbaru
  const [status, setStatus] = useState("idle")
  const connRef = useRef(null)

  useEffect(() => {
    if (!enabled) {
      // Kalau di-nonaktifkan, tutup koneksi bila ada.
      connRef.current?.close()
      connRef.current = null
      setStatus("idle")
      return
    }

    const conn = connectAisIts({
      onStatus: setStatus,
      onPosition: (pos) => {
        const key = mmsiToShipKey(pos.mmsi)
        if (!key) return   // abaikan kapal lain yang bukan target
        setPositions(prev => ({ ...prev, [key]: pos }))
      },
    })
    connRef.current = conn

    return () => {
      conn.close()
      connRef.current = null
    }
  }, [enabled])

  return { positions, status }
}