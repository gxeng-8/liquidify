const KEY = 'expenses';

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; }
  catch { return []; }
}

function save(list) {
  localStorage.setItem(KEY, JSON.stringify(list));
}

// local date (not UTC), so "today" is correct in the Philippines
function dateKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function peso(n) {
  return '₱' + n.toLocaleString('en-PH');
}

/* delete popup */
const confirmEl = document.getElementById('confirm');
let onYes = null;
let onNo = null;

function askDelete(entry, yes, no) {
  document.getElementById('confirmText').textContent =
    `${entry.item} · ${peso(entry.amount)}`;
  onYes = yes;
  onNo = no;
  confirmEl.classList.add('open');
  document.getElementById('confirmNo').focus();
}

function closeConfirm() {
  confirmEl.classList.remove('open');
}

function cancelConfirm() {
  const f = onNo;
  onYes = onNo = null;
  closeConfirm();
  if (f) f();
}

document.getElementById('confirmYes').addEventListener('click', () => {
  const f = onYes;
  onYes = onNo = null;
  closeConfirm();
  if (f) f();
});
document.getElementById('confirmNo').addEventListener('click', cancelConfirm);
document.querySelector('.confirm-backdrop').addEventListener('click', cancelConfirm);
document.addEventListener('keydown', ev => {
  if (ev.key === 'Escape' && confirmEl.classList.contains('open')) cancelConfirm();
});

/* remove with a collapse animation */
function removeEntry(id, li) {
  li.style.height = li.offsetHeight + 'px';
  li.getBoundingClientRect(); // force reflow
  li.style.transition = 'height .2s ease, opacity .2s';
  li.style.height = '0px';
  li.style.opacity = '0';
  setTimeout(() => {
    save(load().filter(e => e.id !== id));
    render();
  }, 200);
}

/* smooth swipe left */
function addSwipe(li, slide, entry) {
  const label = li.querySelector('.del-label');
  let startX = 0, startY = 0, x = 0, T = 100;
  let dragging = false, moved = false, raf = 0;

  function paint() {
    raf = 0;
    slide.style.transform = `translate3d(${x}px, 0, 0)`;
    label.style.opacity = Math.min(1, -x / 60);
  }
  function setX(v) {
    x = v;
    if (!raf) raf = requestAnimationFrame(paint);
  }
  function back() {
    slide.style.transition = 'transform .3s cubic-bezier(.2, .8, .2, 1)';
    setX(0);
  }

  slide.addEventListener('pointerdown', ev => {
    startX = ev.clientX;
    startY = ev.clientY;
    T = Math.min(110, slide.offsetWidth * 0.35);
    x = 0;
    moved = false;
    dragging = true;
  });

  slide.addEventListener('pointermove', ev => {
    if (!dragging) return;
    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;

    if (!moved) {
      if (Math.abs(dx) < 8) return;
      if (Math.abs(dy) > Math.abs(dx)) { dragging = false; return; } // it's a scroll
      moved = true;
      slide.setPointerCapture(ev.pointerId);
      slide.style.transition = 'none';
    }

    let pull = Math.max(0, -dx);
    if (pull > T) pull = T + (pull - T) * 0.4; // gets heavier past the delete point
    setX(-pull);
  });

  function end(cancelled) {
    if (!dragging) return;
    dragging = false;
    if (!moved) return;

    if (!cancelled && -x >= T) {
      slide.style.transition = 'transform .25s cubic-bezier(.2, .8, .2, 1)';
      setX(-slide.offsetWidth);
      askDelete(entry, () => removeEntry(entry.id, li), back);
    } else {
      back();
    }
  }
  slide.addEventListener('pointerup', () => end(false));
  slide.addEventListener('pointercancel', () => end(true));

  // a swipe shouldn't count as a tap
  slide.addEventListener('click', ev => {
    if (moved) {
      ev.stopPropagation();
      ev.preventDefault();
      moved = false;
    }
  }, true);
}

/* which day the Today screen shows */
let viewDate = new Date();

function viewKey() { return dateKey(viewDate); }
function isViewToday() { return viewKey() === dateKey(); }

function shiftDay(n) {
  const d = new Date(viewDate);
  d.setDate(d.getDate() + n);
  if (d > new Date()) return; // no future days
  viewDate = d;
  render();
}

document.getElementById('prevDay').addEventListener('click', () => shiftDay(-1));
document.getElementById('nextDay').addEventListener('click', () => shiftDay(1));
document.getElementById('todayBtn').addEventListener('click', () => {
  viewDate = new Date();
  render();
});

/* total money */
function isStart(e) {
  return e.type === 'in' && normalize(e.category) === 'balance';
}

function renderBalance() {
  const all = load();
  const starts = all.filter(isStart)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
  const s = starts[starts.length - 1]; // latest balance entry wins

  const val = document.getElementById('balVal');
  const note = document.getElementById('balNote');
  const btn = document.getElementById('balBtn');

  if (!s) {
    val.textContent = '—';
    val.classList.remove('neg');
    note.textContent = 'Add how much money you have right now to start tracking.';
    btn.textContent = 'Set starting balance';
    return;
  }

  // only entries logged after the balance entry count
  const after = all.filter(e => e.id !== s.id &&
    (e.date > s.date || (e.date === s.date && e.id > s.id)));
  const bal = s.amount +
    after.reduce((sum, e) => sum + (e.type === 'in' ? e.amount : -e.amount), 0);

  val.textContent = (bal < 0 ? '−' : '') + peso(Math.abs(bal));
  val.classList.toggle('neg', bal < 0);
  note.textContent = 'Since ' +
    dateFromKey(s.date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) +
    ': balance plus money in, minus spending.';
  btn.textContent = 'Update balance';
}

/* today / day list */
function render() {
  renderStats();
  renderSearch();
  renderBalance();

  const items = load().filter(e => e.date === viewKey());
  const today = isViewToday();

  document.getElementById('listDate').textContent =
    viewDate.toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' });
  document.getElementById('heroLabel').textContent = today ? 'Spent today' : 'Spent this day';
  document.getElementById('nextDay').disabled = today;
  document.getElementById('todayBtn').hidden = today;

  const total = items.filter(e => e.type !== 'in').reduce((sum, e) => sum + e.amount, 0);
  const moneyIn = items.filter(e => e.type === 'in' && !isStart(e)).reduce((sum, e) => sum + e.amount, 0);  document.getElementById('dayTotal').textContent = peso(total);
  document.getElementById('inToday').textContent =
    moneyIn ? `+${peso(moneyIn)} money in ${today ? 'today' : 'this day'}` : '';

  const ul = document.getElementById('list');
  ul.innerHTML = '';

  if (!items.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = today
      ? 'No expenses yet today. Tap + to add one.'
      : 'Nothing logged on this day. Tap + to add one.';
    ul.appendChild(li);
    return;
  }

  items.slice().reverse().forEach(e => {
    const li = document.createElement('li');
    li.className = 'swipe';

    const label = document.createElement('span');
    label.className = 'del-label';
    label.setAttribute('aria-hidden', 'true');
    label.textContent = 'Delete';

    const slide = document.createElement('div');
    slide.className = 'slide';

    const row = document.createElement('button');
    row.className = 'row';
    row.addEventListener('click', () => openSheet(e));
    row.addEventListener('keydown', ev => {
      if (ev.key === 'Delete' || ev.key === 'Backspace') {
        ev.preventDefault();
        askDelete(e, () => removeEntry(e.id, li), () => {});
      }
    });

    const left = document.createElement('span');
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = e.item;
    const cat = document.createElement('span');
    cat.className = 'cat';
    cat.textContent = e.category;
    left.append(name, cat);

    const price = document.createElement('span');
    price.className = 'price' + (e.type === 'in' ? ' in' : '');
    price.textContent = (e.type === 'in' ? '+' : '') + peso(e.amount);

    row.append(left, price);
    slide.appendChild(row);
    li.append(label, slide);
    addSwipe(li, slide, e);
    ul.appendChild(li);
  });
}

/* stats */
let statsMonth = new Date();
statsMonth.setDate(1);

const COLORS = ['#167A88', '#4DA3D9', '#7FD1C7', '#FFD98A', '#A9D8E8', '#12324A'];

function monthKey(d) { return dateKey(d).slice(0, 7); }
function monthName(d, long) {
  return d.toLocaleDateString('en-PH', { month: long ? 'long' : 'short' });
}

function renderStats() {
  const now = new Date();
  const key = monthKey(statsMonth);
  const isCurrent = key === monthKey(now);

  document.getElementById('monthLabel').textContent =
    statsMonth.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
  document.getElementById('nextMonth').disabled = isCurrent;

  const monthAll = load().filter(e => e.date.startsWith(key));
  const entries = monthAll.filter(e => e.type !== 'in');
  const moneyIn = monthAll.filter(e => e.type === 'in' && !isStart(e)).reduce((s, e) => s + e.amount, 0);  const total = entries.reduce((s, e) => s + e.amount, 0);

  const daysInMonth = new Date(statsMonth.getFullYear(), statsMonth.getMonth() + 1, 0).getDate();
  const days = isCurrent ? now.getDate() : daysInMonth;

  document.getElementById('totalVal').textContent = peso(total);
  document.getElementById('avgVal').textContent = peso(Math.round(total / days));

  document.getElementById('inVal').textContent = peso(moneyIn);
  const net = moneyIn - total;
  document.getElementById('netNote').textContent = !moneyIn
    ? 'No money in logged this month.'
    : net >= 0
      ? `${peso(net)} left after spending.`
      : `You spent ${peso(-net)} more than your money in.`;

  // compare with last month (same number of days if this month isn't over yet)
  const prev = new Date(statsMonth.getFullYear(), statsMonth.getMonth() - 1, 1);
  const prevKey = monthKey(prev);
  const prevTotal = load()
    .filter(e => e.type !== 'in'
      && e.date.startsWith(prevKey)
      && (!isCurrent || parseInt(e.date.slice(8), 10) <= days))
    .reduce((s, e) => s + e.amount, 0);

  const badge = document.getElementById('pctBadge');
  const note = document.getElementById('compareNote');
  badge.className = 'badge';

  if (prevTotal === 0) {
    badge.textContent = 'No data in ' + monthName(prev);
    note.textContent = '';
  } else {
    const pct = Math.round(((total - prevTotal) / prevTotal) * 100);
    const sign = pct < 0 ? '−' : pct > 0 ? '+' : '';
    badge.textContent = `${sign}${Math.abs(pct)}% vs ${monthName(prev)}`;
    if (pct < 0) badge.classList.add('down');
    if (pct > 0) badge.classList.add('up');
    note.textContent = isCurrent
      ? `Compared with the first ${days} days of ${monthName(prev, true)}.`
      : '';
  }

  // by category
  const sums = {};
  entries.forEach(e => { sums[e.category] = (sums[e.category] || 0) + e.amount; });
  const rows = Object.entries(sums).sort((a, b) => b[1] - a[1]);

  const box = document.getElementById('catList');
  box.innerHTML = '';

  if (!rows.length) {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = 'No expenses this month.';
    box.appendChild(p);
    return;
  }

  rows.forEach(([name, sum], i) => {
    const pc = Math.round((sum / total) * 100);

    const row = document.createElement('div');
    row.className = 'cat-row';

    const top = document.createElement('div');
    top.className = 'cat-top';
    const n = document.createElement('span');
    n.textContent = name;
    const a = document.createElement('span');
    a.textContent = peso(sum);
    const p = document.createElement('span');
    p.className = 'pc';
    p.textContent = pc + '%';
    a.appendChild(p);
    top.append(n, a);

    const bar = document.createElement('div');
    bar.className = 'bar';
    const fill = document.createElement('div');
    fill.style.width = pc + '%';
    fill.style.background = COLORS[i % COLORS.length];
    bar.appendChild(fill);

    row.append(top, bar);
    box.appendChild(row);
  });
}

document.getElementById('prevMonth').addEventListener('click', () => {
  statsMonth.setMonth(statsMonth.getMonth() - 1);
  renderStats();
});
document.getElementById('nextMonth').addEventListener('click', () => {
  statsMonth.setMonth(statsMonth.getMonth() + 1);
  renderStats();
});

/* month picker */
const picker = document.getElementById('picker');
let pickerYear = new Date().getFullYear();

function renderPicker() {
  const now = new Date();
  document.getElementById('yearLabel').textContent = pickerYear;
  document.getElementById('nextYear').disabled = pickerYear >= now.getFullYear();

  const used = new Set(load().map(e => e.date.slice(0, 7)));
  const grid = document.getElementById('monthGrid');
  grid.innerHTML = '';

  for (let m = 0; m < 12; m++) {
    const d = new Date(pickerYear, m, 1);
    const key = monthKey(d);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'month-cell';
    b.textContent = monthName(d);
    b.disabled = d > now; // no future months
    b.setAttribute('aria-label',
      `${monthName(d, true)} ${pickerYear}` + (used.has(key) ? ', has expenses' : ''));
    if (key === monthKey(statsMonth)) b.classList.add('selected');
    if (used.has(key)) b.classList.add('has-data');
    b.addEventListener('click', () => {
      statsMonth = new Date(pickerYear, m, 1);
      closePicker();
      renderStats();
    });
    grid.appendChild(b);
  }
}

function openPicker() {
  pickerYear = statsMonth.getFullYear();
  renderPicker();
  picker.classList.add('open');
}
function closePicker() {
  picker.classList.remove('open');
}

document.getElementById('monthLabel').addEventListener('click', openPicker);
document.getElementById('pickerClose').addEventListener('click', closePicker);
document.getElementById('pickerBackdrop').addEventListener('click', closePicker);
document.getElementById('prevYear').addEventListener('click', () => { pickerYear--; renderPicker(); });
document.getElementById('nextYear').addEventListener('click', () => { pickerYear++; renderPicker(); });
document.addEventListener('keydown', ev => {
  if (ev.key === 'Escape' && picker.classList.contains('open')) closePicker();
});

/* backup */
async function exportBackup() {
  const msg = document.getElementById('backupMsg');
  msg.textContent = 'Preparing your backup...';

  try {
    const data = JSON.stringify({
      app: 'liquidify',
      version: 1,
      exportedAt: new Date().toISOString(),
      expenses: load()
    }, null, 2);
    const name = `liquidify-backup-${dateKey()}.json`;
    const file = new File([data], name, { type: 'application/json' });

    // iPhone: open the share sheet so you can save to Files
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Liquidify backup' });
      msg.textContent = 'Backup ready. Make sure you saved it to Files.';
      return;
    }

    // laptop: normal download
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    msg.textContent = `Saved ${load().length} entries as ${name}.`;
  } catch (err) {
    if (err.name === 'AbortError') { msg.textContent = 'Cancelled.'; return; }
    msg.textContent = 'Error: ' + err.name + ' - ' + err.message;
  }
}

document.getElementById('exportBtn').addEventListener('click', exportBackup);

/* import */
function validEntry(e) {
  return e
    && typeof e.id === 'number'
    && typeof e.item === 'string' && e.item.trim()
    && typeof e.amount === 'number' && isFinite(e.amount) && e.amount > 0
    && typeof e.category === 'string' && e.category.trim()
    && typeof e.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.date)
    && (e.type === undefined || e.type === 'in' || e.type === 'out');
}

async function importBackup(file) {
  const msg = document.getElementById('backupMsg');
  try {
    const data = JSON.parse(await file.text());
    const incoming = Array.isArray(data) ? data : data.expenses;
    if (!Array.isArray(incoming)) throw new Error('This is not a Liquidify backup.');

    const good = incoming.filter(validEntry);
    const list = load();
    const have = new Set(list.map(e => e.id));

    let added = 0;
    good.forEach(e => {
      if (!have.has(e.id)) {
        list.push({
          id: e.id,
          item: e.item.trim(),
          amount: e.amount,
          category: e.category.trim(),
          type: e.type === 'in' ? 'in' : 'out',
          date: e.date
        });
        have.add(e.id);
        added++;
      }
    });

    save(list);
    render();

    const skipped = good.length - added;
    const bad = incoming.length - good.length;
    msg.textContent = `Added ${added} new. ${skipped} already there` +
      (bad ? `, ${bad} skipped (not valid).` : '.');
  } catch (err) {
    msg.textContent = 'Could not import: ' + err.message;
  }
}

document.getElementById('importBtn').addEventListener('click', () => {
  document.getElementById('importFile').click();
});
document.getElementById('importFile').addEventListener('change', ev => {
  const f = ev.target.files[0];
  if (f) importBackup(f);
  ev.target.value = ''; // so you can pick the same file again
});

/* search */
const qEl = document.getElementById('q');

function dateFromKey(k) {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function renderSearch() {
  const list = document.getElementById('searchList');
  const sum = document.getElementById('searchSummary');
  list.innerHTML = '';

  const raw = qEl.value.trim();
  const q = raw.toLowerCase();
  if (!q) {
    sum.textContent = 'Type a name, category, amount, or date (like "nov 3").';
    return;
  }

  const results = load()
    .filter(e => {
      const label = dateFromKey(e.date).toLocaleDateString('en-PH',
        { month: 'short', day: 'numeric', year: 'numeric' });
      return `${e.item} ${e.category} ${label} ${e.amount}`.toLowerCase().includes(q);
    })
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);

  if (!results.length) {
    sum.textContent = `No results for "${raw}".`;
    return;
  }

  const spent = results.filter(e => e.type !== 'in').reduce((s, e) => s + e.amount, 0);
  const moneyIn = results.filter(e => e.type === 'in').reduce((s, e) => s + e.amount, 0);
  const shown = results.slice(0, 100);

  sum.textContent =
    `${results.length} result${results.length > 1 ? 's' : ''} · Spent ${peso(spent)}` +
    (moneyIn ? ` · Money in ${peso(moneyIn)}` : '') +
    (results.length > shown.length ? ' · showing the first 100' : '');

  let last = '';
  shown.forEach(e => {
    if (e.date !== last) {
      last = e.date;
      const h = document.createElement('li');
      h.className = 'day-head';
      h.textContent = dateFromKey(e.date).toLocaleDateString('en-PH',
        { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
      list.appendChild(h);
    }

    const li = document.createElement('li');
    const row = document.createElement('button');
    row.className = 'row';
    row.addEventListener('click', () => openSheet(e));

    const left = document.createElement('span');
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = e.item;
    const cat = document.createElement('span');
    cat.className = 'cat';
    cat.textContent = e.category;
    left.append(name, cat);

    const price = document.createElement('span');
    price.className = 'price' + (e.type === 'in' ? ' in' : '');
    price.textContent = (e.type === 'in' ? '+' : '') + peso(e.amount);

    row.append(left, price);
    li.appendChild(row);
    list.appendChild(li);
  });
}

qEl.addEventListener('input', renderSearch);

/* tabs */
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.getElementById(btn.dataset.screen).classList.add('active');
    btn.classList.add('active');
  });
});

/* add / edit sheet */
const sheet = document.getElementById('sheet');
const amountEl = document.getElementById('amount');
const itemEl = document.getElementById('item');
const categoryEl = document.getElementById('category');

let editingId = null;
let entryType = 'out';

/* category helpers */
function normalize(s) {
  return s.toLowerCase().replace(/\s+/g, ' ').trim().replace(/s$/, '');
}

function getCategories() {
  const map = new Map();
  load().filter(e => (e.type || 'out') === entryType).forEach(e => {
    map.set(normalize(e.category), { name: e.category, last: e.id });
  });
  return [...map.values()].sort((a, b) => b.last - a.last);
}

function makeChip(name, isNew) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'chip' + (isNew ? ' new' : '');
  b.textContent = isNew ? '+ New: ' + name : name;
  b.addEventListener('click', () => {
    if (isNew) { categoryEl.blur(); return; }
    categoryEl.value = name;
    renderSuggestions();
  });
  return b;
}

function renderSuggestions() {
  const box = document.getElementById('suggestions');
  box.innerHTML = '';

  const typed = categoryEl.value.trim();
  const k = normalize(typed);
  const all = getCategories();

  let shown = all;
  if (typed) shown = all.filter(c => normalize(c.name).includes(k));
  shown.slice(0, 6).forEach(c => box.appendChild(makeChip(c.name, false)));

  const exact = all.some(c => normalize(c.name) === k);
  if (typed && !exact) box.appendChild(makeChip(typed, true));
}

categoryEl.addEventListener('input', renderSuggestions);

function setType(t) {
  entryType = t;
  const isIn = t === 'in';
  document.querySelectorAll('.seg-btn').forEach(b => {
    const on = b.dataset.type === t;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', on);
  });
  document.getElementById('sheetTitle').textContent =
    (editingId ? 'Edit ' : 'New ') + (isIn ? 'money in' : 'expense');
  document.getElementById('saveBtn').textContent =
    editingId ? 'Save changes' : (isIn ? 'Save money in' : 'Save expense');
  document.getElementById('itemLabel').textContent = isIn ? 'From who?' : 'What was it for?';
  document.getElementById('catLabel').textContent = isIn ? 'Type' : 'Category';
  itemEl.placeholder = isIn ? 'e.g. Mom' : 'e.g. Lunch';
  categoryEl.placeholder = isIn ? 'e.g. Allowance, Gift' : 'e.g. Food';
  renderSuggestions();
}

document.querySelectorAll('.seg-btn').forEach(b => {
  b.addEventListener('click', () => {
    categoryEl.value = '';
    setType(b.dataset.type);
  });
});

function openSheet(entry) {
  editingId = entry ? entry.id : null;
  document.getElementById('typeSeg').hidden = !!entry; // can't switch type while editing

  if (entry) {
    amountEl.value = entry.amount;
    itemEl.value = entry.item;
    categoryEl.value = entry.category;
  }

  setType(entry ? (entry.type || 'out') : 'out');
  sheet.classList.add('open');
  setTimeout(() => amountEl.focus(), 250);
}

function closeSheet() {
  sheet.classList.remove('open');
  editingId = null;
  amountEl.value = '';
  itemEl.value = '';
  categoryEl.value = '';
}

function openStart() {
  openSheet();
  setType('in');
  itemEl.value = 'Starting balance';
  categoryEl.value = 'Balance';
  renderSuggestions();
}
document.getElementById('balBtn').addEventListener('click', openStart);

document.getElementById('addBtn').addEventListener('click', () => openSheet());
document.getElementById('cancelBtn').addEventListener('click', closeSheet);
document.getElementById('backdrop').addEventListener('click', closeSheet);

document.getElementById('saveBtn').addEventListener('click', () => {
  const item = itemEl.value.trim();
  const amount = parseFloat(amountEl.value);
  let category = categoryEl.value.trim();

  if (!item || !amount || !category) {
    alert('Fill in everything first!');
    return;
  }

  // reuse the existing spelling if this category already exists
  const existing = getCategories().find(c => normalize(c.name) === normalize(category));
  if (existing) category = existing.name;

  const list = load();
  if (editingId) {
    const entry = list.find(e => e.id === editingId);
    if (entry) {
      entry.item = item;
      entry.amount = amount;
      entry.category = category;
      entry.type = entryType;
    }
  } else {
    list.push({ id: Date.now(), item, amount, category, type: entryType, date: viewKey() });
  }
  save(list);

  closeSheet();
  render();
});

render();

/* offline support */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}