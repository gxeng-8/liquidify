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

function addSwipe(slide) {
  const W = 88; // width of the Delete button
  let startX = 0, dx = 0, base = 0, dragging = false, moved = false;

  slide.addEventListener('pointerdown', ev => {
    if (openSlide && openSlide !== slide) closeOpen();
    startX = ev.clientX;
    base = slide === openSlide ? -W : 0;
    dx = 0;
    moved = false;
    dragging = true;
    slide.style.transition = 'none';
  });

  slide.addEventListener('pointermove', ev => {
    if (!dragging) return;
    dx = ev.clientX - startX;
    if (Math.abs(dx) > 8) moved = true;
    const x = Math.min(0, Math.max(-W, base + dx));
    slide.style.transform = `translateX(${x}px)`;
  });

  function end() {
    if (!dragging) return;
    dragging = false;
    slide.style.transition = '';
    if (base + dx < -W / 2) {
      slide.style.transform = `translateX(-${W}px)`;
      openSlide = slide;
    } else {
      slide.style.transform = '';
      if (openSlide === slide) openSlide = null;
    }
  }
  slide.addEventListener('pointerup', end);
  slide.addEventListener('pointercancel', end);

  // a swipe shouldn't count as a tap; tapping an open row just closes it
  slide.addEventListener('click', ev => {
    if (moved) {
      ev.stopPropagation();
      ev.preventDefault();
      moved = false;
    } else if (slide === openSlide) {
      ev.stopPropagation();
      closeOpen();
    }
  }, true);
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

function render() {
  const items = load().filter(e => e.date === dateKey());

  document.getElementById('listDate').textContent =
    new Date().toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' });

  const total = items.reduce((sum, e) => sum + e.amount, 0);
  document.getElementById('dayTotal').textContent = peso(total);

  const ul = document.getElementById('list');
  ul.innerHTML = '';

  if (!items.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'No expenses yet today. Tap + to add one.';
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
    price.className = 'price';
    price.textContent = peso(e.amount);

    row.append(left, price);
    slide.appendChild(row);
    li.append(label, slide);
    addSwipe(li, slide, e);
    ul.appendChild(li);
  });
}

/* tabs */
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.getElementById(btn.dataset.screen).classList.add('active');
    btn.classList.add('active');
  });
});

/* add sheet */
const sheet = document.getElementById('sheet');
const amountEl = document.getElementById('amount');
const itemEl = document.getElementById('item');
const categoryEl = document.getElementById('category');

/* category helpers */
function normalize(s) {
  return s.toLowerCase().replace(/\s+/g, ' ').trim().replace(/s$/, '');
}

function getCategories() {
  const map = new Map();
  load().forEach(e => {
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

let editingId = null;

function openSheet(entry) {
  editingId = entry ? entry.id : null;

  document.getElementById('sheetTitle').textContent =
    entry ? 'Edit expense' : 'New expense';
  document.getElementById('saveBtn').textContent =
    entry ? 'Save changes' : 'Save expense';

  if (entry) {
    amountEl.value = entry.amount;
    itemEl.value = entry.item;
    categoryEl.value = entry.category;
  }

  renderSuggestions();
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

document.getElementById('addBtn').addEventListener('click', () => openSheet());document.getElementById('cancelBtn').addEventListener('click', closeSheet);
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
    }
  } else {
    list.push({ id: Date.now(), item, amount, category, date: dateKey() });
  }
  save(list);

  closeSheet();
  render();
});

render();