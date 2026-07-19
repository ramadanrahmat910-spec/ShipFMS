"use client"
// components/DSSPanel.jsx — REVISI (MACC)
// ==========================================
// [REVISI BESAR] Tampilan diubah total mengikuti pergantian metodologi
// AHP+SAW -> MACC (Marginal Abatement Cost Curve) di lib/dss.js.
// Alur baru: Diagnosis -> Tabel MACC (biaya per ton CO2 tiap
// alternatif, diurutkan) -> Grafik batang MACC -> Decision ->
// Prediction -> Economic Analysis.

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

function formatRp(n) {
  if (n == null) return '—'
  const sign = n < 0 ? '-' : ''
  return `${sign}Rp ${Math.abs(Math.round(n)).toLocaleString('id-ID')}`
}

// Grafik batang MACC sederhana (SVG) — batang di bawah 0 = net hemat,
// di atas 0 = berbiaya. Diurutkan dari termurah/paling hemat ke termahal.
function MACCChart({ macc }) {
  const valid = macc.filter(m => m.costPerTonCO2 != null)
  if (valid.length === 0) return null
  const maxAbs = Math.max(...valid.map(m => Math.abs(m.costPerTonCO2)), 1)
  const H = 160
  const zeroY = H / 2
  const barW = 100 / valid.length

  return (
    <svg viewBox={`0 0 300 ${H + 40}`} className="w-full" style={{ maxHeight: 220 }}>
      <line x1="0" y1={zeroY} x2="300" y2={zeroY} stroke="#d1d5db" strokeWidth="1" />
      {valid.map((m, i) => {
        const h = (Math.abs(m.costPerTonCO2) / maxAbs) * (H / 2 - 10)
        const x = i * (300 / valid.length) + 4
        const w = (300 / valid.length) - 8
        const isNeg = m.costPerTonCO2 < 0
        const y = isNeg ? zeroY - h : zeroY
        return (
          <g key={m.key}>
            <rect x={x} y={y} width={w} height={h} rx="3" fill={isNeg ? '#10b981' : '#f59e0b'} opacity="0.85" />
            <text x={x + w / 2} y={H + 14} textAnchor="middle" fontSize="9" fill="#6b7280">{m.key}</text>
          </g>
        )
      })}
    </svg>
  )
}

export default function DSSPanel({ dss, loading }) {
  if (loading) {
    return <div className="text-sm text-gray-400 text-center py-8">Menjalankan diagnosis & decision engine…</div>
  }
  if (!dss) {
    return <div className="text-sm text-gray-400 text-center py-8">Data belum cukup untuk menjalankan DSS.</div>
  }

  const { diagnosis, macc, decision, prediction, economics, boundaries } = dss

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

      {/* 2. MACC — TABEL */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <StageHeader n={2} title="Marginal Abatement Cost Curve (MACC)" subtitle="Biaya per ton CO₂ yang dikurangi — diurutkan dari paling hemat (negatif) ke paling mahal" />
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100 text-gray-400">
                <th className="text-left py-1.5 pr-3">Alternatif</th>
                <th className="text-right py-1.5 px-2">CO₂ dikurangi/thn</th>
                <th className="text-right py-1.5 px-2">Biaya/thn</th>
                <th className="text-right py-1.5 px-2">Rp per ton CO₂</th>
                <th className="text-right py-1.5 pl-2">Peringkat</th>
              </tr>
            </thead>
            <tbody>
              {macc.map(m => (
                <tr key={m.key} className={`border-b border-gray-50 ${m.rank === 1 ? 'bg-emerald-50/50' : ''}`}>
                  <td className="py-1.5 pr-3 text-gray-700">{m.key} · {m.label}</td>
                  <td className="py-1.5 px-2 text-right text-gray-600">{m.co2ReducedTon} ton</td>
                  <td className={`py-1.5 px-2 text-right font-medium ${m.costIDR < 0 ? 'text-emerald-700' : 'text-gray-800'}`}>
                    {formatRp(m.costIDR)}
                  </td>
                  <td className={`py-1.5 px-2 text-right font-semibold ${m.costPerTonCO2 != null && m.costPerTonCO2 < 0 ? 'text-emerald-700' : 'text-gray-800'}`}>
                    {m.costPerTonCO2 != null ? formatRp(m.costPerTonCO2) : '—'}
                  </td>
                  <td className="py-1.5 pl-2 text-right">
                    <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${m.rank === 1 ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
                      {m.rank}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4">
          <MACCChart macc={macc} />
          <div className="text-[10px] text-gray-400 text-center mt-1">
            🟢 Hijau = net hemat biaya (di bawah 0) &nbsp;·&nbsp; 🟠 Oranye = berbiaya (di atas 0)
          </div>
        </div>
        <div className="mt-4 text-[11px] text-gray-400 space-y-1.5">
          {macc.map(m => (
            <div key={m.key}><span className="font-medium text-gray-600">{m.key}:</span> {m.basis}</div>
          ))}
        </div>
      </div>

      {/* 3. DECISION */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
        <StageHeader n={3} title="Decision — Prioritas Rekomendasi" subtitle="Cost-effectiveness terendah (paling hemat per ton CO₂)" />
        {decision ? (
          <>
            <div className="text-base font-semibold text-blue-900">{decision.key} · {decision.label}</div>
            <div className="text-xs text-blue-700 mt-1">{decision.desc}</div>
            <div className="text-xs text-blue-600 mt-2">
              {decision.costPerTonCO2 != null && decision.costPerTonCO2 < 0
                ? `Net hemat ${formatRp(Math.abs(decision.costPerTonCO2))} per ton CO₂ dikurangi — win-win (turunkan emisi SEKALIGUS hemat biaya).`
                : `Biaya ${formatRp(decision.costPerTonCO2)} per ton CO₂ dikurangi.`}
            </div>
          </>
        ) : (
          <div className="text-xs text-blue-700">Data kapal belum cukup untuk menentukan rekomendasi yang relevan saat ini.</div>
        )}
      </div>

      {/* 4. PREDICTION */}
      {prediction && (
        <div className={`border rounded-xl p-5 ${prediction.meetsTarget ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
          <StageHeader n={4} title="Prediction" subtitle="Apakah hasil prediksi CII sudah memenuhi target IMO?" />
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

      {/* 5. ECONOMIC ANALYSIS */}
      {economics && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <StageHeader n={5} title="Economic Analysis" subtitle={`Berdasarkan alternatif prioritas: ${economics.alternative}`} />
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-gray-50 rounded-lg px-3 py-2.5 text-center">
              <div className="text-[11px] text-gray-400">CO₂ dikurangi/tahun</div>
              <div className="text-sm font-semibold text-gray-900">{economics.co2ReducedTon} ton</div>
            </div>
            <div className="bg-gray-50 rounded-lg px-3 py-2.5 text-center">
              <div className="text-[11px] text-gray-400">{economics.isNetSaving ? 'Hemat biaya/tahun' : 'Biaya/tahun'}</div>
              <div className={`text-sm font-semibold ${economics.isNetSaving ? 'text-emerald-700' : 'text-gray-900'}`}>
                {formatRp(Math.abs(economics.costIDR))}
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg px-3 py-2.5 text-center">
              <div className="text-[11px] text-gray-400">Rp per ton CO₂</div>
              <div className={`text-sm font-semibold ${economics.isNetSaving ? 'text-emerald-700' : 'text-gray-900'}`}>
                {formatRp(economics.costPerTonCO2)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 6. IMO BOUNDARIES REFERENCE */}
      {boundaries && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <StageHeader n={6} title="Referensi Batas Nilai IMO" subtitle="Ambang batas (threshold) aktual untuk setiap Grade CII berdasarkan standar kapal ini" />
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-gray-100 text-gray-400">
                  <th className="py-2 pr-3">Grade</th>
                  <th className="py-2 px-2">Batas Nilai CII</th>
                  <th className="py-2 px-2">Batas Posisi</th>
                  <th className="py-2 pl-2 w-full">Keterangan</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-gray-50">
                  <td className="py-2 pr-3"><GradeBadge grade="A" /></td>
                  <td className="py-2 px-2 font-medium">&lt; {boundaries.superior.toFixed(3)}</td>
                  <td className="py-2 px-2 text-gray-500">&lt; 86%</td>
                  <td className="py-2 pl-2 text-gray-500">Sangat Baik (Superior)</td>
                </tr>
                <tr className="border-b border-gray-50">
                  <td className="py-2 pr-3"><GradeBadge grade="B" /></td>
                  <td className="py-2 px-2 font-medium">&lt; {boundaries.lower.toFixed(3)}</td>
                  <td className="py-2 px-2 text-gray-500">&lt; 94%</td>
                  <td className="py-2 pl-2 text-gray-500">Baik (Lower)</td>
                </tr>
                <tr className="border-b border-gray-50 bg-blue-50/30">
                  <td className="py-2 pr-3"><GradeBadge grade="C" /></td>
                  <td className="py-2 px-2 font-medium">&lt; {boundaries.upper.toFixed(3)}</td>
                  <td className="py-2 px-2 text-gray-500">&lt; 106%</td>
                  <td className="py-2 pl-2 text-gray-600 font-medium">Cukup (Target Utama IMO) — Required CII: {boundaries.required.toFixed(3)} (100%)</td>
                </tr>
                <tr className="border-b border-gray-50">
                  <td className="py-2 pr-3"><GradeBadge grade="D" /></td>
                  <td className="py-2 px-2 font-medium">&lt; {boundaries.inferior.toFixed(3)}</td>
                  <td className="py-2 px-2 text-gray-500">&lt; 118%</td>
                  <td className="py-2 pl-2 text-gray-500">Buruk (Tindakan Korektif)</td>
                </tr>
                <tr>
                  <td className="py-2 pr-3"><GradeBadge grade="E" /></td>
                  <td className="py-2 px-2 font-medium">&ge; {boundaries.inferior.toFixed(3)}</td>
                  <td className="py-2 px-2 text-gray-500">&ge; 118%</td>
                  <td className="py-2 pl-2 text-gray-500">Sangat Buruk (Tindakan Segera)</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}