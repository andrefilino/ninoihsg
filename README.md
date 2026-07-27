# Papan Nilai — Saham Undervalued IHSG

Halaman statis (bisa di-hosting gratis di **GitHub Pages**) yang menampilkan
daftar saham *undervalued* di Bursa Efek Indonesia beserta mesin pencari
untuk melihat rincian emiten apa pun.

## Yang ada di dalamnya

- **Tabel Saham Undervalued** — Kode, Nama, Harga, Nilai Wajar, Upside (%),
  Kesehatan Finansial, Rating Arus Kas, Rating Pertumbuhan (kolom bisa
  diklik untuk diurutkan).
- **Mesin Pencari Emiten** — ketik kode/nama saham → muncul rincian lengkap.
- **Tabel Kinerja** — Harian, Mingguan, Bulanan, YTD, 1 Tahun, 3 Tahun.
- **Tabel Fundamental** — Volume Rata-rata 3 Bulan, Market Cap, Pendapatan,
  P/E, PBV.
- **Ticker tape** berjalan di bagian atas + status "Live" dan waktu update
  terakhir.
- **Auto-refresh**: halaman polling `data/stocks.json` setiap 5 menit tanpa
  reload, dan file itu sendiri diperbarui otomatis oleh GitHub Actions.

## ⚠️ Penting: soal "real-time"

GitHub Pages adalah **hosting statis** — tidak bisa menjalankan server atau
memanggil API berbayar langsung dari browser pengunjung (sering terblokir
CORS, dan API resmi biasanya butuh API key yang tidak aman disimpan di
halaman publik).

Solusi yang dipakai di proyek ini (pola yang umum & realistis untuk kasus
seperti ini):

```
GitHub Actions (cron, tiap 30 menit saat jam bursa)
        │
        ▼
scripts/fetch_data.py  →  mengambil data & menghitung rating
        │
        ▼
data/stocks.json  →  di-commit otomatis ke repo
        │
        ▼
index.html + script.js  →  fetch file ini & auto-refresh setiap 5 menit
```

Jadi datanya "near real-time" (diperbarui tiap 30 menit oleh Actions,
lalu ditampilkan ke pengunjung tanpa perlu reload) — bukan tick-by-tick
seperti aplikasi trading resmi. Untuk itu Anda perlu API resmi berbayar
(RTI Business, Stockbit, Sectors.app, dsb.) dan idealnya proxy server
sendiri.

**Saat ini `data/stocks.json` berisi data contoh/ilustratif.** Jalankan
`scripts/fetch_data.py` (atau aktifkan workflow-nya) untuk mengisinya
dengan data nyata dari Yahoo Finance (endpoint tidak resmi, gratis, tapi
bisa berubah sewaktu-waktu).

## Cara deploy ke GitHub Pages

1. Buat repository baru di GitHub, upload semua isi folder ini.
2. Buka **Settings → Pages** pada repo tersebut.
3. Pada **Source**, pilih branch `main` dan folder `/ (root)`.
4. Simpan — halaman akan tersedia di `https://<username>.github.io/<repo>/`
   dalam 1–2 menit.

## Cara mengaktifkan auto-update data

1. Pastikan file `.github/workflows/update-data.yml` ikut ter-upload.
2. Buka tab **Actions** di repo → aktifkan workflow jika diminta.
3. Workflow **"Perbarui Data Saham"** akan berjalan otomatis sesuai jadwal
   cron (bisa diubah di file workflow), atau jalankan manual lewat tombol
   **Run workflow**.
4. Workflow ini menjalankan `scripts/fetch_data.py`, lalu meng-commit
   `data/stocks.json` yang baru — halaman akan otomatis menampilkannya
   pada polling berikutnya (maks. 5 menit).

## Menjalankan & mengedit data secara lokal

```bash
pip install requests
python scripts/fetch_data.py
```

Ini akan menimpa `data/stocks.json` dengan data terbaru. Anda juga bisa
mengedit file JSON ini secara manual untuk menambah/mengurangi emiten,
mengoreksi sektor, atau menimpa hasil model dengan angka riset Anda sendiri.

## Mengubah daftar emiten yang dipantau

Edit list `TICKERS` di `scripts/fetch_data.py`.

## Mengubah metodologi Nilai Wajar & rating

Fungsi `estimasi_nilai_wajar()` dan `beri_rating()` di `scripts/fetch_data.py`
memakai model heuristik sederhana (perbandingan P/E & PBV terhadap acuan
sektor, skor dari current ratio, debt-to-equity, arus kas operasi, dan
pertumbuhan pendapatan). **Ini bukan metodologi riset profesional** —
silakan sesuaikan dengan model valuasi (mis. DCF, Graham Number, dsb.)
dan kriteria kesehatan finansial yang Anda percaya.

## Struktur file

```
index.html                          halaman utama
assets/style.css                    tampilan (tema "trading terminal")
assets/script.js                    logika tabel, pencarian, auto-refresh
data/stocks.json                    data saham (diperbarui otomatis)
scripts/fetch_data.py               skrip pengambil & pengolah data
.github/workflows/update-data.yml   jadwal otomatis GitHub Actions
```

## Disclaimer

Seluruh data, estimasi nilai wajar, dan rating pada halaman ini bersifat
ilustratif/otomatis dan **bukan nasihat atau rekomendasi investasi**.
Selalu lakukan riset mandiri dan/atau konsultasi dengan penasihat
keuangan berizin sebelum mengambil keputusan investasi.
