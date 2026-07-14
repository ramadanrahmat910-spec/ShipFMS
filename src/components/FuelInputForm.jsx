"use client";
// components/FuelInputForm.jsx — REVISI
// ========================================
// [FIX] Field "Jarak (nm)" dihapus dari tampilan form — user diminta
// tidak perlu (dan tidak bisa) mengisi jarak secara manual di form.
// Jarak tetap dihitung otomatis via Haversine (logic-nya TIDAK berubah),
// hanya saja sekarang murni internal (form.distance) dan baru
// ditampilkan setelah submit, di panel hasil (lihat dashboard/input/page.js).

import { useState, useEffect } from "react";
import { calculateCII, getAllShips, getCIIHistory } from "@/lib/api";

// Carbon Factor (Cf) — disamakan persis dengan FUEL_CF di lib/ciiCalculation.js
// supaya info yang ditampilkan ke user konsisten dengan yang dipakai backend.
const CF_FACTORS = {
  B40: 2.390, // berlaku Jan–Jun 2026
  B50: 2.343, // berlaku Jul 2026+
};
const FUEL_OPTIONS = ["B40", "B50"];

// Koordinat pelabuhan (hardcode sementara, nanti sebaiknya diganti fetch
// dari tabel `port` di DB via /api/ports -- supaya 1 sumber data yang sama
// dengan fallback Haversine di backend, bukan 2 daftar terpisah yang bisa
// beda-beda isinya)
const PORT_COORDS = {
  "Gresik (Surabaya), Java [ID]": { lat: -7.15389, lon: 112.65611 },
  "Pantai Camplong [ID]": { lat: -7.242325, lon: 113.2664 },
  "Ampenan [ID]": { lat: -8.5833, lon: 116.0833 },
  "Benoa, Bali [ID]": { lat: -8.7487, lon: 115.215 },
  "Manggis [ID]": { lat: -8.4697, lon: 115.51 },
  "Jakarta, Tanjung Priok [ID]": { lat: -6.1044, lon: 106.8814 },
  "Donggala [ID]": { lat: -0.678, lon: 119.752 },
  "Kendari [ID]": { lat: -3.9742, lon: 122.513 },
  "Banyuwangi (Tg Wangi) [ID]": { lat: -8.217, lon: 114.37 },
  "Bima [ID]": { lat: -8.46, lon: 118.72 },
};

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 3440.065;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function FuelInputForm({ onResult }) {
  const [form, setForm] = useState({
    shipKey: "klasogun",
    fuelType: "B40",
    portFrom: "Gresik (Surabaya), Java [ID]",
    portTo: "Pantai Camplong [ID]",
    distance: "181",   // tetap ada di state — dihitung otomatis, tidak diisi manual
    avgSpeed: "10",
    cargo: "6200",
  });
  const [ships, setShips] = useState([]);
  const [portList, setPortList] = useState([]);
  const [allRoutes, setAllRoutes] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  // [FIX] Sebelumnya, mengubah input (mis. Muatan) setelah hasil pertama
  // muncul TIDAK memicu apa pun sampai tombol "Hitung CII" ditekan lagi —
  // gampang kelewat, terasa seperti hasil "tidak ikut refresh". Sekarang:
  // setelah hasil pertama berhasil didapat (hasResult=true), perubahan
  // input APA PUN otomatis menghitung ulang (debounced 700ms) tanpa perlu
  // klik tombol lagi. Klik pertama tetap manual (tombol), supaya halaman
  // tidak langsung menampilkan hasil begitu dibuka.
  const [hasResult, setHasResult] = useState(false);

  useEffect(() => {
    getAllShips().then(setShips);
  }, []);

  useEffect(() => {
    getCIIHistory(form.shipKey).then((voyages) => {
      const ports = new Set();
      const routeMap = {};
      voyages.forEach((v) => {
        if (v.from_port) ports.add(v.from_port);
        if (v.to_port) ports.add(v.to_port);
        const key = `${v.from_port}|${v.to_port}`;
        if (!routeMap[key]) {
          routeMap[key] = {
            distance: v.distance_nm,
            days: (v.sea_time_hours / 24).toFixed(1),
          };
        }
      });
      setPortList(Array.from(ports).sort());
      setAllRoutes(routeMap);
    });
  }, [form.shipKey]);

  // Jarak dihitung otomatis tiap kali pelabuhan asal/tujuan berubah —
  // logic ini TIDAK berubah, cuma hasilnya tidak lagi ditampilkan di form.
  useEffect(() => {
    const fromCoord = PORT_COORDS[form.portFrom];
    const toCoord = PORT_COORDS[form.portTo];
    if (fromCoord && toCoord) {
      const dist = haversineDistance(fromCoord.lat, fromCoord.lon, toCoord.lat, toCoord.lon);
      setForm((f) => ({ ...f, distance: Math.round(dist).toString() }));
    }
  }, [form.portFrom, form.portTo]);

  useEffect(() => {
    if (portList.length > 0) {
      if (!portList.includes(form.portFrom)) setForm((f) => ({ ...f, portFrom: portList[0] }));
      if (!portList.includes(form.portTo)) setForm((f) => ({ ...f, portTo: portList[0] }));
    }
  }, [portList]);

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));
  const selectedShip = ships.find((s) => s.ship_key === form.shipKey);

  const handleSubmit = async (opts = {}) => {
    const { silent = false } = opts;
    if (!form.avgSpeed || parseFloat(form.avgSpeed) <= 0) {
      if (!silent) setError("Average speed harus diisi dan lebih dari 0 knot.");
      return;
    }
    if (form.portFrom === form.portTo) {
      if (!silent) setError("Pelabuhan asal dan tujuan tidak boleh sama.");
      return;
    }
    if (!form.cargo || parseFloat(form.cargo) <= 0) {
      if (!silent) setError("Muatan / cargo harus diisi dan lebih dari 0 ton.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const payload = {
        shipKey: form.shipKey,
        fuelType: form.fuelType,
        portFrom: form.portFrom,
        portTo: form.portTo,
        distance: parseFloat(form.distance),   // tetap dikirim, cuma tidak dari input manual
        avgSpeed: parseFloat(form.avgSpeed),
        cargo: parseFloat(form.cargo),
      };
      const result = await calculateCII(payload);
      setHasResult(true);
      onResult && onResult(result);
    } catch {
      if (!silent) setError("Gagal menghitung CII.");
    } finally {
      setLoading(false);
    }
  };

  // [FIX] Auto-recalculate (debounced) setiap kali input berubah, TAPI
  // hanya setelah hasil pertama berhasil didapat (hasResult=true) —
  // supaya "Muatan", kecepatan, pelabuhan, atau jenis BBM yang diubah
  // langsung tercermin di hasil & rekomendasi tanpa perlu klik tombol lagi.
  useEffect(() => {
    if (!hasResult) return;
    const t = setTimeout(() => {
      handleSubmit({ silent: true });
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.shipKey, form.fuelType, form.portFrom, form.portTo, form.avgSpeed, form.cargo]);

  return (
    <div className="flex flex-col gap-5">
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="text-sm font-medium text-gray-800 mb-3">Pilih Kapal</div>
        <div className="grid grid-cols-2 gap-3">
          {ships.map((ship) => (
            <button
              key={ship.ship_key}
              onClick={() => set("shipKey", ship.ship_key)}
              className={`text-left p-3 rounded-lg border transition-all ${
                form.shipKey === ship.ship_key
                  ? "border-blue-400 bg-blue-50"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <div className="w-7 h-7 rounded-md bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-700">
                  {ship.ship_key[0]?.toUpperCase()}
                </div>
                <span className="text-xs font-medium text-gray-800">{ship.name}</span>
              </div>
              <div className="text-xs text-gray-400">
                {ship.vessel_type} · DWT {ship.dwt?.toLocaleString()}
              </div>
            </button>
          ))}
        </div>
        {selectedShip && (
          <div className="mt-3 text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
            Kapal dipilih: <span className="font-medium text-gray-600">{selectedShip.name}</span>
            {" · "}Konsumsi bahan bakar akan dihitung otomatis dari model regresi kapal ini.
          </div>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="text-sm font-medium text-gray-800 mb-3">Jenis Bahan Bakar</div>
        <Field label="Fuel Type" required>
          <select value={form.fuelType} onChange={(e) => set("fuelType", e.target.value)}>
            {FUEL_OPTIONS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </Field>
        <div className="mt-2 px-3 py-2 rounded-lg bg-blue-50 border border-blue-100 text-xs text-blue-800">
          Carbon Factor {form.fuelType}: {CF_FACTORS[form.fuelType]} g CO₂/g fuel
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="text-sm font-medium text-gray-800 mb-3">
          Rute Pelayaran (khusus {selectedShip?.name || "kapal"})
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Pelabuhan Asal (Origin)" required>
            <select value={form.portFrom} onChange={(e) => set("portFrom", e.target.value)}>
              {portList.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </Field>
          <Field label="Pelabuhan Tujuan (Destination)" required>
            <select value={form.portTo} onChange={(e) => set("portTo", e.target.value)}>
              {portList.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </Field>
        </div>
        {/* [FIX] Average Speed dipusatkan di barisnya sendiri — sebelumnya
            menempel di kolom kanan grid 2-kolom dengan ruang kosong di
            kiri karena field Jarak sudah dihapus dari sini. */}
        <div className="mt-4 flex justify-center">
          <div className="w-full max-w-[220px]">
            <Field label="Average Speed (knot)" required>
              <input
                type="number"
                value={form.avgSpeed}
                min="0.1"
                step="0.1"
                onChange={(e) => set("avgSpeed", e.target.value)}
                placeholder="Kecepatan rata-rata"
              />
            </Field>
          </div>
        </div>
        <div className="mt-2 text-xs text-gray-400">
          Jarak antar pelabuhan dihitung otomatis (rumus Haversine) dan akan ditampilkan
          bersama estimasi durasi di halaman hasil setelah Anda submit.
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="text-sm font-medium text-gray-800 mb-3">Data Operasional</div>
        <Field label="Muatan / Cargo (ton)" required>
          <input type="number" value={form.cargo} min="0" onChange={(e) => set("cargo", e.target.value)} />
        </Field>
      </div>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">{error}</div>
      )}

      <button
        onClick={() => handleSubmit()}
        disabled={loading}
        className="w-full py-3 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 active:scale-[0.98] transition-all disabled:opacity-50"
      >
        {loading ? "Menghitung..." : "Hitung CII & Dapatkan Rekomendasi →"}
      </button>
      {hasResult && (
        <div className="text-xs text-gray-400 text-center -mt-2">
          {loading
            ? "Memperbarui hasil otomatis…"
            : "Hasil sudah tersedia — ubah input apa pun dan hasil akan otomatis dihitung ulang."}
        </div>
      )}
    </div>
  );
}

function Field({ label, children, required }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs text-gray-500">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      <div className="[&>select]:w-full [&>select]:text-sm [&>select]:px-3 [&>select]:py-2 [&>select]:border [&>select]:border-gray-200 [&>select]:rounded-lg [&>select]:bg-white [&>select]:text-gray-900 [&>input]:w-full [&>input]:text-sm [&>input]:px-3 [&>input]:py-2 [&>input]:border [&>input]:border-gray-200 [&>input]:rounded-lg [&>input]:bg-white [&>input]:text-gray-900 [&>input:focus]:outline-none [&>input:focus]:border-blue-400 [&>select:focus]:outline-none [&>select:focus]:border-blue-400">
        {children}
      </div>
    </div>
  );
}