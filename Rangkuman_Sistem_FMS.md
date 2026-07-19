# Rangkuman Alur Kerja Sistem Ship FMS (Fleet Management System) & CII Dashboard

Secara garis besar, aplikasi ini memiliki 3 tahapan utama: **1. Pengumpulan Data (Source Data)**, **2. Pengolahan Data & Perhitungan (Processing)**, dan **3. Visualisasi & Sistem Pendukung Keputusan (DSS)**.

## 1. Source Data (Sumber Data)
Data dalam sistem ini tersimpan secara terpusat di **Supabase (PostgreSQL)**, yang mencakup:
* **Data Statis Kapal & Pelabuhan:** Master data spesifikasi kapal (seperti bobot mati/DWT, tipe kapal) dan koordinat pelabuhan.
* **Data Voyage (Perjalanan):** Catatan keberangkatan, kedatangan, jarak tempuh, jenis bahan bakar yang digunakan, dan muatan kapal.
* **Data AIS (Automatic Identification System):** Data koordinat GPS kapal, kecepatan (SOG), dan arah (COG) yang terekam setiap waktu. 
* **Data Real-time:** Untuk mode *Live*, sistem menerima data posisi kapal asli secara *real-time* melalui jalur *WebSocket*.

## 2. Pengolahan Data (Processing)
Proses komputasi dilakukan secara berkesinambungan (di *backend API* dan *database view*):
* **Kalkulasi Emisi Karbon (CO₂):** Jumlah konsumsi bahan bakar dikalikan dengan *Carbon Factor (Cf)* standar dari regulasi **IMO (International Maritime Organization)** untuk mendapatkan total emisi CO₂.
* **Perhitungan Nilai CII (Carbon Intensity Indicator):** Sistem menghitung nilai *Attained CII* dengan rumus: `Total Emisi CO₂ / (Kapasitas DWT x Jarak Tempuh)`. Angka yang dihasilkan (`Running CII`) akan dibandingkan dengan target tahunan IMO (`Required CII`).
* **Penentuan Grade (A-E):** Berdasarkan selisih batas dari perhitungan di atas, sistem akan mengelompokkan kapal ke dalam *Grade* A, B, C, D, atau E (dimana A sangat baik, dan E sangat buruk/tidak efisien).
* **Interpolasi Animasi Peta:** Untuk fitur Simulasi 2025, sistem menarik ribuan titik koordinat AIS, lalu mengolahnya *(downsampling)* agar pergerakan kapal bisa diputar ulang (di-animasikan) di peta secara halus dan presisi.

## 3. Visualisasi & Decision Support System (DSS)
Data yang sudah diolah ditampilkan kepada pengguna *(Fleet Manager)* menggunakan framework **Next.js & React**:
* **Dashboard & Peta Interaktif:** Memberikan rangkuman operasional secara instan. Jika sebuah rute perjalanan dari tabel "Histori" diklik, peta (menggunakan *Leaflet.js*) akan otomatis menyorot spesifik ke rute tersebut.
* **Grafik Pemantauan Tren:** Menampilkan grafik garis *(Recharts)* untuk memantau apakah performa CII kapal perlahan membaik atau memburuk seiring waktu.
* **Sistem Pendukung Keputusan (DSS):** Jika performa kapal memburuk, manajer bisa membuka modul DSS. Sistem menggunakan perhitungan **MACC (Marginal Abatement Cost Curve)** yang secara otomatis:
  1. Mengevaluasi berbagai opsi efisiensi (misal: modifikasi *Trim & Ballast*, pakai BBM alternatif B50, bersihkan lambung, dll).
  2. Menghitung *Cost per Ton CO₂ Reduced* (Biaya yang dikeluarkan untuk setiap 1 ton CO₂ yang berhasil dicegah).
  3. Merangking skenario tersebut untuk menghasilkan **Top 3 Rekomendasi Tindakan** terbaik, mempertimbangkan mana yang paling hemat biaya (menyelamatkan kantong perusahaan) sekaligus paling ramah lingkungan.
