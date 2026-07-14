"use client"
// components/DSSPanel.jsx — BARU
// =================================
// Menampilkan seluruh alur "Decision Engine DSS (AHP + SAW)" sesuai
// flowchart: Diagnosis → Alternatif → AHP (bobot) → Penilaian
// Alternatif (matriks) → SAW (ranking) → Decision → Prediction →
// Economic Analysis. Setiap tahap ditampilkan sebagai panel/tabel
// terpisah dan bernomor, mengikuti urutan flowchart persis.
//
// Props:
//   dss     {object}  — hasil runDSS() dari lib/dss.js
//   loading {boolean}

function StageHeader({ n, title, subtitle }) {
  return (
    <div className="flex items-start gap-3 mb-3">
      <div className="w-7 h-7 rounded-full bg-slate-800 text-white text-xs font-semibold flex items-center justify-center flex-shrink-0">
        {n}
      </div>
      <div>
        <div className="text-sm font-semibold text-gray-900">{title}</div>
        {subtitle && <div className="text-xs text-gray-400 mt-0.5">{subtitle}</div>}
      </div>
    </div>
  )
}

function GradeBadge({ grade }) {
  const map = {
    A: 'bg-teal-50 text-teal-700 border-teal-200',
    B: 'bg-green-50 text-green-700 border-green-200',
    C: 'bg-amber-50 text-amber-700 border-amber-200',
    D: 'bg-orange-50 text-orange-700 border-orange-200',
    E: 'bg-red-50 text-red-700 border-red-200',
  }
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${map[grade] ?? 'bg-gray-50 text-gray-600 border-gray-200'}`}>
      {grade}
    </span>
  )
}

export default function DSSPanel({ dss, loading }) {
  if (loading) {
    return <div className="text-sm text-gray-400 text-center py-8">Menjalankan diagnosis & decision engine…</div>
  }
  if (!dss) {
    return <div className="text-sm text-gray-400 text-center py-8">Data belum cukup untuk menjalankan DSS.</div>
  }

  const { diagnosis, criteria, consistencyRatio, matrix, c1Detail, ranking, decision, prediction, economics } = dss

  return (
    <div className="flex flex-col gap-5">
      {/* 1. DIAGNOSIS */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <StageHeader n={1} title="Diagnosis" subtitle="Identifikasi faktor utama dari data AIS, Fuel, Speed, Distance, CII" />
        <div className={`text-xs rounded-lg px-3 py-2 mb-3 ${diagnosis.needsAction ? 'bg-amber-50 text-amber-800 border border-amber-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'}`}>
          {diagnosis.summary}
        </div>
        <div className="flex flex-col gap-2">
          {diagnosis.factors.map((f, i) => (
            <div key={i} className="border border-gray-100 rounded-lg px-3 py-2">
              <div className="text-xs font-medium text-gray-800">{f.factor}</div>
              <div className="text-[11px] text-gray-500 mt-0.5">{f.detail}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 2. ALTERNATIF + 3. AHP BOBOT */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <StageHeader n={2} title="Alternatif & Bobot Kriteria (AHP)" subtitle={`Consistency Ratio = ${consistencyRatio} (≤ 0.1 → konsisten)`} />
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100 text-gray-400">
                <th className="text-left py-1.5 pr-3">Kriteria</th>
                <th className="text-right py-1.5">Bobot</th>
              </tr>
            </thead>
            <tbody>
              {criteria.map(c => (
                <tr key={c.key} className="border-b border-gray-50">
                  <td className="py-1.5 pr-3 text-gray-700">{c.key} · {c.label}</td>
                  <td className="py-1.5 text-right font-medium text-gray-800">{c.weight.toFixed(2)}</td>
                </tr>
              ))}
              <tr>
                <td className="py-1.5 pr-3 font-semibold text-gray-800">Total</td>
                <td className="py-1.5 text-right font-semibold text-gray-800">
                  {criteria.reduce((s, c) => s + c.weight, 0).toFixed(2)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {Object.entries(matrix).map(([key]) => (
            <div key={key} className="border border-gray-100 rounded-lg px-3 py-2">
              <div className="text-xs font-medium text-gray-800">{key} · {ranking.find(r => r.key === key)?.label}</div>
              <div className="text-[11px] text-gray-400">{ranking.find(r => r.key === key)?.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 4. PENILAIAN ALTERNATIF (matriks skor) */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <StageHeader n={3} title="Penilaian Alternatif" subtitle="Skor 1–5 tiap alternatif terhadap tiap kriteria — C1 dihitung dinamis dari data kapal, C2–C5 dari referensi literatur/domain" />
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100 text-gray-400">
                <th className="text-left py-1.5 pr-3">Alternatif</th>
                {criteria.map(c => (
                  <th key={c.key} className="text-center py-1.5 px-1.5">{c.key}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(matrix).map(([key, scores]) => (
                <tr key={key} className="border-b border-gray-50">
                  <td className="py-1.5 pr-3 text-gray-700">{key} · {ranking.find(r => r.key === key)?.label}</td>
                  {criteria.map(c => (
                    <td key={c.key} className={`text-center py-1.5 px-1.5 ${c.key === 'C1' ? 'font-semibold text-blue-700' : 'text-gray-600'}`}>
                      {scores[c.key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 text-[11px] text-gray-400 space-y-1">
          {Object.entries(c1Detail).map(([key, d]) => (
            <div key={key}><span className="font-medium text-gray-600">{key}:</span> {d.basis}</div>
          ))}
        </div>
      </div>

      {/* 5. SAW — PERANGKINGAN */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <StageHeader n={4} title="Perangkingan (SAW)" subtitle="Normalisasi matriks + Vi = Σ(Wj × Rij)" />
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100 text-gray-400">
                <th className="text-left py-1.5 pr-3">Alternatif</th>
                <th className="text-right py-1.5">Nilai (Vi)</th>
                <th className="text-right py-1.5 pl-3">Peringkat</th>
              </tr>
            </thead>
            <tbody>
              {ranking.map(r => (
                <tr key={r.key} className={`border-b border-gray-50 ${r.rank === 1 ? 'bg-blue-50/50' : ''}`}>
                  <td className="py-1.5 pr-3 text-gray-700">{r.key} · {r.label}</td>
                  <td className="py-1.5 text-right font-medium text-gray-800">{r.V.toFixed(3)}</td>
                  <td className="py-1.5 pl-3 text-right">
                    <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${r.rank === 1 ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
                      {r.rank}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 6. DECISION */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
        <StageHeader n={5} title="Decision — Prioritas Rekomendasi" />
        <div className="text-base font-semibold text-blue-900">{decision.key} · {decision.label}</div>
        <div className="text-xs text-blue-700 mt-1">{decision.desc}</div>
        <div className="text-xs text-blue-600 mt-2">Nilai preferensi tertinggi: <span className="font-semibold">{decision.V.toFixed(3)}</span></div>
      </div>

      {/* 7. PREDICTION */}
      {prediction && (
        <div className={`border rounded-xl p-5 ${prediction.meetsTarget ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
          <StageHeader n={6} title="Prediction" subtitle="Apakah hasil prediksi CII sudah memenuhi target IMO?" />
          <div className="flex flex-wrap items-center gap-3 text-xs mb-2">
            <span>CII saat ini: <span className="font-semibold">{prediction.currentCII.toFixed(3)}</span></span>
            <span>→</span>
            <span>Proyeksi setelah {prediction.topAlternative} (−{prediction.pctReduction.toFixed(1)}%):{" "}
              <span className="font-semibold">{prediction.projectedCII.toFixed(3)}</span>
              {" "}<GradeBadge grade={prediction.projectedGrade} />
            </span>
          </div>
          <div className="text-xs">
            Target (CII Required): <span className="font-medium">{prediction.ciiRequired.toFixed(3)}</span> —{" "}
            {prediction.meetsTarget ? (
              <span className="text-emerald-700 font-medium">✓ Target terpenuhi dengan satu alternatif ini.</span>
            ) : (
              <span className="text-amber-700 font-medium">Belum cukup dengan satu alternatif — perlu revisi skenario.</span>
            )}
          </div>
          {!prediction.meetsTarget && prediction.combinedNote && (
            <div className="mt-3 pt-3 border-t border-amber-200 text-xs">
              <div className="font-medium text-amber-800 mb-1">↻ Perbarui skenario: {prediction.combinedNote}</div>
              <div className="text-amber-700">
                Proyeksi gabungan: <span className="font-semibold">{prediction.combinedProjectedCII.toFixed(3)}</span>{" "}
                <GradeBadge grade={prediction.combinedProjectedGrade} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* 8. ECONOMIC ANALYSIS */}
      {economics && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <StageHeader n={7} title="Economic Analysis" subtitle="Estimasi penghematan BBM dari alternatif prioritas" />
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-50 rounded-lg px-3 py-2.5 text-center">
              <div className="text-[11px] text-gray-400">BBM dihemat/tahun</div>
              <div className="text-sm font-semibold text-gray-900">{economics.fuelSavedMT} MT</div>
            </div>
            <div className="bg-gray-50 rounded-lg px-3 py-2.5 text-center">
              <div className="text-[11px] text-gray-400">Estimasi hemat biaya/tahun</div>
              <div className="text-sm font-semibold text-gray-900">Rp {economics.costSavingIDR.toLocaleString('id-ID')}</div>
            </div>
          </div>
          {economics.note && (
            <div className="mt-3 text-[11px] text-gray-400">{economics.note}</div>
          )}
        </div>
      )}
    </div>
  )
}