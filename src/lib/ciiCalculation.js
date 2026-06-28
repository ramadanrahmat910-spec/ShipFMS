// src/lib/ciiCalculation.js — versi mandiri, tidak butuh @/data/ciiParams

/* ================================================================
   Konstanta Carbon Factor (hanya B40 yang digunakan)
   ================================================================ */
export const CF_FACTORS = {
  B40: 2.65,
};

/* ================================================================
   Rating Boundaries (IMO DCS, untuk Tanker)
   d1 = Superior, d2 = Lower, d3 = Upper, d4 = Inferior
   ================================================================ */
const RATING_BOUNDARIES = {
  Tanker: { d1: 0.82, d2: 0.93, d3: 1.08, d4: 1.28 },
};

export function calculateCIIReference(a, c, dwt) {
  return parseFloat((a * Math.pow(dwt, -c)).toFixed(3));
}

export function calculateCIIAttained(fuelME, fuelAE, fuelType, dwt, distance) {
  const cf = CF_FACTORS[fuelType] || 2.65;
  const totalFuelCO2 = (fuelME + fuelAE) * 1_000_000 * cf;
  const cii = totalFuelCO2 / (dwt * distance);
  return parseFloat(cii.toFixed(3));
}

export function getCIIRating(actualCII, refCII, shipType = "Tanker") {
  const bounds = RATING_BOUNDARIES[shipType] || RATING_BOUNDARIES["Tanker"];
  const superior  = refCII * bounds.d1;
  const lower     = refCII * bounds.d2;
  const upper     = refCII * bounds.d3;
  const inferior  = refCII * bounds.d4;

  if (actualCII <= superior) return "A";
  if (actualCII <= lower)    return "B";
  if (actualCII <= upper)    return "C";
  if (actualCII <= inferior) return "D";
  return "E";
}

export function computeFullCII({
  fuelME, fuelAE = 2.5, fuelType = "B40", dwt, distance,
  shipType = "Tanker", ciiParams = { a: 5247, c: 0.61 },
  speed = 10, days = 1,
}) {
  const refCII    = calculateCIIReference(ciiParams.a, ciiParams.c, dwt);
  const actualCII = calculateCIIAttained(fuelME, fuelAE, fuelType, dwt, distance);
  const rating    = getCIIRating(actualCII, refCII, shipType);

  const optFuelME = fuelME * Math.pow(0.9, 3);
  const optCII    = calculateCIIAttained(optFuelME, fuelAE, fuelType, dwt, distance);
  const optRating = getCIIRating(optCII, refCII, shipType);

  const recommendations = generateRecommendations({
    actualCII, refCII, rating, fuelType, fuelME, fuelAE,
    speed, dwt, distance, shipType,
  });

  return {
    actualCII: parseFloat(actualCII.toFixed(2)),
    refCII:    parseFloat(refCII.toFixed(3)),
    rating,
    optimalCII: parseFloat(optCII.toFixed(2)),
    optimalRating: optRating,
    savingPotential: parseFloat((((actualCII - optCII) / actualCII) * 100).toFixed(1)),
    recommendations,
  };
}

function generateRecommendations({ actualCII, refCII, rating, fuelType, fuelME, fuelAE, speed, dwt, distance, shipType }) {
  const recs = [];
  const cf = CF_FACTORS[fuelType] || 2.65;
  const ratio = actualCII / refCII;
  const fuelPricePerTon = 800;

  if (["D", "E"].includes(rating)) {
    recs.push({
      id: 1, priority: "high",
      title: "🚨 Kurangi Kecepatan Segera (Slow Steaming)",
      description: `CII Anda ${ratio.toFixed(2)}× di atas referensi. Segera kurangi kecepatan dari ${speed} kn ke ${(speed * 0.85).toFixed(1)} kn. Estimasi CII setelah perbaikan: ${(actualCII * 0.72).toFixed(2)}.`,
      savingPerDay: Math.round((fuelME + fuelAE) * 0.38 * fuelPricePerTon),
      estimatedCIISaving: (actualCII * 0.28).toFixed(2),
    });
    recs.push({
      id: 2, priority: "high",
      title: "⛽ Beralih ke Bahan Bakar Rendah Karbon",
      description: `Ganti ${fuelType} (Cf: ${cf}) ke B40 (Cf: 2.65). Estimasi perbaikan CII: ${(actualCII * (1 - 2.65 / cf)).toFixed(2)}.`,
      savingPerDay: null,
      estimatedCIISaving: (actualCII * (1 - 2.65 / cf)).toFixed(2),
    });
  }

  if (["C", "D", "E"].includes(rating)) {
    recs.push({
      id: 3, priority: "medium",
      title: "⚓ Optimasi Trim dan Ballast",
      description: `Sesuaikan trim kapal ke even keel ±0.2m. Estimasi perbaikan CII: ${(actualCII * 0.04).toFixed(2)}.`,
      savingPerDay: Math.round((fuelME + fuelAE) * 0.035 * fuelPricePerTon),
      estimatedCIISaving: (actualCII * 0.04).toFixed(2),
    });
    recs.push({
      id: 4, priority: "medium",
      title: "🧹 Pembersihan Lambung (Hull Cleaning)",
      description: `Biofouling pada lambung menambah konsumsi 5–15%. Estimasi perbaikan CII: ${(actualCII * 0.07).toFixed(2)}.`,
      savingPerDay: Math.round((fuelME + fuelAE) * 0.07 * fuelPricePerTon),
      estimatedCIISaving: (actualCII * 0.07).toFixed(2),
    });
    recs.push({
      id: 5, priority: "medium",
      title: "🔧 Optimalisasi Mesin Induk",
      description: `Pastikan SFOC mesin pada level optimal (≤175 g/kWh). Penyetelan fuel injection dan turbocharger dapat menurunkan konsumsi 3–5%.`,
      savingPerDay: Math.round((fuelME + fuelAE) * 0.04 * fuelPricePerTon),
      estimatedCIISaving: (actualCII * 0.04).toFixed(2),
    });
  }

  if (["B", "C"].includes(rating)) {
    recs.push({
      id: 6, priority: "medium",
      title: "🗺️ Optimalkan Rute Pelayaran",
      description: `Gunakan weather routing untuk menghindari arus dan angin haluan. Estimasi penghematan jarak 2–4%. Perbaikan CII: ${(actualCII * 0.03).toFixed(2)}.`,
      savingPerDay: Math.round((fuelME + fuelAE) * 0.025 * fuelPricePerTon),
      estimatedCIISaving: (actualCII * 0.03).toFixed(2),
    });
  }

  recs.push({
    id: 7, priority: "low",
    title: "🔩 Perawatan Mesin Berkala",
    description: "Pastikan turbocharger, fuel injector, dan heat exchanger dalam kondisi optimal. Mesin terawat hemat BBM 3–8%.",
    savingPerDay: Math.round((fuelME + fuelAE) * 0.05 * fuelPricePerTon),
    estimatedCIISaving: (actualCII * 0.05).toFixed(2),
  });
  recs.push({
    id: 8, priority: "low",
    title: "⚡ Manajemen Konsumsi AE (Auxiliary Engine)",
    description: `Konsumsi AE saat ini ${fuelAE} ton/hari. Optimalkan operasi generator dengan load sharing. Potensi penghematan AE 10–20%.`,
    savingPerDay: Math.round(fuelAE * 0.15 * fuelPricePerTon),
    estimatedCIISaving: (actualCII * 0.02).toFixed(2),
  });
  recs.push({
    id: 9, priority: "info",
    title: "📊 Prediksi CII Akhir Tahun",
    description: `Jika rekomendasi di atas dijalankan, CII diproyeksikan turun dari ${actualCII} ke sekitar ${(actualCII * 0.85).toFixed(2)}. Tanpa perubahan, CII akhir tahun diprediksi ${(actualCII * 1.02).toFixed(2)} akibat degradasi bertahap.`,
    savingPerDay: null,
    estimatedCIISaving: (actualCII * 0.15).toFixed(2),
  });
  recs.push({
    id: 10, priority: "info",
    title: "💡 Investasi Teknologi Hemat Energi",
    description: "Pertimbangkan pemasangan: Pre-Swirl Stator (hemat 5–8%), Propeller Boss Cap Fin (hemat 2–5%), atau Low-Friction Coating (hemat 3–5%). ROI dalam 1–3 tahun.",
    savingPerDay: Math.round((fuelME + fuelAE) * 0.08 * fuelPricePerTon),
    estimatedCIISaving: (actualCII * 0.08).toFixed(2),
  });

  return recs;
}