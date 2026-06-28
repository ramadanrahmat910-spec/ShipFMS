// src/app/dashboard/rekomendasi/page.js
"use client"
import { useEffect, useState } from "react"
import RecommendationPanel from "@/components/RecommendationPanel"
import Link from "next/link"

export default function RekomendasiPage() {
  const [result, setResult] = useState(null)

  useEffect(() => {
    const saved = localStorage.getItem("lastCIIResult")
    if (saved) {
      try {
        setResult(JSON.parse(saved))
      } catch {}
    }
  }, [])

  return (
    <div className="p-6 w-full">
      <div className="mb-6 flex items-start justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Rekomendasi Perbaikan CII</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Berdasarkan kalkulasi CII terbaru Anda{result ? ` — ${result.shipName}` : ""}.
          </p>
        </div>
        <Link
          href="/dashboard/input"
          className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Hitung CII baru →
        </Link>
      </div>

      {!result ? (
        <div className="bg-white border border-dashed border-gray-200 rounded-xl p-8 text-center">
          <div className="text-3xl mb-2 text-gray-300">📋</div>
          <div className="text-sm text-gray-400 mb-3">Belum ada data kalkulasi CII.</div>
          <Link
            href="/dashboard/input"
            className="text-sm px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 inline-block"
          >
            Mulai Kalkulasi CII →
          </Link>
        </div>
      ) : (
        <RecommendationPanel
          recommendations={result.recommendations}
          currentCII={result.actualCII}
          currentRating={result.rating}
          predictedCII={result.optimalCII}
          predictedRating={result.optimalRating}
        />
      )}
    </div>
  )
}