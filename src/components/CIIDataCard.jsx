"use client"
// components/CIIDataCard.jsx — REVISI
// =====================================
// [FIX #1] Tambah props opsional title/badgeLabel/periodText supaya
// kartu ini bisa dipakai untuk 2 mode: akumulasi tahunan (default,
// dashboard live) ATAU data satu voyage terpilih (dashboard.js
// mengirim override saat user pilih voyage dari dropdown "Riwayat
// Perjalanan"). Tanpa override, perilaku persis seperti sebelumnya.

import { formatCO2, formatNum } from '@/lib/ciiCalculation'

/**
 * Props:
 *   data        {object} — dari v_cii_data_card / getCIIAnnualSummary(),
 *               ATAU objek voyage-shaped yang dikirim dashboard saat
 *               mode "Detail Voyage" aktif.
 *   year        {number}
 *   title       {string} — override judul kartu (default: "CII Data")
 *   badgeLabel  {string} — override label badge kanan atas (default: "Tahunan")
 *   periodText  {string} — override baris sub-judul (default: "Akumulasi Jan–Des {year}")
 */
export default function CIIDataCard({
  data,
  year = 2025,
  title = 'CII Data',
  badgeLabel = 'Tahunan',
  periodText,
}) {
  const distanceAnnual   = data?.distance_nm_annual      ?? null
  const fuelAnnual       = data?.fuel_cons_mt_annual     ?? null
  const co2Annual        = data?.co2_emission_g_annual   ?? null
  const transportWork    = data?.transport_work_annual   ?? null

  const items = [
    {
      label:   'Distance tahunan',
      value:   distanceAnnual != null ? `${Math.round(distanceAnnual).toLocaleString('id-ID')} NM` : '—',
      icon:    (
        <svg className="w-3.5 h-3.5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
        </svg>
      ),
      iconBg:  'bg-blue-50',
    },
    {
      label:   'Fuel consumption tahunan',
      value:   fuelAnnual != null ? `${formatNum(fuelAnnual, 2)} MT` : '—',
      icon:    (
        <svg className="w-3.5 h-3.5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
        </svg>
      ),
      iconBg:  'bg-amber-50',
    },
    {
      label:   'CO₂ emission tahunan',
      value:   co2Annual != null ? formatCO2(co2Annual) : '—',
      icon:    (
        <svg className="w-3.5 h-3.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064" />
        </svg>
      ),
      iconBg:  'bg-green-50',
    },
    {
      label:   'Transport work tahunan',
      value:   transportWork != null
        ? `${(transportWork / 1_000_000).toFixed(2)}M DWT·NM`
        : '—',
      icon:    (
        <svg className="w-3.5 h-3.5 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
      iconBg:  'bg-purple-50',
    },
  ]

  // Kalau title mode voyage dipakai, label tiap item juga lebih pas
  // tanpa kata "tahunan" — tapi ini kosmetik saja, tidak wajib diubah.
  const isVoyageMode = title !== 'CII Data'
  const displayItems = isVoyageMode
    ? items.map(it => ({ ...it, label: it.label.replace(' tahunan', '') }))
    : items

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-xs text-gray-400 font-medium uppercase tracking-wide">
            {title}
          </div>
          <div className="text-xs text-gray-400 mt-0.5">
            {periodText ?? `Akumulasi Jan–Des ${year}`}
          </div>
        </div>
        <span className="text-xs bg-purple-50 text-purple-600 border border-purple-100 rounded-full px-2.5 py-0.5 font-medium">
          {badgeLabel}
        </span>
      </div>
      {/* Items */}
      <div className="flex flex-col gap-4">
        {displayItems.map((item, idx) => (
          <div
            key={idx}
            className={`flex items-center justify-between py-2.5 ${idx < displayItems.length - 1 ? 'border-b border-gray-50' : ''}`}
          >
            <div className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-lg ${item.iconBg} flex items-center justify-center flex-shrink-0`}>
                {item.icon}
              </div>
              <span className="text-sm text-gray-600">{item.label}</span>
            </div>
            <span className="text-sm font-semibold text-gray-900">
              {item.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}