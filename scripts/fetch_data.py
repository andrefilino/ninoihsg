#!/usr/bin/env python3
"""
fetch_data.py
=============
Dijalankan oleh GitHub Actions (lihat .github/workflows/update-data.yml)
untuk memperbarui data/stocks.json secara berkala, sehingga halaman
statis di GitHub Pages "terasa" real-time walau tanpa server backend.

Sumber data: Yahoo Finance endpoint publik (tanpa API key) untuk kode
saham berakhiran ".JK" (format Yahoo untuk Bursa Efek Indonesia).
Ini adalah endpoint TIDAK RESMI — bisa berubah/dibatasi sewaktu-waktu.
Untuk penggunaan produksi/serius, gunakan penyedia data resmi seperti:
  - IDX (https://www.idx.co.id) untuk data harga & laporan resmi
  - Penyedia berbayar (mis. RTI Business, Stockbit, Sectors.app) yang
    juga menyediakan estimasi nilai wajar & rating fundamental

PENTING soal "Nilai Wajar" & rating (Kesehatan Financial, Rating Arus
Kas, Rating Pertumbuhan):
  Angka-angka ini BUKAN hasil riset profesional. Skrip ini memakai
  model heuristik sederhana (lihat fungsi di bawah) dari rasio yang
  tersedia gratis (P/E, PBV, pertumbuhan pendapatan, dsb). Ganti/kalibrasi
  fungsi `estimasi_nilai_wajar()` dan `beri_rating()` sesuai metodologi
  riset Anda sendiri sebelum dipakai untuk keputusan nyata.

Cara pakai lokal:
    pip install requests
    python scripts/fetch_data.py
Hasil ditulis ke data/stocks.json (menimpa file yang ada).
"""

import json
import time
import sys
from pathlib import Path
from datetime import datetime, timezone, timedelta

try:
    import requests
except ImportError:
    print("Perlu paket 'requests'. Jalankan: pip install requests", file=sys.stderr)
    sys.exit(1)

# Daftar emiten yang dipantau. Tambah/kurangi sesuai kebutuhan.
TICKERS = [
    "BBCA", "BBRI", "BMRI", "BBNI", "TLKM", "ASII", "UNVR", "ICBP",
    "INDF", "KLBF", "SMGR", "ADRO", "PTBA", "ANTM", "MDKA", "PGAS",
    "EXCL", "JSMR", "AKRA", "CPIN",
]

YF_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
YF_QUOTE_SUMMARY_URL = (
    "https://query2.finance.yahoo.com/v10/finance/quoteSummary/{symbol}"
    "?modules=defaultKeyStatistics,financialData,summaryDetail,price"
)
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; PapanNilaiBot/1.0)"}
OUTPUT_PATH = Path(__file__).resolve().parent.parent / "data" / "stocks.json"
WIB = timezone(timedelta(hours=7))


def ambil_chart(symbol_jk: str) -> dict | None:
    """Ambil harga close harian ~3 tahun terakhir untuk hitung kinerja."""
    url = YF_CHART_URL.format(symbol=symbol_jk)
    params = {"range": "3y", "interval": "1d"}
    r = requests.get(url, params=params, headers=HEADERS, timeout=15)
    r.raise_for_status()
    data = r.json()
    result = data.get("chart", {}).get("result")
    if not result:
        return None
    return result[0]


def ambil_fundamental(symbol_jk: str) -> dict:
    """Ambil rasio fundamental dasar. Endpoint ini kadang butuh crumb/cookie
    dari Yahoo; jika gagal, kembalikan dict kosong dan andalkan estimasi lain."""
    url = YF_QUOTE_SUMMARY_URL.format(symbol=symbol_jk)
    try:
        r = requests.get(url, headers=HEADERS, timeout=15)
        r.raise_for_status()
        result = r.json().get("quoteSummary", {}).get("result")
        return result[0] if result else {}
    except Exception:
        return {}


def hitung_kinerja(closes: list[float], timestamps: list[int]) -> dict:
    """Hitung persentase perubahan harga untuk beberapa horizon waktu."""
    if not closes:
        return {}

    now_ts = timestamps[-1]
    harga_terkini = closes[-1]

    def cari_harga_n_hari_lalu(hari: int) -> float | None:
        target = now_ts - hari * 86400
        # cari index dengan timestamp terdekat <= target
        idx = None
        for i, t in enumerate(timestamps):
            if t <= target:
                idx = i
            else:
                break
        return closes[idx] if idx is not None else None

    def pct(dulu):
        if not dulu:
            return None
        return round((harga_terkini - dulu) / dulu * 100, 2)

    awal_tahun = None
    tahun_ini = datetime.fromtimestamp(now_ts, tz=WIB).year
    for i, t in enumerate(timestamps):
        if datetime.fromtimestamp(t, tz=WIB).year == tahun_ini:
            awal_tahun = closes[i]
            break

    return {
        "harian": pct(cari_harga_n_hari_lalu(1)),
        "mingguan": pct(cari_harga_n_hari_lalu(7)),
        "bulanan": pct(cari_harga_n_hari_lalu(30)),
        "ytd": pct(awal_tahun),
        "satu_tahun": pct(cari_harga_n_hari_lalu(365)),
        "tiga_tahun": pct(cari_harga_n_hari_lalu(365 * 3)),
    }


def estimasi_nilai_wajar(harga: float, per: float | None, pbv: float | None,
                          per_sektor: float = 14.0, pbv_sektor: float = 2.0) -> float:
    """Model heuristik SANGAT sederhana: bandingkan P/E & PBV emiten
    terhadap rata-rata acuan, lalu rata-ratakan hasil implied price.
    Ganti dengan model DCF/relative valuation Anda sendiri untuk hasil
    yang lebih andal."""
    kandidat = []
    if per and per > 0:
        kandidat.append(harga * (per_sektor / per))
    if pbv and pbv > 0:
        kandidat.append(harga * (pbv_sektor / pbv))
    if not kandidat:
        return harga
    return round(sum(kandidat) / len(kandidat), -1)  # bulatkan ke puluhan


def beri_rating(skor: float) -> str:
    """Ubah skor 0-100 menjadi label rating standar."""
    if skor >= 80:
        return "Baik Sekali"
    if skor >= 60:
        return "Baik"
    if skor >= 40:
        return "Wajar"
    return "Lemah"


def proses_emiten(kode: str) -> dict | None:
    symbol_jk = f"{kode}.JK"
    chart = ambil_chart(symbol_jk)
    if not chart:
        print(f"  ! Lewati {kode}: data chart tidak tersedia", file=sys.stderr)
        return None

    meta = chart.get("meta", {})
    timestamps = chart.get("timestamp", [])
    closes = chart.get("indicators", {}).get("quote", [{}])[0].get("close", [])
    pairs = [(t, c) for t, c in zip(timestamps, closes) if c is not None]
    if not pairs:
        return None
    timestamps, closes = zip(*pairs)
    timestamps, closes = list(timestamps), list(closes)

    harga = meta.get("regularMarketPrice") or closes[-1]
    kinerja = hitung_kinerja(closes, timestamps)

    fund = ambil_fundamental(symbol_jk)
    summary_detail = fund.get("summaryDetail", {})
    key_stats = fund.get("defaultKeyStatistics", {})
    fin_data = fund.get("financialData", {})

    def raw(d, key):
        v = d.get(key)
        if isinstance(v, dict):
            return v.get("raw")
        return v

    per = raw(summary_detail, "trailingPE") or raw(key_stats, "trailingPE")
    pbv = raw(key_stats, "priceToBook")
    market_cap = raw(summary_detail, "marketCap")
    revenue = raw(fin_data, "totalRevenue")
    revenue_growth = raw(fin_data, "revenueGrowth")  # fraksi, mis. 0.08 = 8%
    op_cashflow = raw(fin_data, "operatingCashflow")
    volume_avg = raw(summary_detail, "averageDailyVolume3Month")
    current_ratio = raw(fin_data, "currentRatio")
    debt_to_equity = raw(fin_data, "debtToEquity")

    nilai_wajar = estimasi_nilai_wajar(harga, per, pbv)
    upside = (nilai_wajar - harga) / harga * 100 if harga else 0

    # --- skor kesehatan finansial: current ratio + debt to equity ---
    skor_finansial = 50.0
    if current_ratio:
        skor_finansial += min(max((current_ratio - 1) * 20, -20), 20)
    if debt_to_equity is not None:
        skor_finansial += min(max((100 - debt_to_equity) / 5, -20), 20)

    # --- skor arus kas: operating cashflow positif & relatif ke revenue ---
    skor_arus_kas = 50.0
    if op_cashflow is not None:
        skor_arus_kas += 20 if op_cashflow > 0 else -20
        if revenue:
            rasio = op_cashflow / revenue
            skor_arus_kas += min(max(rasio * 100, -15), 15)

    # --- skor pertumbuhan: pertumbuhan pendapatan YoY ---
    skor_pertumbuhan = 50.0
    if revenue_growth is not None:
        skor_pertumbuhan += min(max(revenue_growth * 200, -30), 30)

    return {
        "kode": kode,
        "nama": meta.get("longName") or meta.get("shortName") or kode,
        "sektor": "",  # isi manual/curated jika perlu
        "harga": round(harga),
        "nilai_wajar": round(nilai_wajar),
        "kesehatan_financial": beri_rating(skor_finansial),
        "rating_arus_kas": beri_rating(skor_arus_kas),
        "rating_pertumbuhan": beri_rating(skor_pertumbuhan),
        "kinerja": kinerja,
        "fundamental": {
            "volume_rata3bulan": volume_avg,
            "market_cap": market_cap,
            "pendapatan": revenue,
            "per": round(per, 2) if per else None,
            "pbv": round(pbv, 2) if pbv else None,
        },
    }


def main():
    hasil = []
    for kode in TICKERS:
        print(f"Mengambil {kode}…")
        try:
            data_emiten = proses_emiten(kode)
            if data_emiten:
                hasil.append(data_emiten)
        except Exception as e:
            print(f"  ! Error di {kode}: {e}", file=sys.stderr)
        time.sleep(0.6)  # sopan terhadap rate limit

    output = {
        "meta": {
            "sumber": "Yahoo Finance (endpoint tidak resmi) + model estimasi heuristik",
            "diperbarui": datetime.now(tz=WIB).isoformat(),
            "catatan": "Bukan rekomendasi investasi. Nilai Wajar & rating dihasilkan dari model estimasi sederhana."
        },
        "saham": hasil,
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(output, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\nSelesai. {len(hasil)} emiten ditulis ke {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
