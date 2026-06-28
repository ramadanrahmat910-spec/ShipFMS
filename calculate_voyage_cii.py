#!/usr/bin/env python3
"""
Mengisi ulang kolom cii_attained & rating di tabel voyage.
- Balongan:  pakai model regresi (k × speed³ + AE_per_hour)
- Klasogun:  fallback rata‑rata tahunan dengan koreksi kubik
"""

import psycopg2

DB_CONFIG = {
    "host": "localhost",
    "port": 5432,
    "database": "ship_cii_database",
    "user": "postgres",
    "password": "112233",
}

CF_B40 = 2.65
DESIGN_SPEED = 10.0
AE_CONSUMPTION = 2.5          # ton/hari, fallback kalau model tidak punya intercept

conn = psycopg2.connect(**DB_CONFIG)
conn.autocommit = False
cur = conn.cursor()

# ── Ambil parameter model regresi per kapal (Balongan) ──
cur.execute("SELECT ship_key, fuel_coef_speed, fuel_intercept FROM ship WHERE fuel_coef_speed IS NOT NULL")
model_params = {row[0]: {'k': float(row[1]), 'ae': float(row[2])} for row in cur.fetchall()}

# ── Ambil DWT dan data fallback tahunan ──
cur.execute("SELECT id, ship_key, dwt FROM ship")
ships = {}
fuel_annual = {}
for row in cur.fetchall():
    s_id, key, dwt = row
    ships[s_id] = {'key': key, 'dwt': float(dwt)}
    # Ambil fuel_annual 2025 sebagai fallback
    cur.execute("SELECT fuel_cons_mt, distance_nm FROM fuel_annual WHERE ship_id=%s AND year=2025", (s_id,))
    fa = cur.fetchone()
    if fa and fa[1] > 0:
        annual_fuel = float(fa[0])
        annual_dist = float(fa[1])
        operational_days = annual_dist / (DESIGN_SPEED * 24)
        if operational_days > 0:
            total_per_day = annual_fuel / operational_days
            me_per_day = max(0, total_per_day - AE_CONSUMPTION)
            fuel_annual[s_id] = {'me_per_day': me_per_day}

# ── Proses semua voyage ──
cur.execute("""
    SELECT v.id, v.distance_nm, v.avg_speed_knots, v.sea_time_days,
           v.ship_id, v.date_departure, v.from_port, v.to_port, v.sail_condition
    FROM voyage v
""")
voyages = cur.fetchall()
print(f"Ditemukan {len(voyages)} voyage")

updated = 0
for v_id, dist, speed, sea_days, ship_id, dep_date, from_port, to_port, sail_cond in voyages:
    if not dist or dist == 0 or not sea_days or sea_days <= 0:
        continue
    try:
        dist = float(dist)
        speed = float(speed) if speed else DESIGN_SPEED
        sea_days = float(sea_days)
    except (TypeError, ValueError):
        continue

    year = dep_date.year if dep_date else 2025
    ship = ships.get(ship_id)
    if not ship:
        continue
    dwt = ship['dwt']
    ship_key = ship['key']

    # ── Pilih metode: model regresi atau fallback ──
    if ship_key in model_params:
        # ✅ Balongan: pakai model regresi
        k = model_params[ship_key]['k']
        ae_per_hour = model_params[ship_key]['ae']
        me_per_hour = k * (speed ** 3)
        fuel_per_hour = me_per_hour + ae_per_hour
        total_fuel = fuel_per_hour * sea_days * 24  # sea_days dalam hari
    else:
        # 🔁 Klasogun: fallback rata‑rata tahunan
        fa = fuel_annual.get(ship_id)
        if not fa:
            continue
        me_per_day = fa['me_per_day']
        me_voyage_per_day = me_per_day * (speed / DESIGN_SPEED) ** 3
        total_fuel = (me_voyage_per_day + AE_CONSUMPTION) * sea_days

    # ── Hitung CII ──
    cii_attained = (total_fuel * 1_000_000 * CF_B40) / (dwt * dist)
    cii_attained = round(cii_attained, 4)

    # ── Rating dari cii_boundaries ──
    cur.execute("""
        SELECT boundary_superior, boundary_lower, boundary_upper, boundary_inferior
        FROM cii_boundaries
        WHERE ship_id = %s AND year = %s
    """, (ship_id, year))
    bounds = cur.fetchone()
    if not bounds:
        cur.execute("""
            SELECT boundary_superior, boundary_lower, boundary_upper, boundary_inferior
            FROM cii_boundaries
            WHERE ship_id = %s AND year = 2025
        """, (ship_id,))
        bounds = cur.fetchone()

    if not bounds:
        rating = 'C'
    else:
        sup, low, upp, inf = map(float, bounds)
        if cii_attained <= sup:
            rating = 'A'
        elif cii_attained <= low:
            rating = 'B'
        elif cii_attained <= upp:
            rating = 'C'
        elif cii_attained <= inf:
            rating = 'D'
        else:
            rating = 'E'

    cur.execute("UPDATE voyage SET cii_attained=%s, rating=%s WHERE id=%s",
                (cii_attained, rating, v_id))
    updated += 1

conn.commit()
cur.close()
conn.close()
print(f"Selesai! {updated} voyage telah dihitung ulang.")