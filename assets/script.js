/* ============================================================
   Papan Nilai — engine
   - Membaca data/stocks.json (di-refresh berkala oleh GitHub Actions)
   - Menampilkan tabel saham undervalued
   - Mesin pencari emiten dengan rincian lengkap
   - Auto-polling agar tampilan "terasa" real-time tanpa server
   ============================================================ */

const DATA_URL = "data/stocks.json";
const POLL_INTERVAL_MS = 5 * 60 * 1000; // cek data baru tiap 5 menit
const UNDERVALUED_THRESHOLD = 8; // % upside minimum untuk masuk tabel utama

const RATING_CLASS = {
  "Baik Sekali": "badge-baik-sekali",
  "Baik": "badge-baik",
  "Wajar": "badge-wajar",
  "Lemah": "badge-lemah"
};

let STATE = {
  saham: [],
  meta: {},
  sortKey: "upside",
  sortDir: "desc"
};

/* ---------------- Helpers ---------------- */

function fmtRupiah(n){
  if (n === null || n === undefined) return "—";
  return "Rp " + Math.round(n).toLocaleString("id-ID");
}

function fmtBesar(n){
  if (n === null || n === undefined) return "—";
  if (n >= 1e15) return (n/1e15).toFixed(2).replace(".", ",") + " kuadriliun";
  if (n >= 1e12) return (n/1e12).toFixed(2).replace(".", ",") + " T";
  if (n >= 1e9)  return (n/1e9).toFixed(2).replace(".", ",") + " M";
  if (n >= 1e6)  return (n/1e6).toFixed(2).replace(".", ",") + " Jt";
  return n.toLocaleString("id-ID");
}

function fmtPct(n, withSign=true){
  if (n === null || n === undefined) return "—";
  const sign = n > 0 && withSign ? "+" : "";
  return sign + n.toFixed(2).replace(".", ",") + "%";
}

function pctClass(n){
  return n >= 0 ? "upside-pos" : "upside-neg";
}

function badgeHtml(rating){
  const cls = RATING_CLASS[rating] || "badge-wajar";
  return `<span class="badge ${cls}">${rating}</span>`;
}

function calcUpside(s){
  if (!s.harga) return 0;
  return ((s.nilai_wajar - s.harga) / s.harga) * 100;
}

function formatWaktu(iso){
  try{
    const d = new Date(iso);
    return d.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) + " WIB";
  }catch(e){ return iso; }
}

/* ---------------- Data loading ---------------- */

async function loadData(showLoadingState=false){
  const statusLabel = document.getElementById("statusLabel");
  const liveDot = document.getElementById("liveDot");

  try{
    if (showLoadingState){ statusLabel.textContent = "Memuat data…"; }
    const res = await fetch(`${DATA_URL}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error("Gagal memuat " + DATA_URL);
    const json = await res.json();

    STATE.saham = (json.saham || []).map(s => ({ ...s, upside: calcUpside(s) }));
    STATE.meta = json.meta || {};

    liveDot.classList.add("live");
    statusLabel.textContent = "Live · data tersinkron";
    document.getElementById("statusTime").textContent = formatWaktu(STATE.meta.diperbarui);
    document.getElementById("footerTime").textContent = formatWaktu(STATE.meta.diperbarui);

    renderTicker();
    renderMainTable();
    renderSearchIndex();

  }catch(err){
    console.error(err);
    liveDot.classList.remove("live");
    statusLabel.textContent = "Gagal memuat data — coba muat ulang halaman";
  }
}

/* ---------------- Ticker tape ---------------- */

function renderTicker(){
  const track = document.getElementById("tickerTrack");
  const items = STATE.saham.map(s => {
    const chg = s.kinerja?.harian ?? 0;
    const cls = chg >= 0 ? "ticker-up" : "ticker-down";
    const arrow = chg >= 0 ? "▲" : "▼";
    return `<span class="ticker-item"><strong>${s.kode}</strong> ${fmtRupiah(s.harga)} <span class="${cls}">${arrow} ${fmtPct(chg)}</span></span>`;
  });
  // duplikat agar loop terasa mulus
  track.innerHTML = items.join("") + items.join("");
}

/* ---------------- Main table ---------------- */

function sortedUndervalued(){
  const list = STATE.saham.filter(s => s.upside >= UNDERVALUED_THRESHOLD);
  const { sortKey, sortDir } = STATE;
  list.sort((a,b) => {
    let va = a[sortKey], vb = b[sortKey];
    if (typeof va === "string") { va = va.toLowerCase(); vb = vb.toLowerCase(); }
    if (va < vb) return sortDir === "asc" ? -1 : 1;
    if (va > vb) return sortDir === "asc" ? 1 : -1;
    return 0;
  });
  return list;
}

function renderMainTable(){
  const tbody = document.getElementById("mainTableBody");
  const list = sortedUndervalued();

  if (list.length === 0){
    tbody.innerHTML = `<tr><td colspan="8" class="loading-cell">Tidak ada emiten dengan upside ≥ ${UNDERVALUED_THRESHOLD}% saat ini.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(s => `
    <tr data-kode="${s.kode}" tabindex="0">
      <td class="kode-cell">${s.kode}</td>
      <td class="col-wide">${s.nama}<span class="nama-sub">${s.sektor}</span></td>
      <td class="num">${fmtRupiah(s.harga)}</td>
      <td class="num">${fmtRupiah(s.nilai_wajar)}</td>
      <td class="num ${pctClass(s.upside)}">${fmtPct(s.upside)}</td>
      <td>${badgeHtml(s.kesehatan_financial)}</td>
      <td>${badgeHtml(s.rating_arus_kas)}</td>
      <td>${badgeHtml(s.rating_pertumbuhan)}</td>
    </tr>
  `).join("");

  tbody.querySelectorAll("tr[data-kode]").forEach(row => {
    row.addEventListener("click", () => openDetail(row.dataset.kode));
    row.addEventListener("keypress", (e) => { if (e.key === "Enter") openDetail(row.dataset.kode); });
  });
}

document.querySelectorAll("#mainTable thead th[data-sort]").forEach(th => {
  th.addEventListener("click", () => {
    const key = th.dataset.sort;
    if (STATE.sortKey === key){
      STATE.sortDir = STATE.sortDir === "asc" ? "desc" : "asc";
    } else {
      STATE.sortKey = key;
      STATE.sortDir = "desc";
    }
    renderMainTable();
  });
});

/* ---------------- Detail (dipakai oleh tabel & pencarian) ---------------- */

function detailHtml(s){
  const k = s.kinerja || {};
  const f = s.fundamental || {};
  return `
    <div class="detail-grid">
      <div class="stat-box">
        <div class="label">Harga Terkini</div>
        <div class="value big">${fmtRupiah(s.harga)}</div>
      </div>
      <div class="stat-box">
        <div class="label">Nilai Wajar (Estimasi)</div>
        <div class="value big">${fmtRupiah(s.nilai_wajar)}</div>
      </div>
      <div class="stat-box">
        <div class="label">Upside</div>
        <div class="value big ${pctClass(s.upside)}">${fmtPct(s.upside)}</div>
      </div>
      <div class="stat-box">
        <div class="label">Kesehatan Finansial</div>
        <div class="value">${badgeHtml(s.kesehatan_financial)}</div>
      </div>
      <div class="stat-box">
        <div class="label">Rating Arus Kas</div>
        <div class="value">${badgeHtml(s.rating_arus_kas)}</div>
      </div>
      <div class="stat-box">
        <div class="label">Rating Pertumbuhan</div>
        <div class="value">${badgeHtml(s.rating_pertumbuhan)}</div>
      </div>
    </div>

    <div class="sub-table-title">Kinerja Harga</div>
    <table class="mini-table">
      <thead><tr>
        <th>Harian</th><th>Mingguan</th><th>Bulanan</th><th>YTD</th><th>1 Tahun</th><th>3 Tahun</th>
      </tr></thead>
      <tbody><tr>
        <td class="${pctClass(k.harian)}">${fmtPct(k.harian)}</td>
        <td class="${pctClass(k.mingguan)}">${fmtPct(k.mingguan)}</td>
        <td class="${pctClass(k.bulanan)}">${fmtPct(k.bulanan)}</td>
        <td class="${pctClass(k.ytd)}">${fmtPct(k.ytd)}</td>
        <td class="${pctClass(k.satu_tahun)}">${fmtPct(k.satu_tahun)}</td>
        <td class="${pctClass(k.tiga_tahun)}">${fmtPct(k.tiga_tahun)}</td>
      </tr></tbody>
    </table>

    <div class="sub-table-title">Fundamental</div>
    <table class="mini-table">
      <thead><tr>
        <th>Volume Rata² (3 Bulan)</th><th>Market Cap</th><th>Pendapatan</th><th>P/E</th><th>PBV</th>
      </tr></thead>
      <tbody><tr>
        <td>${fmtBesar(f.volume_rata3bulan)}</td>
        <td>${fmtRupiah(f.market_cap)}</td>
        <td>${fmtRupiah(f.pendapatan)}</td>
        <td>${f.per?.toFixed(1) ?? "—"}x</td>
        <td>${f.pbv?.toFixed(1) ?? "—"}x</td>
      </tr></tbody>
    </table>
  `;
}

function openDetail(kode){
  const s = STATE.saham.find(x => x.kode === kode);
  if (!s) return;
  const panel = document.getElementById("detailPanel");
  document.getElementById("detailKode").textContent = `${s.kode} · ${s.nama}`;
  document.getElementById("detailContent").innerHTML = detailHtml(s);
  panel.classList.remove("hidden");
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
}

document.getElementById("closeDetail").addEventListener("click", () => {
  document.getElementById("detailPanel").classList.add("hidden");
});

/* ---------------- Search engine ---------------- */

function renderSearchIndex(){
  // dipanggil ulang setiap data refresh; suggestion dihitung on-the-fly saat mengetik
}

const searchInput = document.getElementById("searchInput");
const searchSuggest = document.getElementById("searchSuggest");
const searchResult = document.getElementById("searchResult");

searchInput.addEventListener("input", () => {
  const q = searchInput.value.trim().toLowerCase();
  searchResult.classList.add("hidden");

  if (q.length === 0){
    searchSuggest.classList.remove("show");
    searchSuggest.innerHTML = "";
    return;
  }

  const matches = STATE.saham.filter(s =>
    s.kode.toLowerCase().includes(q) || s.nama.toLowerCase().includes(q)
  ).slice(0, 8);

  if (matches.length === 0){
    searchSuggest.innerHTML = `<div class="suggest-item"><span>Tidak ditemukan</span></div>`;
    searchSuggest.classList.add("show");
    return;
  }

  searchSuggest.innerHTML = matches.map(s => `
    <div class="suggest-item" data-kode="${s.kode}">
      <span>${s.kode} — ${s.nama}</span>
      <span class="muted">${fmtRupiah(s.harga)}</span>
    </div>
  `).join("");
  searchSuggest.classList.add("show");

  searchSuggest.querySelectorAll(".suggest-item[data-kode]").forEach(el => {
    el.addEventListener("click", () => {
      showSearchResult(el.dataset.kode);
    });
  });
});

document.addEventListener("click", (e) => {
  if (!e.target.closest(".search-box")) {
    searchSuggest.classList.remove("show");
  }
});

function showSearchResult(kode){
  const s = STATE.saham.find(x => x.kode === kode);
  if (!s) return;
  searchInput.value = `${s.kode} — ${s.nama}`;
  searchSuggest.classList.remove("show");
  searchResult.innerHTML = detailHtml(s);
  searchResult.classList.remove("hidden");
}

/* ---------------- Refresh controls ---------------- */

document.getElementById("refreshBtn").addEventListener("click", () => loadData(true));

/* ---------------- Init ---------------- */

loadData(true);
setInterval(() => loadData(false), POLL_INTERVAL_MS);
