#!/usr/bin/env python3
"""
Kalibrasi model konsumsi ME dengan hukum Admiralty:
   fuel_per_hour = k × speed³ + AE_per_hour
"""

import psycopg2
import numpy as np
from sklearn.linear_model import LinearRegression

DB_CONFIG = {
    "host": "localhost",
    "port": 5432,
    "database": "ship_cii_database",
    "user": "postgres",
    "password": "112233",
}

# 1. AE per jam dari data kapal diam (speed=0)
AE_PER_DAY = 0.96          # MT/day (dari Noon Report saat sandar)
AE_PER_HOUR = AE_PER_DAY / 24   # MT/hour

conn = psycopg2.connect(**DB_CONFIG)
cur = conn.cursor()

# 2. Ambil data berlayar (speed > 0), deduplikasi
cur.execute("""
    SELECT DISTINCT ON (voyage_date, from_port, to_port, avg_speed)
           avg_speed, fuel_cons_mt_per_day
    FROM noon_report
    WHERE avg_speed > 0 AND fuel_cons_mt_per_day > 0
    ORDER BY voyage_date, from_port, to_port, avg_speed
""")
rows = cur.fetchall()

if len(rows) < 3:
    print("Data terlalu sedikit.")
    cur.close()
    conn.close()
    exit()

# 3. Siapkan data regresi pada speed³
X = []   # speed³
y = []   # konsumsi ME per jam = (total_per_day/24 - AE_per_hour)
for speed, fuel_per_day in rows:
    speed = float(speed)
    fuel_per_hour = float(fuel_per_day) / 24.0
    me_per_hour = max(0, fuel_per_hour - AE_PER_HOUR)   # pastikan tidak negatif
    X.append([speed**3])
    y.append(me_per_hour)

X = np.array(X)
y = np.array(y)

# 4. Regresi linear tanpa intercept (karena intercept sudah AE)
model = LinearRegression(fit_intercept=False)
model.fit(X, y)
k = model.coef_[0]

# 5. Simpan parameter ke tabel ship
cur.execute("""
    UPDATE ship 
    SET fuel_coef_speed = %s,       -- kita pakai kolom ini untuk menyimpan k
        fuel_coef_laden = %s,       -- tidak dipakai, set 0
        fuel_intercept = %s         -- AE per jam
    WHERE ship_key = 'balongan'
""", (float(k), 0.0, float(AE_PER_HOUR)))

conn.commit()
cur.close()
conn.close()

print("=" * 50)
print(f"AE (dari data kapal diam) : {AE_PER_DAY:.3f} MT/day")
print(f"AE per hour              : {AE_PER_HOUR:.4f} MT/hour")
print(f"Koefisien k (ME ∝ speed³): {k:.8f}")
print(f"Rumus: fuel_per_hour = {k:.6f} × speed³ + {AE_PER_HOUR:.4f}")
print("=" * 50)