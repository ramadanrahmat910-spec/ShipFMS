"use client"
// components/RecommendationPanel.jsx — REVISI
// ==============================================
// [FIX #3] Tiap rekomendasi sekarang bisa membawa field `timeframe`
// ('urgent' | 'menengah' | 'panjang') dan `etaLabel` (teks jangka
// waktu spesifik) dari ciiCalculation.js — ditampilkan sebagai badge
// urgensi terpisah dari badge prioritas, supaya terlihat lebih
// meyakinkan sebagai decision-support system (bukan cuma status).
// Backward compatible: kalau rec.timeframe tidak ada, badge urgensi
// disembunyikan (tidak mempengaruhi pemakaian lama).

import { CIIBadge } from "./CIIRatingCard"

const priorityConfig = {
  high:   { border: "border-l-red-500",   bg: "bg-red-50",    text: "text-red-800",    label: "Prioritas Tinggi" },
  medium: { border: "border-l-amber-500", bg: "bg-amber-50",  text: "text-amber-800",  label: "Prioritas Sedang" },
  low:    { border: "border-l-green-500", bg: "bg-green-50",  text: "text-green-800",  label: "Jangka Menengah" },
  info:   { border: "border-l-blue-400",  bg: "bg-blue-50",   text: "text-blue-800",   label: "Informasi" },
}

// [BARU] Badge urgensi — dimensi terpisah dari prioritas di atas.
// Prioritas = seberapa penting; timeframe = seberapa segera.
const timeframeConfig = {
  urgent:   { icon: "🔴", cls: "bg-red-600 text-white" },
  menengah: { icon: "🟡", cls: "bg-amber-500 text-white" },
  panjang:  { icon: "🟢", cls: "bg-emerald-600 text-white" },
}

function TimeframeBadge({ timeframe, etaLabel }) {
  const cfg = timeframeConfig[timeframe]
  if (!cfg) return null
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${cfg.cls}`}>
      <span>{cfg.icon}</span>
      {etaLabel ?? timeframe}
    </span>
  )
}

export default function RecommendationPanel({ recommendations, predictedCII, predictedRating, currentCII, currentRating }) {
  if (!recommendations || recommendations.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-400 text-sm">
        Belum ada rekomendasi.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Ringkasan */}
      {(currentCII || predictedCII) && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-3">Ringkasan Kalkulasi CII</div>
          <div className="flex items-stretch gap-4 flex-wrap">
            {currentCII && (
              <div className="flex-1 min-w-[120px] text-center p-3 bg-gray-50 rounded-lg">
                <div className="text-xs text-gray-500 mb-1">CII Saat Ini</div>
                <div className="text-2xl font-semibold text-gray-900">{Number(currentCII).toFixed(2)}</div>
                {currentRating && <div className="mt-1"><CIIBadge rating={currentRating} size="sm" /></div>}
              </div>
            )}
            {predictedCII && (
              <div className="flex-1 min-w-[120px] text-center p-3 bg-teal-50 rounded-lg border border-teal-100">
                <div className="text-xs text-teal-600 mb-1">Potensi Setelah Perbaikan</div>
                <div className="text-2xl font-semibold text-teal-800">{Number(predictedCII).toFixed(2)}</div>
                {predictedRating && <div className="mt-1"><CIIBadge rating={predictedRating} size="sm" /></div>}
              </div>
            )}
          </div>
          {currentCII && predictedCII && (
            <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-500 text-center">
              Estimasi penghematan CII:{" "}
              <span className="font-medium text-green-600">
                {((currentCII - predictedCII) / currentCII * 100).toFixed(1)}%
              </span>
            </div>
          )}
        </div>
      )}

      {/* Grid Rekomendasi */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {recommendations.map((rec, i) => {
          const cfg = priorityConfig[rec.priority] || priorityConfig["info"]
          return (
            <div key={rec.id || i} className={`border-l-4 ${cfg.border} rounded-r-lg px-4 py-3 ${cfg.bg} flex flex-col`}>
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div className={`text-sm font-medium ${cfg.text}`}>{rec.title}</div>
                <TimeframeBadge timeframe={rec.timeframe} etaLabel={rec.etaLabel} />
              </div>
              <div className="text-xs text-gray-600 leading-relaxed flex-1">{rec.description}</div>
              {/* [BARU] Dasar perhitungan — transparan, bisa dilihat pengguna */}
              {Array.isArray(rec.basis) && rec.basis.length > 0 && (
                <div className="mt-2 pt-2 border-t border-black/5">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">
                    Dasar perhitungan
                  </div>
                  <ul className="text-[11px] text-gray-500 leading-relaxed space-y-0.5 list-disc list-inside">
                    {rec.basis.map((b, bi) => <li key={bi}>{b}</li>)}
                  </ul>
                </div>
              )}
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                <span className={`text-xs px-2 py-0.5 rounded-full bg-white border border-current border-opacity-20 ${cfg.text}`}>
                  {cfg.label}
                </span>
                {rec.savingPerDay && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-white border border-green-200 text-green-700">
                    💰 ~${rec.savingPerDay.toLocaleString()}/hari
                  </span>
                )}
                {rec.estimatedCIISaving && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-white border border-blue-200 text-blue-700">
                    📉 CII: −{rec.estimatedCIISaving}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}