"use client"

import { formatNum } from '@/lib/ciiCalculation'

/**
 * ShipOperationalCard — kotak 1 dari 2 kotak baru (revisi dosen)
 *
 * Menampilkan data operasional harian dari AIS:
 *   - Distance harian (NM)
 *   - Tujuan voyage (dari koordinat + SOG)
 *   - Speed rata-rata hari ini
 *   - Jenis BBM yang dipakai
 *
 * Props:
 *   data  {object} — dari v_ship_operational_daily atau getCIIDailyByDate()
 *   date  {string} — tanggal yang ditampilkan (YYYY-MM-DD)
 */
export default function ShipOperationalCard({ data, date }) {
  const hasData = !!data

  const distanceDay   = data?.distance_nm_day ?? null
  const avgSpeed      = data?.avg_speed_knot  ?? null
  const fromPort      = data?.from_port        ?? null
  const toPort        = data?.to_port          ?? null
  const fuelType      = data?.fuel_type        ?? 'B35'

  // Format tanggal untuk tampilan
  const displayDate = date
    ? new Date(date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
    : '—'

  // Tentukan tujuan voyage
  const voyageRoute = fromPort && toPort
    ? `${fromPort} → ${toPort}`
    : toPort
    ? `→ ${toPort}`
    : fromPort
    ? `${fromPort} → —`
    : 'Sedang dideteksi...'

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 h-full">

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-xs text-gray-400 font-medium uppercase tracking-wide">
            Ship Operational
          </div>
          <div className="text-xs text-gray-400 mt-0.5">{displayDate}</div>
        </div>
        <span className="text-xs bg-blue-50 text-blue-600 border border-blue-100 rounded-full px-2.5 py-0.5 font-medium">
          Harian
        </span>
      </div>

      {/* Konten */}
      <div className="flex flex-col gap-4">

        {/* Distance harian */}
        <div className="flex items-center justify-between py-2.5 border-b border-gray-50">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
              <svg className="w-3.5 h-3.5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
            </div>
            <span className="text-sm text-gray-600">Distance harian</span>
          </div>
          <span className="text-sm font-semibold text-gray-900">
            {distanceDay != null ? `${formatNum(distanceDay, 1)} NM` : '—'}
          </span>
        </div>

        {/* Tujuan voyage */}
        <div className="flex items-center justify-between py-2.5 border-b border-gray-50">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-purple-50 flex items-center justify-center flex-shrink-0">
              <svg className="w-3.5 h-3.5 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <span className="text-sm text-gray-600">Tujuan voyage</span>
          </div>
          <span className="text-sm font-semibold text-gray-900 text-right max-w-[160px] truncate">
            {voyageRoute}
          </span>
        </div>

        {/* Speed harian */}
        <div className="flex items-center justify-between py-2.5 border-b border-gray-50">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-green-50 flex items-center justify-center flex-shrink-0">
              <svg className="w-3.5 h-3.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <span className="text-sm text-gray-600">Speed rata-rata</span>
          </div>
          <span className="text-sm font-semibold text-gray-900">
            {avgSpeed != null ? `${formatNum(avgSpeed, 1)} knot` : '—'}
          </span>
        </div>

        {/* Jenis BBM */}
        <div className="flex items-center justify-between py-2.5">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0">
              <svg className="w-3.5 h-3.5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
              </svg>
            </div>
            <span className="text-sm text-gray-600">Jenis BBM</span>
          </div>
          <span className="text-sm font-semibold text-amber-700 bg-amber-50 border border-amber-100 rounded-full px-2.5 py-0.5">
            {fuelType}
          </span>
        </div>

      </div>

      {/* Empty state */}
      {!hasData && (
        <div className="mt-3 text-xs text-gray-400 text-center py-2 bg-gray-50 rounded-lg">
          Data harian belum tersedia untuk tanggal ini
        </div>
      )}

    </div>
  )
}