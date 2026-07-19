"use client"
// components/RecommendationSummaryCards.jsx — REVISI
// ======================================================
// [REVISI] Sebelumnya kartu 1 = "Status Sekarang" (redundan, grade
// sudah terlihat di badge atas) — sekarang DIBUANG. Ketiga kartu
// sekarang langsung menampilkan 3 REKOMENDASI TERATAS dari ranking
// MACC (bukan status + 1 rekomendasi + 1 hasil seperti sebelumnya),
// supaya pekerja langsung lihat pilihan tindakan, bukan cuma satu.
//
// Warna per kartu:
//   Peringkat 1 → hijau  (paling direkomendasikan / paling hemat)
//   Peringkat 2 → kuning (alternatif)
//   Peringkat 3 → oranye (opsi berikutnya, biasanya lebih mahal/lama)
// Kalau alternatif itu net HEMAT biaya (bukan cuma murah), selalu
// dipaksa hijau apa pun peringkatnya — supaya opsi "win-win" tetap
// menonjol.
//
// Props:
//   dss      {object}  — hasil runDSS() dari lib/dss.js
//   loading  {boolean}

const TIER_COLOR = [
  { bg: 'bg-emerald-50', border: 'border-emerald-300', text: 'text-emerald-800', badge: 'bg-emerald-600', label: 'PRIORITAS UTAMA' },
  { bg: 'bg-amber-50',   border: 'border-amber-300',   text: 'text-amber-800',   badge: 'bg-amber-500',   label: 'ALTERNATIF' },
  { bg: 'bg-orange-50',  border: 'border-orange-300',  text: 'text-orange-800',  badge: 'bg-orange-500',  label: 'OPSI LANJUTAN' },
]
const SAVING_COLOR = { bg: 'bg-emerald-50', border: 'border-emerald-300', text: 'text-emerald-800', badge: 'bg-emerald-600', label: 'HEMAT BIAYA' }
const GRAY = { bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-500', badge: 'bg-gray-400', label: '—' }

function formatRp(n) {
  if (n == null) return '—'
  const sign = n < 0 ? '-' : ''
  return `${sign}Rp ${Math.abs(Math.round(n)).toLocaleString('id-ID')}`
}

function RecCard({ item, tierIndex }) {
  if (!item) {
    return <div className={`rounded-xl border-2 ${GRAY.border} ${GRAY.bg} p-4 h-full flex items-center justify-center text-xs text-gray-400`}>Data belum cukup</div>
  }
  const isSaving = item.costPerTonCO2 != null && item.costPerTonCO2 < 0
  const c = isSaving ? SAVING_COLOR : (TIER_COLOR[tierIndex] ?? GRAY)

  return (
    <div className={`rounded-xl border-2 ${c.border} ${c.bg} p-4 flex flex-col gap-2 transition-colors duration-500 h-full`}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Peringkat {item.rank}</span>
        <span className={`text-[10px] font-bold text-white px-2 py-0.5 rounded-full ${c.badge}`}>
          {c.label}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className={`font-semibold text-sm ${c.text}`}>{item.label}</span>
      </div>
      <div className="text-xs text-gray-600 leading-relaxed flex-1">{item.desc}</div>
      <div className="pt-2 border-t border-black/5 text-xs">
        <div className="flex justify-between">
          <span className="text-gray-400">CO₂ dikurangi/thn</span>
          <span className="font-medium text-gray-700">{item.co2ReducedTon} ton</span>
        </div>
        <div className="flex justify-between mt-0.5">
          <span className="text-gray-400">Rp per ton CO₂</span>
          <span className={`font-semibold ${isSaving ? 'text-emerald-700' : 'text-gray-800'}`}>
            {formatRp(item.costPerTonCO2)}
          </span>
        </div>
      </div>
    </div>
  )
}

export default function RecommendationSummaryCards({ dss, loading }) {
  if (loading || !dss) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="rounded-xl border-2 border-gray-100 bg-gray-50 p-4 h-[160px] animate-pulse" />
        ))}
      </div>
    )
  }

  // Filter khusus untuk Dashboard utama: hanya tampilkan Tindakan Langsung
  const top3 = (dss.macc ?? [])
    .filter(m => m.type === 'langsung')
    .slice(0, 3)

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <RecCard item={top3[0]} tierIndex={0} />
      <RecCard item={top3[1]} tierIndex={1} />
      <RecCard item={top3[2]} tierIndex={2} />
    </div>
  )
}