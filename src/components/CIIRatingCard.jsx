"use client"

import {
  calcPctOfRequired,
  calcIMOStatus,
  formatCII,
  predictLimitDate,
} from '@/lib/ciiCalculation'

// ─── CONFIG RATING ────────────────────────────────────────────
export const ratingConfig = {
  A: { color: "bg-teal-50 text-teal-800 border-teal-200",      bar: "bg-teal-500",   label: "Sangat Baik" },
  B: { color: "bg-green-50 text-green-800 border-green-200",   bar: "bg-green-500",  label: "Baik"        },
  C: { color: "bg-amber-50 text-amber-800 border-amber-200",   bar: "bg-amber-500",  label: "Cukup"       },
  D: { color: "bg-orange-50 text-orange-800 border-orange-200",bar: "bg-orange-500", label: "Buruk"       },
  E: { color: "bg-red-50 text-red-800 border-red-200",         bar: "bg-red-500",    label: "Sangat Buruk"},
}

const allRatings = ["A", "B", "C", "D", "E"]

// ─── BADGE ────────────────────────────────────────────────────
export function CIIBadge({ rating, size = "md" }) {
  const cfg       = ratingConfig[rating] || ratingConfig["C"]
  const sizeClass = size === "sm" ? "text-xs px-2 py-0.5" : "text-sm px-3 py-1"
  return (
    <span className={`inline-block font-semibold rounded-full border ${cfg.color} ${sizeClass}`}>
      {rating}
    </span>
  )
}

// ─── STATUS BADGE ─────────────────────────────────────────────
function StatusBadge({ comply }) {
  return comply
    ? <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2.5 py-0.5">
        <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
        Memenuhi Standar IMO
      </span>
    : <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-full px-2.5 py-0.5">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
        Tidak Memenuhi Standar IMO
      </span>
}

// ─── MAIN COMPONENT ───────────────────────────────────────────
/**
 * CIIRatingCard — versi revisi
 *
 * Props:
 *   cii          {number}  — CII attained / running CII
 *   rating       {string}  — grade A/B/C/D/E
 *   ciiRequired  {number}  — CII Required IMO tahun ini
 *   refValue     {number}  — CII Referensi tahun ini (sebelum reduksi)
 *   lastDate     {string}  — tanggal data terakhir (YYYY-MM-DD)
 *   shipKey      {string}  — 'klasogun' | 'balongan'
 *   year         {number}  — tahun (default 2025)
 *   dateLimitReached {string} — dari DB, boleh null
 */
export default function CIIRatingCard({
  cii,
  rating,
  ciiRequired,
  refValue,
  lastDate,
  shipKey,
  year = 2025,
  dateLimitReached = null,
}) {
  const currentIndex = allRatings.indexOf(rating)
  const ciiNum       = parseFloat(cii)
  const reqNum       = parseFloat(ciiRequired)
  const comply       = !isNaN(ciiNum) && !isNaN(reqNum) && ciiNum <= reqNum
  const pct          = calcPctOfRequired(ciiNum, reqNum)

  // Prediksi tanggal sentuh batas (dari DB kalau ada, fallback hitung sendiri)
  let limitDateStr = null
  if (dateLimitReached) {
    const d = new Date(dateLimitReached)
    limitDateStr = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
  } else if (lastDate && ciiNum && reqNum && !comply) {
    // Sudah lewat batas — tidak perlu prediksi
    limitDateStr = null
  } else if (lastDate && ciiNum && reqNum) {
    const pred = predictLimitDate(ciiNum, reqNum, lastDate, year)
    if (pred.date) {
      limitDateStr = pred.date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 h-full flex flex-col">

      {/* Header */}
      <div className="text-xs text-gray-400 mb-3 font-medium uppercase tracking-wide">
        Rating CII Skala IMO
      </div>

      {/* Nilai CII + Badge */}
      <div className="flex items-baseline gap-3 mb-4">
        <span className="text-3xl font-semibold text-gray-900">
          {isNaN(ciiNum) ? '—' : ciiNum.toFixed(2)}
        </span>
        <CIIBadge rating={rating} />
        {ciiRequired && (
          <span className="text-sm text-gray-400">/ target {Number(ciiRequired).toFixed(2)}</span>
        )}
      </div>

      {/* Bar rating A-E */}
      <div className="flex flex-col gap-2.5 mb-5">
        {allRatings.map((r, i) => {
          const c        = ratingConfig[r]
          const isActive = r === rating
          const isPast   = i < currentIndex
          return (
            <div key={r} className="flex items-center gap-3">
              <span className={`text-xs font-semibold w-4 ${isActive ? "text-gray-900" : "text-gray-300"}`}>
                {r}
              </span>
              <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${c.bar}`}
                  style={{ width: isActive || isPast ? "100%" : "0%" }}
                />
              </div>
              <span className={`text-xs w-24 ${isActive ? "text-gray-700 font-medium" : "text-gray-300"}`}>
                {c.label}
              </span>
              {isActive && (
                <span className="text-xs text-gray-400">← posisi Anda</span>
              )}
            </div>
          )
        })}
      </div>

      {/* ── 4 INFO BARU (revisi dosen) ── */}
      <div className="border-t border-gray-100 pt-4 flex flex-col gap-3 mt-auto">

        {/* 1. Status IMO */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">Status CII</span>
          <StatusBadge comply={comply} />
        </div>

        {/* 2. Nilai STD IMO (CII Required) */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">Nilai STD IMO (CII Required)</span>
          <span className="text-xs font-semibold text-gray-700">
            {reqNum ? reqNum.toFixed(5) : '—'}
          </span>
        </div>

        {/* 3. Persentase terhadap batas IMO */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">Posisi terhadap batas IMO</span>
            <span className={`text-xs font-semibold ${comply ? 'text-green-600' : 'text-red-600'}`}>
              {pct != null ? `${pct}%` : '—'}
            </span>
          </div>
          {/* Progress bar persentase */}
          {pct != null && (
            <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${comply ? 'bg-green-400' : 'bg-red-400'}`}
                style={{ width: `${Math.min(pct, 100)}%` }}
              />
            </div>
          )}
          {pct != null && (
            <div className="flex justify-between text-[10px] text-gray-300">
              <span>0%</span>
              <span className="text-gray-400">Batas IMO (100%)</span>
            </div>
          )}
        </div>

        {/* 4. Prediksi sentuh batas IMO */}
        <div className="flex items-start justify-between gap-2">
          <span className="text-xs text-gray-400 flex-shrink-0">Prediksi sentuh batas</span>
          <span className={`text-xs font-medium text-right ${limitDateStr ? 'text-amber-600' : 'text-gray-400'}`}>
            {comply
              ? limitDateStr
                ? `± ${limitDateStr}`
                : 'Aman sepanjang tahun'
              : 'Sudah melewati batas'}
          </span>
        </div>

        {/* CII Referensi */}
        {refValue && (
          <div className="pt-2 border-t border-gray-100 text-xs text-gray-400">
            CII referensi tahun ini:{' '}
            <span className="font-medium text-gray-600">
              {Number(refValue).toFixed(6)}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}