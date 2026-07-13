#!/usr/bin/env python3
"""
migrate_to_supabase.py — ShipCII Dashboard
===========================================
Pindahkan data dari PostgreSQL lokal ke Supabase.

Urutan tabel (penting — ikuti foreign key dependency):
  1. ship           (tidak ada FK)
  2. port           (tidak ada FK)
  3. fuel_price     (tidak ada FK)
  4. cii_boundaries (FK → ship)
  5. fuel_annual    (FK → ship)
  6. voyage         (FK → ship)
  7. noon_report    (FK → ship)
  8. cii_daily      (FK → ship)
  9. ais_tracking   (FK → ship, voyage — voyage_id boleh NULL)

Perbaikan dari versi sebelumnya:
  - Urutan tabel mengikuti dependency FK
  - ais_tracking pakai streaming cursor (data terbesar ~89k baris)
  - Retry otomatis jika koneksi putus
  - cii_daily dan fuel_price ikut dimigrasi (tabel baru)
  - session_replication_role dikembalikan di blok finally
"""

import time
import psycopg2
from psycopg2.extras import execute_values

# ─── CONFIG ──────────────────────────────────────────────────
LOCAL_DB = {
    "host":     "localhost",
    "port":     5432,
    "database": "ship_cii_database",
    "user":     "postgres",
    "password": "112233",
}

SUPABASE_DB = {
    "host":     "aws-1-ap-south-1.pooler.supabase.com",
    "port":     5432,
    "database": "postgres",
    "user":     "postgres.qjqpepkgjfpbbwnvzuts",
    "password": "TArahmat77!",
    "sslmode":  "require",
    "connect_timeout": 30,
}

CHUNK_SIZE  = 500   # baris per insert batch
MAX_RETRIES = 3
RETRY_DELAY = 5     # detik

# Urutan WAJIB ikuti FK dependency
# Format: (nama_tabel, [kolom], pakai_streaming?)
TABLES = [
    ("ship", [
        "id", "ship_key", "name", "imo", "mmsi", "call_sign",
        "vessel_type", "flag", "owner", "year_built", "dwt",
        "gross_tonnage", "length_m", "beam_m", "draft_m",
        "main_engine", "mcr_kw", "fuel_types",
        "cii_param_a", "cii_param_c", "cii_ref_value",
        "fuel_coef_speed", "fuel_coef_laden", "fuel_intercept",
    ], False),

    ("port", [
        "id", "port_name", "lat", "lon", "timezone",
    ], False),

    ("fuel_price", [
        "id", "fuel_type", "valid_from", "valid_until",
        "price_per_liter", "price_per_mt", "density_kg_l",
        "cf_imo", "bio_pct", "notes",
    ], False),

    ("cii_boundaries", [
        "id", "ship_id", "year", "cii_ref", "cii_req", "cii_attained",
        "rating", "boundary_superior", "boundary_lower",
        "boundary_upper", "boundary_inferior", "reduction_factor",
    ], False),

    ("fuel_annual", [
        "id", "ship_id", "year", "fuel_cons_mt", "distance_nm",
    ], False),

    ("voyage", [
        "id", "ship_id", "voyage_code", "date_departure", "date_arrived",
        "from_port", "to_port", "distance_nm", "sea_time_hours",
        "sea_time_days", "sail_condition", "avg_speed_knots",
        "fuel_me_ton", "fuel_ae_ton", "cii_attained", "rating",
        "cii_ref", "cii_req", "boundary_superior", "boundary_lower",
        "boundary_upper", "boundary_inferior",
        "fuel_type", "fuel_cons_actual", "fuel_cons_mlr",
        "co2_emission_ton", "cargo_ton",
    ], False),

    ("noon_report", [
        "id", "ship_id", "voyage_date", "from_port", "to_port",
        "avg_speed", "distance_nm", "steaming_time_h", "cargo_status",
        "fuel_cons_mt_per_day", "fuel_type", "fuel_cons_mlr",
        "rpm", "weather", "current_location",
    ], False),

    ("cii_daily", [
        "id", "ship_id", "date", "year", "month",
        "distance_nm_day", "fuel_cons_mt_day", "co2_emission_g_day",
        "distance_nm_ytd", "fuel_cons_mt_ytd", "co2_emission_g_ytd",
        "transport_work_ytd", "running_cii", "cii_required",
        "running_grade", "projected_cii_eoy",
        "days_to_limit", "date_limit_reached",
    ], False),

    ("ais_tracking", [
        "id", "ship_id", "voyage_id", "ais_record_id", "base_datetime",
        "timestamp_wib", "lat", "lon", "sog", "cog", "heading",
        "status", "cargo_status", "ais_point_type", "is_estimated",
        "mmsi", "ais_class",
    ], True),   # streaming = True karena data besar
]


# ─── KONEKSI ─────────────────────────────────────────────────

def connect_supabase():
    conn = psycopg2.connect(**SUPABASE_DB)
    conn.autocommit = False
    return conn


# ─── HELPERS ─────────────────────────────────────────────────

def get_valid_columns(table_name: str, cur) -> list[str]:
    """Ambil kolom yang benar-benar ada di tabel (hindari error kolom tidak ada)."""
    cur.execute("""
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = %s
        ORDER BY ordinal_position
    """, (table_name,))
    return [r[0] for r in cur.fetchall()]


def insert_chunk(supa_conn, sql: str, chunk: list, table_name: str) -> int:
    """Insert satu chunk dengan retry jika koneksi putus."""
    last_err = None

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            with supa_conn.cursor() as cur:
                execute_values(cur, sql, chunk, page_size=CHUNK_SIZE)
            supa_conn.commit()
            return len(chunk)

        except (psycopg2.OperationalError, psycopg2.InterfaceError) as e:
            last_err = e
            print(f"    ⚠ Koneksi putus (percobaan {attempt}/{MAX_RETRIES}): {e}")
            try:
                supa_conn.rollback()
            except Exception:
                pass
            time.sleep(RETRY_DELAY)

        except psycopg2.errors.UniqueViolation:
            supa_conn.rollback()
            return 0  # Data sudah ada, skip

        except Exception as e:
            print(f"    ⚠ Error insert {table_name}: {e}")
            try:
                supa_conn.rollback()
            except Exception:
                pass
            return 0

    print(f"    ❌ Gagal setelah {MAX_RETRIES} percobaan: {last_err}")
    return 0


def migrate_small(table_name, columns, local_cur, supa_conn) -> int:
    """Untuk tabel kecil: fetchall lalu insert per chunk."""
    cols_str = ", ".join(columns)
    local_cur.execute(f"SELECT {cols_str} FROM {table_name}")
    rows = local_cur.fetchall()

    if not rows:
        print("    (kosong)")
        return 0

    sql = f"INSERT INTO {table_name} ({cols_str}) VALUES %s ON CONFLICT DO NOTHING"
    total = 0
    for i in range(0, len(rows), CHUNK_SIZE):
        chunk = rows[i:i + CHUNK_SIZE]
        total += insert_chunk(supa_conn, sql, chunk, table_name)
        print(f"    {total:,}/{len(rows):,} baris...", end="\r")

    print()
    return total


def migrate_streamed(table_name, columns, local_conn, supa_conn) -> int:
    """
    Untuk tabel besar (ais_tracking): server-side cursor di local DB
    agar tidak load seluruh data ke RAM sekaligus.
    """
    cols_str = ", ".join(columns)
    sql_insert = f"INSERT INTO {table_name} ({cols_str}) VALUES %s ON CONFLICT DO NOTHING"

    server_cur = local_conn.cursor(name=f"stream_{table_name}")
    server_cur.itersize = CHUNK_SIZE
    server_cur.execute(f"SELECT {cols_str} FROM {table_name}")

    total = 0
    while True:
        chunk = server_cur.fetchmany(CHUNK_SIZE)
        if not chunk:
            break
        moved = insert_chunk(supa_conn, sql_insert, chunk, table_name)
        total += moved
        print(f"    {total:,} baris...", end="\r")
        time.sleep(0.2)

    server_cur.close()
    print()
    return total


# ─── MAIN ─────────────────────────────────────────────────────

def main():
    print("Menghubungkan ke database lokal...")
    local_conn = psycopg2.connect(**LOCAL_DB)
    local_cur  = local_conn.cursor()

    print("Menghubungkan ke Supabase...")
    supa_conn = connect_supabase()

    # Nonaktifkan trigger & FK check saat insert massal
    with supa_conn.cursor() as cur:
        cur.execute("SET session_replication_role = 'replica';")
    supa_conn.commit()
    print("✅ Terhubung. Mulai migrasi...\n")

    total_moved = 0

    try:
        for table_name, desired_cols, use_stream in TABLES:
            print(f"[→] {table_name}")

            # Validasi kolom yang benar-benar ada di lokal
            local_cur.execute("""
                SELECT column_name FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = %s
            """, (table_name,))
            existing = {r[0] for r in local_cur.fetchall()}

            if not existing:
                print(f"    Tabel tidak ditemukan di lokal, dilewati.")
                continue

            valid_cols = [c for c in desired_cols if c in existing]
            if not valid_cols:
                print(f"    Tidak ada kolom cocok, dilewati.")
                continue

            if use_stream:
                count = migrate_streamed(table_name, valid_cols, local_conn, supa_conn)
            else:
                count = migrate_small(table_name, valid_cols, local_cur, supa_conn)

            total_moved += count
            print(f"    ✅ {count:,} baris dipindahkan.\n")

    finally:
        # Kembalikan replication role ke normal — WAJIB ada di finally
        try:
            with supa_conn.cursor() as cur:
                cur.execute("SET session_replication_role = 'origin';")
            supa_conn.commit()
        except Exception as e:
            print(f"⚠ Gagal reset session_replication_role: {e}")

        local_cur.close()
        local_conn.close()
        try:
            supa_conn.close()
        except Exception:
            pass

    print(f"{'='*55}")
    print(f"✅ Migrasi selesai. Total {total_moved:,} baris dipindahkan.")
    print(f"{'='*55}")
    print("\nVerifikasi di Supabase SQL Editor:")
    print("""
  SELECT
    'ship'          AS tbl, COUNT(*) FROM ship          UNION ALL
  SELECT 'port',           COUNT(*) FROM port           UNION ALL
  SELECT 'fuel_price',     COUNT(*) FROM fuel_price     UNION ALL
  SELECT 'voyage',         COUNT(*) FROM voyage         UNION ALL
  SELECT 'noon_report',    COUNT(*) FROM noon_report    UNION ALL
  SELECT 'cii_daily',      COUNT(*) FROM cii_daily      UNION ALL
  SELECT 'ais_tracking',   COUNT(*) FROM ais_tracking;
    """)


if __name__ == "__main__":
    main()