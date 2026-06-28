import pandas as pd
import re
import psycopg2
from datetime import datetime, date

EXCEL_FILE = r"C:/Users/N1NRK/Downloads/NOON_REPORT_JUNE_2026.xlsx"

# Set False agar data tersimpan ke database
DRY_RUN = False

UNIT_WORDS = {
    'KNOT', 'NM', 'HOUR', 'MT', 'MT/DAY', 'LITRE', 'LITRE/DAY',
    'DEGREE', 'S', 'E', 'KL', 'KL/HOUR', 'MT PER HOUR', 'KL PER HOUR',
    'MT IN AIR'
}

DB_CONFIG = {
    "host": "localhost",
    "port": 5432,
    "database": "ship_cii_database",
    "user": "postgres",
    "password": "112233",
}


def is_unit(text):
    return text.strip().upper() in UNIT_WORDS


def scan_right(df, row_idx, start_col, max_cols=10):
    n_cols = df.shape[1]
    for col_idx in range(start_col, min(start_col + max_cols, n_cols)):
        val = df.iloc[row_idx, col_idx]
        if pd.isna(val):
            continue
        text = str(val).strip()
        if text == '':
            continue
        if is_unit(text):
            continue
        return text
    return None


def find_label_cell(df, label):
    label_u = label.strip().upper()
    for row_idx in range(df.shape[0]):
        for col_idx in range(df.shape[1]):
            cell = df.iloc[row_idx, col_idx]
            if pd.isna(cell):
                continue
            if str(cell).strip().upper() == label_u:
                return row_idx, col_idx
    return None


def find_label_cell_startswith(df, label):
    label_u = label.strip().upper()
    for row_idx in range(df.shape[0]):
        for col_idx in range(df.shape[1]):
            cell = df.iloc[row_idx, col_idx]
            if pd.isna(cell):
                continue
            if str(cell).strip().upper().startswith(label_u):
                return row_idx, col_idx
    return None


def find_value(df, label, exact=True):
    pos = find_label_cell(df, label) if exact else find_label_cell_startswith(df, label)
    if pos is None:
        return None
    row_idx, col_idx = pos
    return scan_right(df, row_idx, col_idx + 1)


def clean_numeric(text):
    if text is None:
        return None
    text = str(text).strip()
    text = re.sub(r'\s*(KNOT|NM|MT/DAY|MT|HOUR|LITRE/DAY|LITRE)\s*$', '', text, flags=re.IGNORECASE).strip()
    return text


def extract_date(df):
    for row_idx in range(df.shape[0]):
        for col_idx in range(df.shape[1]):
            cell = df.iloc[row_idx, col_idx]
            if isinstance(cell, (datetime, pd.Timestamp)):
                return cell.date() if hasattr(cell, 'date') else cell
            if isinstance(cell, date):
                return cell
    for row_idx in range(df.shape[0]):
        for col_idx in range(df.shape[1]):
            cell = df.iloc[row_idx, col_idx]
            if pd.isna(cell):
                continue
            text = str(cell)
            match = re.search(r'(\d{2}-[A-Za-z]{3}-\d{4})', text)
            if match:
                try:
                    return pd.to_datetime(match.group(1), dayfirst=True).date()
                except Exception:
                    pass
    return None


def extract_from_to(df):
    pos_from = find_label_cell(df, "FROM")
    if pos_from is None:
        return None, None
    row_idx, from_col = pos_from

    to_col = None
    n_cols = df.shape[1]
    for col_idx in range(from_col + 1, n_cols):
        cell = df.iloc[row_idx, col_idx]
        if pd.notna(cell) and str(cell).strip().upper() == "TO":
            to_col = col_idx
            break

    from_val = None
    limit = to_col if to_col is not None else min(from_col + 10, n_cols)
    for col_idx in range(from_col + 1, limit):
        cell = df.iloc[row_idx, col_idx]
        if pd.isna(cell):
            continue
        text = str(cell).strip()
        if text and not is_unit(text):
            from_val = text
            break

    to_val = None
    if to_col is not None:
        to_val = scan_right(df, row_idx, to_col + 1)

    return from_val, to_val


def get_cargo_status(df):
    pos = find_label_cell_startswith(df, "NOON CARGO OPERATION REPORT")
    if pos is None:
        return "Ballast"
    start_row, _ = pos
    for row_idx in range(start_row, min(start_row + 15, df.shape[0])):
        for col_idx in range(df.shape[1]):
            cell = df.iloc[row_idx, col_idx]
            if pd.isna(cell):
                continue
            text = str(cell).strip().upper()
            if text in ("GRADE A", "GRADE B", "GRADE C", "GRADE D"):
                cargo_name = scan_right(df, row_idx, col_idx + 1)
                if cargo_name and cargo_name.strip().upper() not in ('NAN', ''):
                    return "Laden"
    return "Ballast"


def extract_fuel_consumption(df):
    pos = find_label_cell_startswith(df, "CURRENT CONSUMPTION RATE")
    if pos is None:
        return None
    start_row, _ = pos
    for row_idx in range(start_row, min(start_row + 8, df.shape[0])):
        for col_idx in range(df.shape[1]):
            cell = df.iloc[row_idx, col_idx]
            if pd.isna(cell):
                continue
            if str(cell).strip().upper() == "B35/ME/AE":
                val = scan_right(df, row_idx, col_idx + 1)
                if val:
                    return val
    return None


def to_float(val):
    if val is None:
        return None
    try:
        return float(str(val).replace(',', '.').strip())
    except (ValueError, TypeError):
        return None


def process_sheet(xl, sheet_name):
    df = xl.parse(sheet_name, header=None)
    voyage_date = extract_date(df)
    from_port, to_port = extract_from_to(df)
    avg_speed = clean_numeric(find_value(df, "AVERAGE SPEED"))
    distance_nm = clean_numeric(find_value(df, "TOTAL DISTANCE TO RUN"))
    steaming_h = clean_numeric(find_value(df, "TOTAL STEAMING TIME"))
    fuel_mt_day = clean_numeric(extract_fuel_consumption(df))
    cargo_status = get_cargo_status(df)

    return {
        'voyage_date': voyage_date,
        'from_port': from_port,
        'to_port': to_port,
        'avg_speed': to_float(avg_speed),
        'distance_nm': to_float(distance_nm),
        'steaming_h': to_float(steaming_h),
        'fuel_mt_day': to_float(fuel_mt_day),
        'cargo_status': cargo_status,
    }


def main():
    xl = pd.ExcelFile(EXCEL_FILE)
    inserted = 0

    conn = None
    cur = None
    ship_id = None

    if not DRY_RUN:
        conn = psycopg2.connect(**DB_CONFIG)
        cur = conn.cursor()
        cur.execute("SELECT id FROM ship WHERE ship_key = 'balongan'")
        ship_id = cur.fetchone()[0]

    for sheet_name in xl.sheet_names:
        if "MAY" in sheet_name.upper() and "2018" in sheet_name:
            print(f"Lewati sheet template: {sheet_name}")
            continue

        print(f"Memproses: {sheet_name}")
        r = process_sheet(xl, sheet_name)

        critical = ['voyage_date', 'from_port', 'to_port']
        missing_critical = [k for k in critical if r[k] is None]
        if missing_critical:
            print(f"  ⚠️ Data kritis tidak lengkap (kosong: {missing_critical}): {r}")
            continue

        numeric_fields = ['avg_speed', 'distance_nm', 'steaming_h', 'fuel_mt_day']
        filled_zero = [k for k in numeric_fields if r[k] is None]
        for k in numeric_fields:
            if r[k] is None:
                r[k] = 0.0
        if filled_zero:
            print(f"  ℹ️ Kolom kosong diisi 0: {filled_zero}")

        if not DRY_RUN:
            cur.execute("""
                INSERT INTO noon_report (ship_id, voyage_date, from_port, to_port, avg_speed,
                        distance_nm, steaming_time_h, cargo_status, fuel_cons_mt_per_day, fuel_type)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT DO NOTHING
            """, (ship_id, r['voyage_date'], r['from_port'], r['to_port'], r['avg_speed'],
                  r['distance_nm'], r['steaming_h'], r['cargo_status'], r['fuel_mt_day'], 'B35'))

        inserted += 1
        print(f"  ✅ {r['voyage_date']}: {r['from_port']}→{r['to_port']} | "
              f"{r['avg_speed']}kn, {r['distance_nm']}nm, {r['steaming_h']}h, "
              f"{r['fuel_mt_day']} mt/d, status={r['cargo_status']}")

    if not DRY_RUN:
        conn.commit()
        cur.close()
        conn.close()
    print(f"\n✅ {inserted} record berhasil {'diekstrak (dry run)' if DRY_RUN else 'disimpan'}.")


if __name__ == "__main__":
    main()