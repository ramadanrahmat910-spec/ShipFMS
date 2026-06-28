"use client"

export const ratingConfig = {
  A: { color: "bg-teal-50 text-teal-800 border-teal-200",   bar: "bg-teal-500",   label: "Sangat Baik" },
  B: { color: "bg-green-50 text-green-800 border-green-200", bar: "bg-green-500",  label: "Baik" },
  C: { color: "bg-amber-50 text-amber-800 border-amber-200", bar: "bg-amber-500",  label: "Cukup" },
  D: { color: "bg-orange-50 text-orange-800 border-orange-200", bar: "bg-orange-500", label: "Buruk" },
  E: { color: "bg-red-50 text-red-800 border-red-200",       bar: "bg-red-500",    label: "Sangat Buruk" },
}

const allRatings = ["A", "B", "C", "D", "E"]

export function CIIBadge({ rating, size = "md" }) {
  const cfg = ratingConfig[rating] || ratingConfig["C"]
  const sizeClass = size === "sm" ? "text-xs px-2 py-0.5" : "text-sm px-3 py-1"
  return (
    <span className={`inline-block font-semibold rounded-full border ${cfg.color} ${sizeClass}`}>
      {rating}
    </span>
  )
}

export default function CIIRatingCard({ cii, rating, target, refValue }) {
  const currentIndex = allRatings.indexOf(rating)

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 h-full">
      <div className="text-xs text-gray-400 mb-3 font-medium uppercase tracking-wide">
        Rating CII Skala IMO
      </div>
      <div className="flex items-baseline gap-3 mb-5">
        <span className="text-3xl font-semibold text-gray-900">{Number(cii).toFixed(2)}</span>
        <CIIBadge rating={rating} />
        {target && <span className="text-sm text-gray-400">/ target {target}</span>}
      </div>
      <div className="flex flex-col gap-2.5">
        {allRatings.map((r, i) => {
          const c = ratingConfig[r]
          const isActive = r === rating
          const isPast   = i < currentIndex
          return (
            <div key={r} className="flex items-center gap-3">
              <span className={`text-xs font-semibold w-4 ${isActive ? "text-gray-900" : "text-gray-300"}`}>{r}</span>
              <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${c.bar}`}
                  style={{ width: isActive ? "100%" : isPast ? "100%" : "0%" }}
                />
              </div>
              <span className={`text-xs w-24 ${isActive ? "text-gray-700 font-medium" : "text-gray-300"}`}>
                {c.label}
              </span>
              {isActive && <span className="text-xs text-gray-400">← posisi Anda</span>}
            </div>
          )
        })}
      </div>
      {refValue && (
        <div className="mt-4 pt-3 border-t border-gray-100 text-xs text-gray-400">
          CII referensi tahun ini: <span className="font-medium text-gray-600">{refValue}</span>
        </div>
      )}
    </div>
  )
}