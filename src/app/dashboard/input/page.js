"use client"
import { useState } from "react"
import FuelInputForm from "@/components/FuelInputForm"
import CIIRatingCard, { CIIBadge } from "@/components/CIIRatingCard"
import RecommendationPanel from "@/components/RecommendationPanel"
import Link from "next/link"

function handleResult(setResult) {
  return (data) => {
    setResult(data)
    try {
      localStorage.setItem("lastCIIResult", JSON.stringify(data))
    } catch (e) {
      console.error("Gagal simpan hasil ke localStorage:", e)
    }
  }
}

export default function InputPage() {
  const [result, setResult] = useState(null)
  return (
    <div className="p-6">
      <div className="mb-5">
        <h1 className="text-lg font-semibold text-gray-900">Simulasi Operasional</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Masukkan data voyage (kapal, asal, tujuan, muatan, jenis BBM, kecepatan rata-rata) untuk
          menghitung estimasi CII standar IMO MEPC.352(78) dan potensi penghematan biaya BBM.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-6 items-start">
        <FuelInputForm onResult={handleResult(setResult)} />
        <div className="flex flex-col gap-4 sticky top-6">
          {!result ? (
            <div className="bg-gray-50 border border-dashed border-gray-200 rounded-xl p-8 text-center">
              <div className="text-3xl mb-2 text-gray-300">⟳</div>
              <div className="text-sm text-gray-400">Hasil kalkulasi CII muncul di sini setelah submit.</div>
            </div>
          ) : (
            <>
              <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-xs text-blue-700 space-y-1">
                <div>
                  <span className="font-semibold">Formula IMO MEPC.352(78):</span>{" "}
                  CII = (ΣFC × Cf) / (DWT × Distance)
                </div>
                <div>
                  Kapal: <span className="font-medium">{result.shipName}</span> &nbsp;|&nbsp;
                  DWT: <span className="font-medium">{result.dwt?.toLocaleString()}</span> &nbsp;|&nbsp;
                  Ref CII: <span className="font-medium">{result.ciiRequired}</span>
                </div>
                <div>
                  Rute: <span className="font-medium">{result.originPort} → {result.destPort}</span> &nbsp;|&nbsp;
                  Jarak: <span className="font-medium">{result.distanceNM?.toLocaleString()} nm</span> &nbsp;|&nbsp;
                  Kecepatan: <span className="font-medium">{result.avgSpeedKnot} kn</span> &nbsp;|&nbsp;
                  Estimasi durasi: <span className="font-medium">{result.durationDays} hari</span>
                </div>
              </div>
              <CIIRatingCard
                cii={result.estimatedCII}
                rating={result.estimatedGrade}
                target={result.ciiRequired}
                refValue={result.ciiRequired}
              />
              {result.fuelComparison?.delta && (
                <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
                  <div className="text-xs text-emerald-700 font-semibold mb-1">💰 Perbandingan Biaya BBM vs Baseline B35</div>
                  <div className="text-lg font-semibold text-emerald-800">
                    {result.fuelComparison.delta.costDiffIDR >= 0 ? "+" : "-"}Rp{" "}
                    {Math.abs(result.fuelComparison.delta.costDiffIDR).toLocaleString("id-ID")}
                  </div>
                  <div className="text-xs text-emerald-600 mt-0.5">
                    Emisi CO₂ {result.fuelComparison.delta.co2PctReduced}% lebih rendah
                    ({result.fuelComparison.delta.co2TonSaved} ton CO₂ dihemat) dibanding B35.
                  </div>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Link
                  href="/dashboard/rekomendasi"
                  className="flex-1 text-center py-2.5 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 transition-colors"
                >
                  Lihat Rekomendasi Lengkap →
                </Link>
              </div>
              <RecommendationPanel
                recommendations={result.recommendation ? result.recommendation.split(" | ") : []}
                currentCII={result.estimatedCII}
                currentRating={result.estimatedGrade}
                predictedCII={null}
                predictedRating={null}
              />
            </>
          )}
        </div>
      </div>
    </div>
  )
}