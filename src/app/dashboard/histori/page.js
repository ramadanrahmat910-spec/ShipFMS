"use client"
// src/app/dashboard/histori/page.js — REVISI
// =============================================
// [FIX] Kolom "Sea Time" dulu membaca row.sea_time_hours, padahal
//       getVoyagesByShip() di lib/db.js hanya men-SELECT sea_time_days
//       — jadi kolom itu selalu "—". Sekarang membaca sea_time_days
//       dan ditampilkan sebagai "X hari".

import { useEffect, useState } from "react"
import { getAllShips, getCIIHistory } from "@/lib/api"
import { CIIBadge } from "@/components/CIIRatingCard"
import { formatDbDateDisplay } from "@/lib/simulationClock"

function RatingCell({ rating }) {
  if (!rating) {
    return (
      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 text-gray-400 text-xs font-medium">
        –
      </span>
    )
  }
  return <CIIBadge rating={rating} size="sm" />
}

export default function HistoriPage() {
  const [ships, setShips] = useState([])
  const [selectedKey, setSelectedKey] = useState("klasogun")
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getAllShips().then(setShips)
  }, [])

  useEffect(() => {
    setLoading(true)
    getCIIHistory(selectedKey).then((data) => {
      setHistory(data || [])
      setLoading(false)
    })
  }, [selectedKey])

  return (
    <div className="p-6">
      <div className="mb-5">
        <h1 className="text-lg font-semibold text-gray-900">Histori Pelayaran</h1>
        <p className="text-sm text-gray-500 mt-0.5">Riwayat voyage dan nilai CII berdasarkan data aktual.</p>
      </div>
      <div className="flex gap-2 mb-5">
        {ships.map((s) => (
          <button
            key={s.ship_key}
            onClick={() => setSelectedKey(s.ship_key)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all ${
              selectedKey === s.ship_key
                ? "bg-white border-blue-400 text-gray-900 font-medium shadow-sm"
                : "bg-gray-50 border-gray-200 text-gray-500 hover:bg-white"
            }`}
          >
            <div className="w-6 h-6 rounded bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-700">
              {s.ship_key[0]?.toUpperCase()}
            </div>
            {s.name}
          </button>
        ))}
      </div>
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="text-sm text-gray-400 py-8 text-center">Memuat data voyage...</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {["#", "Rute", "Kondisi", "Tanggal Selesai", "Jarak (nm)", "Sea Time", "CII", "Rating"].map(
                  (h) => (
                    <th
                      key={h}
                      className={`px-4 py-3 text-xs font-medium text-gray-500 ${h === "Rute" ? "text-left" : "text-right"}`}
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {history.slice(0, 30).map((row, i) => (
                <tr key={row.id || i} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-gray-400 text-right text-xs">{i + 1}</td>
                  <td className="px-4 py-3 text-gray-800 font-medium text-xs">
                    {row.from_port} → {row.to_port}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded ${
                        row.sail_condition === "Laden"
                          ? "bg-blue-50 text-blue-700"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {row.sail_condition || "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-500 text-xs">{formatDbDateDisplay(row.date_arrived, selectedKey)}</td>
                  <td className="px-4 py-3 text-right text-gray-500 text-xs">
                    {row.distance_nm?.toLocaleString()}
                  </td>
                  {/* [FIX] sea_time_days, bukan sea_time_hours yang tidak pernah di-select */}
                  <td className="px-4 py-3 text-right text-gray-500 text-xs">
                    {row.sea_time_days != null ? `${row.sea_time_days} hari` : "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900 text-xs">
                    {row.cii_attained != null ? parseFloat(row.cii_attained).toFixed(2) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <RatingCell rating={row.rating} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!loading && history.length > 30 && (
          <div className="px-4 py-3 border-t border-gray-100 text-xs text-gray-400 text-center">
            Menampilkan 30 dari {history.length} voyage
          </div>
        )}
      </div>
    </div>
  )
}