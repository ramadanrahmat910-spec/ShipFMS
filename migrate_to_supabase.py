#!/usr/bin/env python3
"""
Migrasi data ke Supabase dengan chunking & disable timeout.

PERBAIKAN dari versi sebelumnya:
1. Host diganti ke Session Pooler (aws-1-ap-south-1.pooler.supabase.com).
   Direct connection (db.<ref>.supabase.co) sudah dicek HANYA resolve ke
   alamat IPv6 - tidak ada IPv4 sama sekali untuk project ini, sehingga
   gagal connect dari kebanyakan jaringan/ISP yang belum dukung IPv6 penuh.
2. Username untuk pooler HARUS pakai format postgres.<project-ref>,
   bukan cuma "postgres" (beda dari direct connection).
3. database di LOCAL_DB dicocokkan ke "ship_cii_db" - sebelumnya tertulis
   "ship_cii_database" yang beda dengan nama DB di script extract_noon_report.py.
   Sesuaikan lagi kalau nama DB lokal kamu memang berbeda.
4. SELECT ... FROM table sekarang pakai server-side cursor (named cursor) +
   fetch per batch, bukan fetchall() sekaligus. fetchall() pada tabel besar
   (terutama ais_tracking) memuat SELURUH isi tabel ke RAM Python dulu
   sebelum di-chunk untuk insert - ini bisa jadi penyebab proses macet/lambat
   atau out-of-memory, dan kontradiktif dengan tujuan "chunking" itu sendiri.
5. session_replication_role sekarang dikembalikan ke 'origin' di blok
   finally, supaya tetap ter-reset walau ada exception di tengah migrasi
   (penting karena lewat pooler, sesi bisa di-reuse oleh koneksi lain).
6. Tambah retry sederhana untuk insert per chunk kalau koneksi sempat putus.
"""

import psycopg2
from psycopg2.extras import execute_values
import time

LOCAL_DB = {
    "host": "localhost",
    "port": 5432,
    "database": "ship_cii_database",   
    "user": "postgres",
    "password": "112233",
}

SUPABASE_DB = {
    "host": "aws-1-ap-south-1.pooler.supabase.com",  # Session pooler, bukan direct connection
    "port": 5432,
    "database": "postgres",
    "user": "postgres.qjqpepkgjfpbbwnvzuts",  # format wajib: postgres.<project-ref>
    "password": "TArahmat77!",
    "sslmode": "require",
}

TABLES = {
    "ship": [
        "id", "ship_key", "name", "imo", "mmsi", "call_sign",
        "vessel_type", "flag", "owner", "year_built", "dwt",
        "gross_tonnage", "length_m", "beam_m", "draft_m",
        "main_engine", "mcr_kw", "fuel_types",
        "cii_param_a", "cii_param_c", "cii_ref_value",
        "fuel_coef_speed", "fuel_coef_laden", "fuel_intercept"
    ],
    "fuel_annual": [
        "id", "ship_id", "year", "fuel_cons_mt", "distance_nm"
    ],
    "cii_boundaries": [
        "id", "ship_id", "year", "cii_ref", "cii_req", "cii_attained",
        "rating", "boundary_superior", "boundary_lower",
        "boundary_upper", "boundary_inferior", "reduction_factor"
    ],
    "voyage": [
        "id", "ship_id", "voyage_code", "date_departure", "date_arrived",
        "from_port", "to_port", "distance_nm", "sea_time_hours", "sea_time_days",
        "sail_condition", "avg_speed_knots", "fuel_me_ton", "fuel_ae_ton",
        "cii_attained", "rating", "cii_ref", "cii_req",
        "boundary_superior", "boundary_lower", "boundary_upper", "boundary_inferior"
    ],
    "ais_tracking": [
        "id", "ship_id", "voyage_id", "ais_record_id", "base_datetime",
        "lat", "lon", "sog", "cog", "heading",
        "status", "cargo_status", "ais_point_type", "is_estimated", "progress_pct",
        "weather", "temperature_c", "wind_speed_kn", "wind_direction", "beaufort_scale"
    ],
    "noon_report": [
        "id", "ship_id", "voyage_date", "from_port", "to_port",
        "avg_speed", "distance_nm", "steaming_time_h", "cargo_status",
        "fuel_cons_mt_per_day", "fuel_type"
    ],
    "port": [
        "id", "port_name", "lat", "lon", "timezone"
    ],
}

CHUNK_SIZE = 1000  # kecilkan lagi jika masih timeout
MAX_RETRIES = 3
RETRY_DELAY_SEC = 3

# Tabel yang diperkirakan besar -> selalu pakai streaming fetch + chunk insert
LARGE_TABLES = {"ais_tracking"}


def get_existing_columns(table_name, cur):
    cur.execute(f"SELECT * FROM {table_name} LIMIT 0")
    return [desc[0] for desc in cur.description]


def reconnect_supabase():
    """Buat koneksi baru ke Supabase. Dipakai untuk retry setelah koneksi putus."""
    conn = psycopg2.connect(**SUPABASE_DB)
    return conn


def insert_chunk_with_retry(supabase_conn_holder, sql, chunk):
    """
    supabase_conn_holder: list 1 elemen berisi connection object, supaya bisa
    diganti (reconnect) dari dalam fungsi ini tanpa perlu return koneksi baru
    secara eksplisit ke setiap caller.
    """
    last_err = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            conn = supabase_conn_holder[0]
            with conn.cursor() as cur:
                cur.execute("SET LOCAL statement_timeout = '0';")
                execute_values(cur, sql, chunk, template=None)
            conn.commit()
            return len(chunk)
        except (psycopg2.OperationalError, psycopg2.InterfaceError) as e:
            # Koneksi terputus -> reconnect lalu retry
            last_err = e
            print(f"    ⚠️ Koneksi putus (percobaan {attempt}/{MAX_RETRIES}): {e}")
            try:
                supabase_conn_holder[0].close()
            except Exception:
                pass
            time.sleep(RETRY_DELAY_SEC)
            try:
                supabase_conn_holder[0] = reconnect_supabase()
            except Exception as conn_err:
                last_err = conn_err
                continue
        except Exception as e:
            # Error lain (misal constraint violation) -> jangan retry, langsung rollback & lapor
            print(f"    ⚠️ Error saat insert chunk: {e}")
            try:
                supabase_conn_holder[0].rollback()
            except Exception:
                pass
            return 0
    print(f"    ❌ Gagal setelah {MAX_RETRIES} percobaan: {last_err}")
    return 0


def migrate_small_table(table_name, valid_cols, local_cur, supabase_conn_holder):
    """Untuk tabel kecil: SELECT semua lalu insert sekali (masih aman karena kecil)."""
    cols_str = ', '.join(valid_cols)
    local_cur.execute(f"SELECT {cols_str} FROM {table_name}")
    rows = local_cur.fetchall()
    if not rows:
        print("  Kosong")
        return 0

    sql = f"INSERT INTO {table_name} ({cols_str}) VALUES %s ON CONFLICT DO NOTHING"
    return insert_chunk_with_retry(supabase_conn_holder, sql, rows)


def migrate_large_table_streamed(table_name, valid_cols, local_conn, supabase_conn_holder):
    """
    Untuk tabel besar: pakai server-side (named) cursor di sisi LOCAL supaya
    psycopg2 tidak menarik seluruh hasil SELECT ke memori sekaligus.
    Data ditarik per CHUNK_SIZE baris dan langsung di-insert per chunk.
    """
    cols_str = ', '.join(valid_cols)
    sql_insert = f"INSERT INTO {table_name} ({cols_str}) VALUES %s ON CONFLICT DO NOTHING"

    # Nama cursor unik wajib untuk server-side cursor di psycopg2
    server_cur = local_conn.cursor(name=f"stream_{table_name}")
    server_cur.itersize = CHUNK_SIZE
    server_cur.execute(f"SELECT {cols_str} FROM {table_name}")

    total = 0
    while True:
        chunk = server_cur.fetchmany(CHUNK_SIZE)
        if not chunk:
            break
        moved = insert_chunk_with_retry(supabase_conn_holder, sql_insert, chunk)
        total += moved
        print(f"  {total} baris...", end='\r')
        time.sleep(0.3)  # jeda kecil biar server tidak overload

    server_cur.close()
    print()
    return total


def migrate_table(table_name, columns, local_conn, local_cur, supabase_conn_holder):
    print(f"Memindahkan {table_name}...")
    try:
        existing_cols = get_existing_columns(table_name, local_cur)
    except Exception as e:
        print(f"  Tabel {table_name} tidak ditemukan: {e}")
        local_conn.rollback()  # bersihkan transaksi yang gagal supaya cursor berikutnya tidak ikut error
        return 0

    valid_cols = [c for c in columns if c in existing_cols]
    if not valid_cols:
        print("  Tidak ada kolom cocok")
        return 0

    if table_name in LARGE_TABLES:
        return migrate_large_table_streamed(table_name, valid_cols, local_conn, supabase_conn_holder)
    else:
        return migrate_small_table(table_name, valid_cols, local_cur, supabase_conn_holder)


def main():
    local_conn = psycopg2.connect(**LOCAL_DB)
    local_cur = local_conn.cursor()

    # supabase_conn_holder adalah list 1-elemen agar koneksi bisa "diganti" (reconnect)
    # dari dalam insert_chunk_with_retry tanpa perlu mekanisme return rumit.
    supabase_conn_holder = [psycopg2.connect(**SUPABASE_DB)]
    supabase_conn_holder[0].cursor().execute("SET session_replication_role = 'replica';")
    supabase_conn_holder[0].commit()

    total_moved = 0
    try:
        for tbl, cols in TABLES.items():
            count = migrate_table(tbl, cols, local_conn, local_cur, supabase_conn_holder)
            total_moved += count
            print(f"  {count} baris dipindahkan.")
    finally:
        # Pastikan replication role selalu dikembalikan ke normal, bahkan jika
        # ada exception yang tidak tertangani di tengah migrasi.
        try:
            supabase_conn_holder[0].cursor().execute("SET session_replication_role = 'origin';")
            supabase_conn_holder[0].commit()
        except Exception as e:
            print(f"⚠️ Gagal reset session_replication_role: {e}")

        local_cur.close()
        local_conn.close()
        try:
            supabase_conn_holder[0].close()
        except Exception:
            pass

    print(f"\n✅ Total {total_moved} baris dipindahkan ke Supabase.")


if __name__ == "__main__":
    main()