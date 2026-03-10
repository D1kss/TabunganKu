/* ============================================================
   TabunganKu — Main Script
   Handles: transaksi, target, chart, badge, dark mode, export
   ============================================================ */

// ============================================================
// STATE MANAGEMENT — baca dari localStorage atau default kosong
// ============================================================
let state = {
  transactions: [],   // array of {id, type, desc, amount, date}
  target: {           // target tabungan
    name: '',
    amount: 0
  },
  badges: []          // badge yang sudah di-unlock
};

// Load state dari localStorage kalau ada
function loadState() {
  const saved = localStorage.getItem('tabunganku_state');
  if (saved) {
    try { state = JSON.parse(saved); } catch(e) { console.warn('State parse error', e); }
  }
}

// Simpan state ke localStorage
function saveState() {
  localStorage.setItem('tabunganku_state', JSON.stringify(state));
}

// ============================================================
// KALKULASI — hitung saldo, income, expense
// ============================================================
function calcTotals() {
  let income = 0, expense = 0;
  state.transactions.forEach(t => {
    if (t.type === 'income')  income  += t.amount;
    if (t.type === 'expense') expense += t.amount;
  });
  return { income, expense, saldo: income - expense };
}

// ============================================================
// FORMAT RUPIAH
// ============================================================
function fmtRp(n) {
  return 'Rp ' + Math.abs(n).toLocaleString('id-ID');
}

// ============================================================
// ANIMASI ANGKA (counter effect)
// ============================================================
function animateValue(el, from, to, duration = 600) {
  const start = performance.now();
  function update(ts) {
    const progress = Math.min((ts - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
    const current = Math.round(from + (to - from) * eased);
    el.textContent = fmtRp(current);
    if (progress < 1) requestAnimationFrame(update);
  }
  el.classList.remove('count-anim');
  void el.offsetWidth; // reflow
  el.classList.add('count-anim');
  requestAnimationFrame(update);
}

// ============================================================
// UPDATE DASHBOARD — stat cards + mini progress
// ============================================================
let prevTotals = { income: 0, expense: 0, saldo: 0 };

function updateDashboard() {
  const { income, expense, saldo } = calcTotals();

  // Animasi nilai berubah
  animateValue(document.getElementById('stat-saldo'),   prevTotals.saldo,   saldo);
  animateValue(document.getElementById('stat-income'),  prevTotals.income,  income);
  animateValue(document.getElementById('stat-expense'), prevTotals.expense, expense);
  animateValue(document.getElementById('stat-target'),  0, state.target.amount);

  prevTotals = { income, expense, saldo };

  // Delta saldo
  const deltaSaldo = document.getElementById('delta-saldo');
  if (saldo >= 0) { deltaSaldo.textContent = '✅ Keuanganmu sehat!'; deltaSaldo.style.color = 'var(--green)'; }
  else            { deltaSaldo.textContent = '⚠️ Pengeluaran melebihi pemasukan'; deltaSaldo.style.color = 'var(--red)'; }

  // Progress target
  const pct = state.target.amount > 0
    ? Math.min(Math.round((saldo / state.target.amount) * 100), 100)
    : 0;

  document.getElementById('mini-progress-bar').style.width = pct + '%';
  document.getElementById('mini-progress-pct').textContent = pct + '%';
  document.getElementById('mini-progress-note').textContent =
    state.target.name
      ? `Target: ${state.target.name} — ${fmtRp(state.target.amount)}`
      : 'Belum ada target. Yuk set target tabunganmu!';

  // Date
  document.getElementById('current-date').textContent =
    new Date().toLocaleDateString('id-ID', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
}

// ============================================================
// UPDATE TARGET SECTION
// ============================================================
function updateTargetSection() {
  const { saldo } = calcTotals();
  const t = state.target;

  document.getElementById('target-display-name').textContent = t.name || 'Belum ada target';
  document.getElementById('target-current-val').textContent = fmtRp(saldo);
  document.getElementById('target-goal-val').textContent = fmtRp(t.amount);

  const pct = t.amount > 0 ? Math.min(Math.round((saldo / t.amount) * 100), 100) : 0;
  document.getElementById('big-progress-bar').style.width = pct + '%';
  document.getElementById('big-progress-label').textContent = pct + '%';

  // Pesan motivasi berdasarkan persentase
  const msgEl = document.getElementById('target-message');
  if (!t.name)        msgEl.textContent = 'Set target untuk mulai menabung! 🚀';
  else if (pct >= 100) msgEl.textContent = '🎉 Selamat! Kamu sudah mencapai target!';
  else if (pct >= 75)  msgEl.textContent = `Hampir sampai! Tersisa ${fmtRp(t.amount - saldo)} lagi. Semangat! 💪`;
  else if (pct >= 50)  msgEl.textContent = `Sudah setengah perjalanan! Terus pertahankan! 🔥`;
  else if (pct >= 25)  msgEl.textContent = `Awal yang bagus! ${pct}% tercapai. Tetap fokus! ⭐`;
  else if (pct > 0)    msgEl.textContent = `Mulai perjalanan menabungmu dengan penuh semangat! 🌟`;
  else                 msgEl.textContent = `Yuk mulai menabung menuju target: ${t.name}!`;

  renderMilestones(pct);
}

// ============================================================
// MILESTONE BADGES dalam progress
// ============================================================
const MILESTONES = [
  { pct: 10,  label: '10%',  icon: '🌱' },
  { pct: 25,  label: '25%',  icon: '⭐' },
  { pct: 50,  label: '50%',  icon: '🔥' },
  { pct: 75,  label: '75%',  icon: '💪' },
  { pct: 100, label: '100%', icon: '🏆' },
];

function renderMilestones(currentPct) {
  const row = document.getElementById('milestone-row');
  row.innerHTML = '';
  MILESTONES.forEach(m => {
    const span = document.createElement('span');
    span.className = 'milestone-badge ' + (currentPct >= m.pct ? 'unlocked' : 'locked');
    span.innerHTML = `${m.icon} ${m.label}`;
    row.appendChild(span);
  });
}

// ============================================================
// RENDER RIWAYAT TRANSAKSI
// ============================================================
let currentFilter = 'all';

function renderTransactions(filter = 'all') {
  currentFilter = filter;
  const list = document.getElementById('tx-list');
  const empty = document.getElementById('empty-state');

  const filtered = filter === 'all'
    ? state.transactions
    : state.transactions.filter(t => t.type === filter);

  // Tampilkan dari terbaru
  const sorted = [...filtered].reverse();

  // Hapus item lama (kecuali empty state)
  list.querySelectorAll('.tx-item').forEach(el => el.remove());

  if (sorted.length === 0) {
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  sorted.forEach(t => {
    const item = document.createElement('div');
    item.className = 'tx-item';
    item.dataset.id = t.id;
    item.innerHTML = `
      <div class="tx-dot ${t.type}">${t.type === 'income' ? '📥' : '📤'}</div>
      <div class="tx-info">
        <div class="tx-desc">${escHtml(t.desc)}</div>
        <div class="tx-date">${formatDate(t.date)}</div>
      </div>
      <div class="tx-amount ${t.type}">${t.type === 'income' ? '+' : '-'} ${fmtRp(t.amount)}</div>
      <button class="tx-del-btn" onclick="deleteTransaction('${t.id}')" title="Hapus">🗑️</button>
    `;
    list.appendChild(item);
  });
}

// Filter handler dari HTML
function filterTx(filter, btn) {
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderTransactions(filter);
}

// ============================================================
// TAMBAH TRANSAKSI
// ============================================================
function addTransaction(type) {
  const descEl   = document.getElementById(type === 'income' ? 'inc-desc'   : 'exp-desc');
  const amountEl = document.getElementById(type === 'income' ? 'inc-amount' : 'exp-amount');
  const dateEl   = document.getElementById(type === 'income' ? 'inc-date'   : 'exp-date');

  const desc   = descEl.value.trim();
  const amount = parseFloat(amountEl.value);
  const date   = dateEl.value || new Date().toISOString().split('T')[0];

  // Validasi
  if (!desc)         { showToast('⚠️', 'Keterangan tidak boleh kosong!'); return; }
  if (!amount || amount <= 0) { showToast('⚠️', 'Jumlah harus lebih dari 0!'); return; }

  const tx = {
    id: Date.now().toString(),
    type, desc, amount,
    date
  };

  state.transactions.push(tx);
  saveState();

  // Reset form
  descEl.value = ''; amountEl.value = ''; dateEl.value = '';

  // Update UI
  refreshAll();
  checkAndAwardBadges();

  const emoji = type === 'income' ? '📥' : '📤';
  showToast(emoji, `${type === 'income' ? 'Pemasukan' : 'Pengeluaran'} ${fmtRp(amount)} berhasil dicatat!`);
}

// ============================================================
// HAPUS TRANSAKSI
// ============================================================
function deleteTransaction(id) {
  state.transactions = state.transactions.filter(t => t.id !== id);
  saveState();
  refreshAll();
  showToast('🗑️', 'Transaksi berhasil dihapus.');
}

// ============================================================
// SET TARGET
// ============================================================
function setTarget() {
  const name   = document.getElementById('target-name').value.trim();
  const amount = parseFloat(document.getElementById('target-amount').value);

  if (!name)          { showToast('⚠️', 'Nama target tidak boleh kosong!'); return; }
  if (!amount || amount <= 0) { showToast('⚠️', 'Jumlah target harus lebih dari 0!'); return; }

  state.target = { name, amount };
  saveState();

  document.getElementById('target-name').value   = '';
  document.getElementById('target-amount').value = '';

  refreshAll();
  showToast('🎯', `Target "${name}" sebesar ${fmtRp(amount)} berhasil diset!`);
}

// ============================================================
// BADGE SYSTEM
// ============================================================
const ALL_BADGES = [
  { id: 'first_income',   icon: '🌟', name: 'Langkah Pertama', desc: 'Catat pemasukan pertama kali' },
  { id: 'first_save',     icon: '💰', name: 'Penabung Pemula',  desc: 'Saldo mencapai Rp 100.000' },
  { id: 'save_1jt',       icon: '🥉', name: 'Tabungan Perunggu', desc: 'Saldo mencapai Rp 1.000.000' },
  { id: 'save_5jt',       icon: '🥈', name: 'Tabungan Perak',  desc: 'Saldo mencapai Rp 5.000.000' },
  { id: 'save_10jt',      icon: '🥇', name: 'Tabungan Emas',   desc: 'Saldo mencapai Rp 10.000.000' },
  { id: 'target_25',      icon: '⭐', name: 'Seperempat Jalan', desc: 'Target tercapai 25%' },
  { id: 'target_50',      icon: '🔥', name: 'Setengah Target',  desc: 'Target tercapai 50%' },
  { id: 'target_75',      icon: '💪', name: 'Hampir Sampai',   desc: 'Target tercapai 75%' },
  { id: 'target_100',     icon: '🏆', name: 'Target Tercapai!', desc: 'Target tabungan 100% terpenuhi!' },
  { id: 'tx_10',          icon: '📊', name: 'Rajin Mencatat',  desc: 'Catat 10 transaksi' },
];

function checkAndAwardBadges() {
  const { income, saldo } = calcTotals();
  const pct = state.target.amount > 0
    ? (saldo / state.target.amount) * 100 : 0;

  const newBadges = [];

  const check = (id, condition) => {
    if (condition && !state.badges.includes(id)) {
      state.badges.push(id);
      newBadges.push(id);
    }
  };

  check('first_income', income > 0);
  check('first_save',   saldo >= 100000);
  check('save_1jt',     saldo >= 1000000);
  check('save_5jt',     saldo >= 5000000);
  check('save_10jt',    saldo >= 10000000);
  check('target_25',    pct >= 25);
  check('target_50',    pct >= 50);
  check('target_75',    pct >= 75);
  check('target_100',   pct >= 100);
  check('tx_10',        state.transactions.length >= 10);

  if (newBadges.length > 0) {
    saveState();
    renderBadges();

    // Notifikasi badge baru
    const b = ALL_BADGES.find(x => x.id === newBadges[0]);
    if (b) showToast(b.icon, `Badge baru: ${b.name}!`);

    // Confetti kalau target 100%
    if (newBadges.includes('target_100')) launchConfetti();
  }
}

function renderBadges() {
  const grid = document.getElementById('badges-grid');
  grid.innerHTML = '';

  ALL_BADGES.forEach(b => {
    const unlocked = state.badges.includes(b.id);
    const card = document.createElement('div');
    card.className = 'badge-card ' + (unlocked ? 'unlocked' : 'locked');
    card.innerHTML = `
      <div class="badge-emoji">${b.icon}</div>
      <div class="badge-name">${unlocked ? b.name : '???'}</div>
      <div class="badge-desc">${b.desc}</div>
    `;
    grid.appendChild(card);
  });
}

// ============================================================
// CHART.JS — Dashboard mini chart + Bar chart + Doughnut
// ============================================================
let dashChartInst    = null;
let barChartInst     = null;
let doughnutChartInst = null;

// Warna sesuai tema
function getChartColors() {
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  return {
    grid:  dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)',
    text:  dark ? '#9ba3c8' : '#5a6282',
    bg:    dark ? '#1c2033' : '#ffffff',
  };
}

// Ambil data per bulan (6 bulan terakhir)
function getMonthlyData() {
  const months = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      key:     `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`,
      label:   d.toLocaleDateString('id-ID', { month:'short', year:'2-digit' }),
      income:  0,
      expense: 0,
    });
  }
  state.transactions.forEach(t => {
    const monthKey = t.date.slice(0, 7);
    const m = months.find(x => x.key === monthKey);
    if (m) {
      if (t.type === 'income')  m.income  += t.amount;
      if (t.type === 'expense') m.expense += t.amount;
    }
  });
  return months;
}

function buildDashChart() {
  const ctx = document.getElementById('dashChart').getContext('2d');
  const monthly = getMonthlyData();
  const { grid, text } = getChartColors();

  if (dashChartInst) dashChartInst.destroy();

  dashChartInst = new Chart(ctx, {
    type: 'line',
    data: {
      labels: monthly.map(m => m.label),
      datasets: [
        {
          label: 'Pemasukan',
          data: monthly.map(m => m.income),
          borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.12)',
          fill: true, tension: 0.45, pointRadius: 5,
          pointBackgroundColor: '#10b981',
        },
        {
          label: 'Pengeluaran',
          data: monthly.map(m => m.expense),
          borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.10)',
          fill: true, tension: 0.45, pointRadius: 5,
          pointBackgroundColor: '#ef4444',
        },
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { labels: { color: text, font: { family: 'Plus Jakarta Sans', weight:'600' }, boxWidth:12 } },
        tooltip: { mode:'index', intersect: false },
      },
      scales: {
        x: { grid: { color: grid }, ticks: { color: text } },
        y: {
          grid: { color: grid }, ticks: {
            color: text,
            callback: v => 'Rp ' + (v/1000).toFixed(0) + 'k',
          }
        }
      }
    }
  });
}

function buildBarChart() {
  const ctx = document.getElementById('barChart').getContext('2d');
  const monthly = getMonthlyData();
  const { grid, text } = getChartColors();

  if (barChartInst) barChartInst.destroy();

  barChartInst = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: monthly.map(m => m.label),
      datasets: [
        {
          label: 'Pemasukan',
          data: monthly.map(m => m.income),
          backgroundColor: 'rgba(16,185,129,0.8)',
          borderRadius: 8, borderSkipped: false,
        },
        {
          label: 'Pengeluaran',
          data: monthly.map(m => m.expense),
          backgroundColor: 'rgba(239,68,68,0.8)',
          borderRadius: 8, borderSkipped: false,
        },
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { labels: { color: text, font: { family:'Plus Jakarta Sans', weight:'600'}, boxWidth:12 } },
        tooltip: { mode:'index', intersect:false }
      },
      scales: {
        x: { grid:{ color: grid }, ticks:{ color: text } },
        y: { grid:{ color: grid }, ticks:{ color: text, callback: v => 'Rp '+(v/1000).toFixed(0)+'k' } }
      }
    }
  });
}

function buildDoughnutChart() {
  const ctx = document.getElementById('doughnutChart').getContext('2d');
  const { income, expense, saldo } = calcTotals();
  const { text } = getChartColors();

  if (doughnutChartInst) doughnutChartInst.destroy();

  const totalActivity = income + expense;
  if (totalActivity === 0) {
    // Chart kosong placeholder
    doughnutChartInst = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Belum ada data'],
        datasets: [{ data: [1], backgroundColor: ['rgba(150,150,180,0.2)'], borderWidth: 0 }]
      },
      options: {
        responsive: true, cutout: '70%',
        plugins: {
          legend: { labels:{ color: text } },
          tooltip: { enabled: false }
        }
      }
    });
    return;
  }

  doughnutChartInst = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Saldo Aktif', 'Pengeluaran'],
      datasets: [{
        data: [Math.max(saldo,0), expense],
        backgroundColor: ['rgba(79,120,255,0.85)', 'rgba(239,68,68,0.8)'],
        hoverBackgroundColor: ['rgba(79,120,255,1)', 'rgba(239,68,68,1)'],
        borderWidth: 3,
        borderColor: getChartColors().bg,
      }]
    },
    options: {
      responsive: true, cutout: '68%',
      plugins: {
        legend: { position:'bottom', labels:{ color: text, font:{family:'Plus Jakarta Sans',weight:'600'}, boxWidth:12, padding:16 } },
        tooltip: { callbacks: { label: ctx => ' ' + fmtRp(ctx.parsed) } }
      }
    }
  });
}

// ============================================================
// CONFETTI 🎉
// ============================================================
function launchConfetti() {
  confetti({
    particleCount: 200,
    spread: 80,
    origin: { y: 0.6 },
    colors: ['#4f78ff', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444']
  });
  setTimeout(() => confetti({ particleCount: 100, spread: 100, origin: { y: 0.4 } }), 300);
}

// ============================================================
// TOAST NOTIFICATION
// ============================================================
let toastTimer;
function showToast(icon, msg) {
  const toast = document.getElementById('toast');
  document.getElementById('toast-icon').textContent = icon;
  document.getElementById('toast-msg').textContent  = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3800);
}

// Motivasi acak setiap 30 detik
const MOTIVASI = [
  '💡 "Menabung sedikit setiap hari lebih baik dari tidak sama sekali!"',
  '🚀 "Konsistensi adalah kunci kebebasan finansial."',
  '💰 "Investasi terbaik adalah investasi pada dirimu sendiri."',
  '⭐ "Setiap rupiah yang kamu tabung adalah langkah menuju kebebasan."',
  '🌱 "Kebiasaan menabung dimulai dari langkah kecil yang konsisten.",',
  '🔥 "Disiplin finansial hari ini = kebebasan di masa depan!"',
];
let motivasiIdx = 0;
setInterval(() => {
  showToast('💡', MOTIVASI[motivasiIdx % MOTIVASI.length]);
  motivasiIdx++;
}, 30000);

// ============================================================
// DARK MODE
// ============================================================
function initDarkMode() {
  const saved = localStorage.getItem('tabunganku_theme') || 'light';
  applyTheme(saved);
  document.getElementById('darkModeToggle').checked = saved === 'dark';
  document.getElementById('darkModeToggleMobile').checked = saved === 'dark';
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('tabunganku_theme', theme);
}

function toggleTheme(checked) {
  applyTheme(checked ? 'dark' : 'light');
  // Sync kedua toggle
  document.getElementById('darkModeToggle').checked = checked;
  document.getElementById('darkModeToggleMobile').checked = checked;
  // Rebuild charts dengan warna baru
  buildDashChart();
  buildBarChart();
  buildDoughnutChart();
}

// ============================================================
// SIDEBAR MOBILE TOGGLE
// ============================================================
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('overlay').classList.toggle('show');
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('overlay').classList.remove('show');
}

// ============================================================
// NAVIGASI SECTION
// ============================================================
function showSection(id) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.getElementById('sec-' + id).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelector(`[data-section="${id}"]`).classList.add('active');
  closeSidebar();

  // Rebuild chart ketika section grafik dibuka
  if (id === 'grafik') { buildBarChart(); buildDoughnutChart(); }
  if (id === 'dashboard') { buildDashChart(); }
  if (id === 'target')  updateTargetSection();
  if (id === 'riwayat') renderTransactions(currentFilter);
  if (id === 'badge')   renderBadges();
}

// ============================================================
// EXPORT CSV
// ============================================================
function exportCSV() {
  if (state.transactions.length === 0) {
    showToast('⚠️', 'Tidak ada data untuk di-export!');
    return;
  }

  const header = 'Tanggal,Tipe,Keterangan,Jumlah\n';
  const rows = state.transactions.map(t =>
    `${t.date},${t.type === 'income' ? 'Pemasukan' : 'Pengeluaran'},"${t.desc}",${t.amount}`
  ).join('\n');

  const csv  = header + rows;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `tabunganku_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);

  showToast('⬇️', 'Data berhasil di-export ke CSV!');
}

// ============================================================
// REFRESH ALL — update semua UI sekaligus
// ============================================================
function refreshAll() {
  updateDashboard();
  updateTargetSection();
  renderTransactions(currentFilter);
  renderBadges();
  buildDashChart();
}

// ============================================================
// ESCAPE HTML (keamanan input)
// ============================================================
function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ============================================================
// FORMAT DATE
// ============================================================
function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('id-ID', { weekday:'short', year:'numeric', month:'short', day:'numeric' });
}

// ============================================================
// INIT — jalankan semua saat halaman dimuat
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  // Cek autentikasi — redirect kalau belum login
  const session = checkAuth();
  if (!session) return;

  loadState();
  loadUserInfo(session);
  initDarkMode();

  // Event listener dark mode toggle (desktop)
  document.getElementById('darkModeToggle').addEventListener('change', e => toggleTheme(e.target.checked));
  // Event listener dark mode toggle (mobile)
  document.getElementById('darkModeToggleMobile').addEventListener('change', e => toggleTheme(e.target.checked));

  // Event listener nav items
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', e => {
      e.preventDefault();
      showSection(item.dataset.section);
    });
  });

  // Set default tanggal ke hari ini
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('inc-date').value = today;
  document.getElementById('exp-date').value = today;

  // Render semua
  refreshAll();

  // Sambutan awal
  setTimeout(() => {
    const s = localStorage.getItem('tabunganku_session') || sessionStorage.getItem('tabunganku_session');
    const sess = s ? JSON.parse(s) : {};
    showToast('👋', `Selamat datang, ${sess.name || 'Pengguna'}! 🎉`);
  }, 1000);
});

// ============================================================
// AUTH GUARD — redirect ke auth.html kalau belum login
// ============================================================
function checkAuth() {
  const raw = localStorage.getItem('tabunganku_session')
           || sessionStorage.getItem('tabunganku_session');
  if (!raw) { window.location.href = 'auth.html'; return null; }
  try { return JSON.parse(raw); } catch(e) { window.location.href = 'auth.html'; return null; }
}

function logout() {
  localStorage.removeItem('tabunganku_session');
  sessionStorage.removeItem('tabunganku_session');
  window.location.href = 'auth.html';
}

function loadUserInfo(session) {
  if (!session) return;
  const nameEl   = document.getElementById('user-name');
  const emailEl  = document.getElementById('user-email');
  const avatarEl = document.getElementById('user-avatar');
  if (nameEl)   nameEl.textContent   = session.name  || 'Pengguna';
  if (emailEl)  emailEl.textContent  = session.email || '—';
  if (avatarEl) avatarEl.textContent = (session.name || 'U')[0].toUpperCase();
}
