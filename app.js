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

    const left = document.createElement('div');
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = e.item;
    const cat = document.createElement('div');
    cat.className = 'cat';
    cat.textContent = e.category;
    left.append(name, cat);

    const price = document.createElement('div');
    price.className = 'price';
    price.textContent = peso(e.amount);

    li.append(left, price);
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

function openSheet() {
  sheet.classList.add('open');
  setTimeout(() => amountEl.focus(), 250);
}
function closeSheet() {
  sheet.classList.remove('open');
}

document.getElementById('addBtn').addEventListener('click', openSheet);
document.getElementById('cancelBtn').addEventListener('click', closeSheet);
document.getElementById('backdrop').addEventListener('click', closeSheet);

document.getElementById('saveBtn').addEventListener('click', () => {
  const item = itemEl.value.trim();
  const amount = parseFloat(amountEl.value);
  const category = categoryEl.value.trim();

  if (!item || !amount || !category) {
    alert('Fill in everything first!');
    return;
  }

  const list = load();
  list.push({ id: Date.now(), item, amount, category, date: dateKey() });
  save(list);

  itemEl.value = '';
  amountEl.value = '';
  categoryEl.value = '';
  closeSheet();
  render();
});

render();