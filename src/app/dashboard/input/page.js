"use client"
import { useState } from "react"
import FuelInputForm from "@/components/FuelInputForm"
import CIIRatingCard, { CIIBadge } from "@/components/CIIRatingCard"
import RecommendationPanel from "@/components/RecommendationPanel"
import Link from "next/link"

export default function InputPage() {
  const [result, setResult] = useState(null)

  return (
    <div className="p-6">
      <div className="mb-5">
        <h1 className="text-lg font-semibold text-gray-900">Prediksi CII</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Masukkan data operasional untuk menghitung CII standar IMO MEPC.352(78) dan rekomendasi perbaikan.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-6 items-start">
        <FuelInputForm onResult={setResult} />

        <div className="flex flex-col gap-4 sticky top-6">
          {!result ? (
            <div className="bg-gray-50 border border-dashed border-gray-200 rounded-xl p-8 text-center">
              <div className="text-3xl mb-2 text-gray-300">⟳</div>
              <div className="text-sm text-gray-400">Hasil kalkulasi CII muncul di sini setelah submit.</div>
            </div>
          ) : (
            <>
              <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-xs text-blue-700">
                <span className="font-semibold">Formula IMO MEPC.352(78):</span>{" "}
                CII = (ΣFC × Cf) / (DWT × Distance) &nbsp;|&nbsp;
                Kapal: <span className="font-medium">{result.shipName}</span> &nbsp;|&nbsp;
                DWT: <span className="font-medium">{result.dwt?.toLocaleString()}</span> &nbsp;|&nbsp;
                Ref CII: <span className="font-medium">{result.refCII}</span>
              </div>

              <CIIRatingCard
                cii={result.actualCII}
                rating={result.rating}
                target={result.refCII}
                refValue={result.refCII}
              />

              <div className="flex items-center gap-2">
                <Link
                  href="/dashboard/rekomendasi"
                  className="flex-1 text-center py-2.5 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 transition-colors"
                >
                  Lihat Rekomendasi Lengkap →
                </Link>
              </div>

              <RecommendationPanel
                recommendations={result.recommendations?.slice(0, 3) || []}
                currentCII={result.actualCII}
                currentRating={result.rating}
                predictedCII={result.optimalCII}
                predictedRating={result.optimalRating}
              />
            </>
          )}
        </div>
      </div>
    </div>
  )
}