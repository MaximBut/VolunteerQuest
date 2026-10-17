require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const bcrypt = require('bcrypt');
const path = require('path');
const crypto = require('crypto');

const app = express();

// --- БАЗА ДАНИХ ---
// Pool замість одного connection: одне з'єднання MySQL закривається після
// простою, і після цього всі запити падають. Pool перепідключається сам.
const pool = mysql.createPool({
  host: '127.0.0.1',
  port: 3306,
  user: 'dobro',
  password: 'dobro123',
  database: 'volunteer_db',
  charset: 'utf8mb4',   // щоб емодзі в подарунках зберігались коректно
  waitForConnections: true,
  connectionLimit: 10
});
const db = pool.promise();

pool.getConnection((err, conn) => {
  if (err) {
    console.error('Помилка підключення до MySQL:', err.code, err.message);
    return;
  }
  console.log('Успішно підключено до бази даних volunteer_db!');
  conn.release();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- ЗАХИСТ СЛУЖБОВИХ ФАЙЛІВ ---
// Раніше через express.static(__dirname) можна було відкрити
// http://localhost:3000/server.js і побачити пароль від БД.
const BLOCKED = /^\/(server\.js|package(-lock)?\.json|\.env.*|.*\.sql|node_modules(\/.*)?)$/i;
app.use((req, res, next) => {
  let p = req.path;
  try { p = decodeURIComponent(p); } catch (e) { return res.status(400).send('Bad request'); }
  if (BLOCKED.test(p)) return res.status(404).send('Not found');
  next();
});

// Кнопка «Вийти» веде на index.html, якого немає: перенаправляємо на головну
app.get('/index.html', (req, res) => res.redirect('/'));

app.use(express.static(path.join(__dirname), { dotfiles: 'deny' }));

// --- ДОПОМІЖНЕ ---
const levelOf = (xp) => Math.floor(xp / 100) + 1;
const fail = (res, code, message) => res.status(code).json({ success: false, message });
// --- СЕСІЇ (токени) ---
// Після входу сервер видає токен. Дії з балами (магазин) і керування подарунками
// перевіряють токен, а не "user_id" з запиту, тож чужі бали витратити не можна.
// Токени живуть у пам'яті сервера: після перезапуску потрібно увійти знову.
const sessions = new Map();               // token -> { userId, role, exp }
const SESSION_TTL = 24 * 60 * 60 * 1000;  // 24 години

function createSession(user) {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, { userId: user.id, role: user.role, exp: Date.now() + SESSION_TTL });
  return token;
}
function auth(...roles) {
  return (req, res, next) => {
    const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
    const s = m && sessions.get(m[1]);
    if (s && s.exp < Date.now()) { sessions.delete(m[1]); return fail(res, 401, 'Сесія завершилась, увійдіть знову.'); }
    if (!s) return fail(res, 401, 'Потрібно увійти в акаунт.');
    if (roles.length && !roles.includes(s.role)) return fail(res, 403, 'Недостатньо прав для цієї дії.');
    req.auth = s;
    next();
  };
}
const redirectFor = (role) =>
  role === 'organizer' ? '/organizer-dashboard.html' : '/volunteer-dashboard.html';

// --- МАГАЗИН: НАЛАШТУВАННЯ ---
// Хто може додавати подарунки в магазин. Зараз це організатори
// (вкладка «Подарунки» в organizer-dashboard.html).
// Рішення, хто саме керує магазином, можна змінити тут одним рядком.
const SHOP_MANAGER_ROLES = ['organizer'];
const SHOP_CATEGORIES = ['food', 'merch', 'fun', 'sport', 'edu'];
const clamp = (v, min, max, def) => { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def; };

// --- МАРШРУТИ ДЛЯ СТОРІНОК (HTML) ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'home1.html')));
app.get('/login.html', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/volunteer-dashboard.html', (req, res) => res.sendFile(path.join(__dirname, 'volunteer-dashboard.html')));
app.get('/organizer-dashboard.html', (req, res) => res.sendFile(path.join(__dirname, 'organizer-dashboard.html')));

// --- АВТОРИЗАЦІЯ ТА РЕЄСТРАЦІЯ ---

// Реєстрація (помилки текстом, щоб працював поточний login.js)
app.post('/register', async (req, res) => {
  const { username, email, password, role } = req.body;

  if (!username || !email || !password) {
    return res.status(400).send('Заповніть усі поля.');
  }
  const safeRole = role === 'organizer' ? 'organizer' : 'volunteer';

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    await db.query(
      'INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)',
      [username.trim(), email.trim(), hashedPassword, safeRole]
    );
    res.send('Реєстрація успішна!');
  } catch (err) {
    console.error('register:', err.code, err.message);
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).send('Користувач з таким ім’ям або поштою вже існує!');
    }
    res.status(500).send('Помилка сервера при реєстрації.');
  }
});

// Вхід: тепер ЗАВЖДИ відповідає JSON
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return fail(res, 400, 'Введіть логін і пароль.');

  try {
    const [rows] = await db.query('SELECT * FROM users WHERE username = ?', [username.trim()]);
    if (rows.length === 0) return fail(res, 400, 'Невірний логін або пароль.');

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) return fail(res, 400, 'Невірний логін або пароль.');

    const token = createSession(user);

    res.json({
      success: true,
      redirect: redirectFor(user.role),
      token,
      userId: user.id,
      username: user.username,
      role: user.role,
      xp: user.xp,
      coins: user.coins,
      level: levelOf(user.xp)
    });
  } catch (err) {
    console.error('login:', err.code, err.message);
    fail(res, 500, 'Помилка сервера (перевірте підключення до бази даних).');
  }
});

// --- ПРОФІЛЬ (XP, монети, рівень) ---
app.get('/api/users/:id', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT u.id, u.username, u.role, u.xp, u.coins,
              (SELECT COUNT(*) FROM user_tasks ut WHERE ut.user_id = u.id AND ut.status = 'completed') AS completed
       FROM users u WHERE u.id = ?`, [req.params.id]);
    if (rows.length === 0) return fail(res, 404, 'Користувача не знайдено.');
    const u = rows[0];
    res.json({ ...u, level: levelOf(u.xp), xpInLevel: u.xp % 100 });
  } catch (err) {
    console.error('profile:', err.message);
    fail(res, 500, 'Помилка отримання профілю.');
  }
});

// --- РОБОТА З ЗАВДАННЯМИ ---

// 1. Усі завдання (для головної та волонтерського кабінету)
app.get('/api/tasks', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT t.*, u.username AS organizer_name,
              (SELECT COUNT(*) FROM user_tasks ut WHERE ut.task_id = t.id) AS volunteers
       FROM tasks t JOIN users u ON u.id = t.organizer_id
       ORDER BY t.id DESC`);
    res.json(rows);
  } catch (err) {
    console.error('tasks:', err.message);
    res.status(500).json({ success: false, message: 'Помилка отримання завдань' });
  }
});

// 2. Створити завдання (тільки організатор)
app.post('/api/tasks', async (req, res) => {
  const { title, description, district, date, duration, reward_points, reward_coins, organizer_id } = req.body;

  if (!title || !description || !district || !organizer_id) {
    return fail(res, 400, 'Заповніть назву, опис, район та вкажіть організатора.');
  }

  try {
    const [org] = await db.query('SELECT role FROM users WHERE id = ?', [organizer_id]);
    if (org.length === 0 || org[0].role !== 'organizer') {
      return fail(res, 403, 'Створювати завдання може лише організатор.');
    }

    await db.query(
      `INSERT INTO tasks (title, description, district, date, duration, reward_points, reward_coins, organizer_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [title.trim(), description.trim(), district, date || 'Уточнюється', duration || 'Уточнюється',
       clamp(reward_points, 1, 500, 50), clamp(reward_coins, 1, 200, 10), organizer_id]
    );
    res.json({ success: true, message: 'Завдання успішно створено!' });
  } catch (err) {
    console.error('create task:', err.code, err.message);
    fail(res, 500, 'Помилка створення завдання');
  }
});

// 3. Волонтер бере завдання АБО надсилає його на перевірку організатору
//    body: { user_id, task_id, status? }
//    status = 'in_progress' (за замовчуванням)  -> взяти завдання
//    status = 'pending_approval'                -> "Я виконав", відправити на перевірку
app.post('/api/user-tasks', async (req, res) => {
  const { user_id, task_id } = req.body;
  const status = req.body.status || 'in_progress';
  if (!user_id || !task_id) return fail(res, 400, 'Потрібні user_id і task_id.');
  if (status !== 'in_progress' && status !== 'pending_approval') return fail(res, 400, 'Невідомий статус.');

  try {
    const [u] = await db.query('SELECT role FROM users WHERE id = ?', [user_id]);
    if (u.length === 0 || u[0].role !== 'volunteer') return fail(res, 403, 'Брати завдання можуть лише волонтери.');

    const [t] = await db.query('SELECT id FROM tasks WHERE id = ?', [task_id]);
    if (t.length === 0) return fail(res, 404, 'Завдання не знайдено.');

    if (status === 'pending_approval') {
      // Можна відправити лише те, що вже "в роботі"
      const [upd] = await db.query(
        `UPDATE user_tasks SET status = 'pending_approval', submitted_at = NOW(), review_note = NULL
         WHERE user_id = ? AND task_id = ? AND status = 'in_progress'`, [user_id, task_id]);
      if (upd.affectedRows === 0) return fail(res, 400, 'Спочатку візьміть завдання в роботу (або воно вже на перевірці).');
      return res.json({ success: true, message: 'Надіслано організатору на перевірку.' });
    }

    const [exists] = await db.query('SELECT id FROM user_tasks WHERE user_id = ? AND task_id = ?', [user_id, task_id]);
    if (exists.length > 0) return fail(res, 400, 'Ви вже взяли це завдання.');

    await db.query(`INSERT INTO user_tasks (user_id, task_id, status) VALUES (?, ?, 'in_progress')`, [user_id, task_id]);
    res.json({ success: true, message: 'Завдання успішно додано до вашого кабінету!' });
  } catch (err) {
    console.error('user-tasks:', err.code, err.message);
    fail(res, 500, 'Не вдалося обробити завдання.');
  }
});

// 4. Мої завдання волонтера (для кабінету волонтера: /api/user-tasks?user_id=5)
async function getUserTasks(userId) {
  const [rows] = await db.query(
    `SELECT ut.id AS user_task_id, ut.user_id, ut.task_id, ut.status, ut.taken_at,
            ut.submitted_at, ut.reviewed_at, ut.review_note,
            t.title, t.reward_points, t.reward_coins
     FROM user_tasks ut JOIN tasks t ON t.id = ut.task_id
     WHERE ut.user_id = ? ORDER BY ut.id DESC`, [userId]);
  return rows;
}
app.get('/api/user-tasks', async (req, res) => {
  if (!req.query.user_id) return fail(res, 400, 'Потрібен user_id.');
  try { res.json(await getUserTasks(req.query.user_id)); }
  catch (err) { console.error('my tasks:', err.message); fail(res, 500, 'Помилка отримання ваших завдань'); }
});
app.get('/api/user-tasks/:userId', async (req, res) => {
  try { res.json(await getUserTasks(req.params.userId)); }
  catch (err) { console.error('my tasks:', err.message); fail(res, 500, 'Помилка отримання ваших завдань'); }
});

// 5. Відмовитись від завдання (лише поки воно "в роботі")
app.delete('/api/user-tasks/:userId/:taskId', async (req, res) => {
  try {
    const [del] = await db.query(
      `DELETE FROM user_tasks WHERE user_id = ? AND task_id = ? AND status = 'in_progress'`,
      [req.params.userId, req.params.taskId]);
    if (del.affectedRows === 0) return fail(res, 400, 'Скасувати можна лише завдання зі статусом «в роботі».');
    res.json({ success: true });
  } catch (err) {
    console.error('drop task:', err.message);
    fail(res, 500, 'Не вдалося скасувати завдання.');
  }
});

// 6. Усі записи волонтерів на завдання (для кабінету організатора)
app.get('/api/all-user-tasks', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT ut.id AS user_task_id, ut.user_id, ut.task_id, ut.status,
              ut.submitted_at, ut.review_note, u.username
       FROM user_tasks ut JOIN users u ON u.id = ut.user_id
       ORDER BY ut.id DESC`);
    res.json(rows);
  } catch (err) {
    console.error('all-user-tasks:', err.message);
    fail(res, 500, 'Помилка отримання заявок.');
  }
});

// 7. ОРГАНІЗАТОР ПІДТВЕРДЖУЄ виконання -> тільки тут нараховуються XP і бали
//    body: { user_id (волонтер), task_id, organizer_id }
app.post('/api/complete-task', async (req, res) => {
  const { user_id, task_id, organizer_id } = req.body;
  if (!user_id || !task_id || !organizer_id) return fail(res, 400, 'Потрібні user_id, task_id і organizer_id.');

  let conn;
  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    const [tasks] = await conn.query(
      'SELECT reward_points, reward_coins, organizer_id FROM tasks WHERE id = ?', [task_id]);
    if (tasks.length === 0) { await conn.rollback(); return fail(res, 404, 'Завдання не знайдено.'); }
    if (String(tasks[0].organizer_id) !== String(organizer_id)) {
      await conn.rollback();
      return fail(res, 403, 'Підтверджувати виконання може лише організатор цього завдання.');
    }

    const [before] = await conn.query('SELECT xp FROM users WHERE id = ?', [user_id]);
    if (before.length === 0) { await conn.rollback(); return fail(res, 404, 'Волонтера не знайдено.'); }

    // Умова status='pending_approval' не дає нарахувати нагороду двічі
    // і не дає зарахувати завдання, яке волонтер ще не надіслав на перевірку.
    const [upd] = await conn.query(
      `UPDATE user_tasks SET status = 'completed', reviewed_at = NOW(), review_note = NULL
       WHERE user_id = ? AND task_id = ? AND status = 'pending_approval'`, [user_id, task_id]);
    if (upd.affectedRows === 0) {
      await conn.rollback();
      return fail(res, 400, 'Волонтер ще не надіслав це завдання на перевірку, або воно вже зараховане.');
    }

    const { reward_points, reward_coins } = tasks[0];
    await conn.query('UPDATE users SET xp = xp + ?, coins = coins + ? WHERE id = ?', [reward_points, reward_coins, user_id]);
    const [after] = await conn.query('SELECT xp, coins FROM users WHERE id = ?', [user_id]);

    await conn.commit();

    res.json({
      success: true,
      gained: { xp: reward_points, coins: reward_coins },
      xp: after[0].xp,
      coins: after[0].coins,
      level: levelOf(after[0].xp),
      leveledUp: levelOf(after[0].xp) > levelOf(before[0].xp)
    });
  } catch (err) {
    if (conn) await conn.rollback().catch(() => {});
    console.error('complete-task:', err.code, err.message);
    fail(res, 500, 'Не вдалося підтвердити виконання.');
  } finally {
    if (conn) conn.release();
  }
});

// 8. ОРГАНІЗАТОР ПОВЕРТАЄ завдання на доопрацювання (бали не нараховуються)
//    body: { user_id, task_id, organizer_id, note? }
app.post('/api/reject-task', async (req, res) => {
  const { user_id, task_id, organizer_id } = req.body;
  const note = String(req.body.note || '').trim().slice(0, 255) || null;
  if (!user_id || !task_id || !organizer_id) return fail(res, 400, 'Потрібні user_id, task_id і organizer_id.');

  try {
    const [tasks] = await db.query('SELECT organizer_id FROM tasks WHERE id = ?', [task_id]);
    if (tasks.length === 0) return fail(res, 404, 'Завдання не знайдено.');
    if (String(tasks[0].organizer_id) !== String(organizer_id)) {
      return fail(res, 403, 'Перевіряти виконання може лише організатор цього завдання.');
    }

    const [upd] = await db.query(
      `UPDATE user_tasks SET status = 'in_progress', reviewed_at = NOW(), review_note = ?
       WHERE user_id = ? AND task_id = ? AND status = 'pending_approval'`, [note, user_id, task_id]);
    if (upd.affectedRows === 0) return fail(res, 400, 'Це завдання не очікує підтвердження.');
    res.json({ success: true, message: 'Завдання повернено волонтеру на доопрацювання.' });
  } catch (err) {
    console.error('reject-task:', err.code, err.message);
    fail(res, 500, 'Не вдалося повернути завдання.');
  }
});

// =====================================================
// МАГАЗИН ПОДАРУНКІВ
// =====================================================
const shopManager = auth(...SHOP_MANAGER_ROLES);
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const makeCode = () => {
  let c = '';
  for (let i = 0; i < 8; i++) { c += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)]; if (i === 3) c += '-'; }
  return 'VQ-' + c;
};
const cleanEmoji = (e) => Array.from(String(e || '').trim()).slice(0, 4).join('') || '🎁';

// 1. Каталог для волонтерів: лише активні подарунки
app.get('/api/shop', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, category, emoji, name, partner, description, cost
       FROM shop_items WHERE is_active = 1 ORDER BY cost, id`);
    res.json(rows);
  } catch (err) {
    console.error('shop:', err.message);
    fail(res, 500, 'Помилка отримання магазину.');
  }
});

// 2. Мої покупки (лише для залогіненого волонтера)
app.get('/api/shop/my', auth('volunteer'), async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT p.id, p.item_id, p.code, p.cost, p.created_at, s.name, s.emoji, s.partner
       FROM purchases p JOIN shop_items s ON s.id = p.item_id
       WHERE p.user_id = ? ORDER BY p.id DESC`, [req.auth.userId]);
    res.json(rows);
  } catch (err) {
    console.error('shop my:', err.message);
    fail(res, 500, 'Помилка отримання покупок.');
  }
});

// 3. Обміняти бали на подарунок. Бали списуються однією атомарною умовою
//    "coins >= ціна", тому подвійні кліки не уводять баланс у мінус.
app.post('/api/shop/buy', auth('volunteer'), async (req, res) => {
  const itemId = parseInt(req.body.item_id, 10);
  if (!itemId) return fail(res, 400, 'Не вказано подарунок.');

  let conn;
  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    const [items] = await conn.query(
      'SELECT id, cost, name, emoji, partner FROM shop_items WHERE id = ? AND is_active = 1', [itemId]);
    if (items.length === 0) { await conn.rollback(); return fail(res, 404, 'Цього подарунка вже немає в магазині.'); }
    const item = items[0];

    const [pay] = await conn.query(
      'UPDATE users SET coins = coins - ? WHERE id = ? AND coins >= ?', [item.cost, req.auth.userId, item.cost]);
    if (pay.affectedRows === 0) { await conn.rollback(); return fail(res, 400, 'Недостатньо балів для цього подарунка.'); }

    let code = null;
    for (let attempt = 0; attempt < 5 && !code; attempt++) {
      const candidate = makeCode();
      try {
        await conn.query('INSERT INTO purchases (user_id, item_id, code, cost) VALUES (?, ?, ?, ?)',
          [req.auth.userId, item.id, candidate, item.cost]);
        code = candidate;
      } catch (e) {
        if (e.code !== 'ER_DUP_ENTRY') throw e;
      }
    }
    if (!code) throw new Error('Не вдалося згенерувати унікальний код');

    const [[u]] = await conn.query('SELECT coins FROM users WHERE id = ?', [req.auth.userId]);
    await conn.commit();

    res.json({ success: true, code, cost: item.cost, coins: u.coins,
               item: { name: item.name, emoji: item.emoji, partner: item.partner } });
  } catch (err) {
    if (conn) await conn.rollback().catch(() => {});
    console.error('shop buy:', err.code, err.message);
    fail(res, 500, 'Не вдалося виконати обмін.');
  } finally {
    if (conn) conn.release();
  }
});

// --- Керування подарунками (див. SHOP_MANAGER_ROLES) ---

// 4. Усі подарунки, включно з прихованими
app.get('/api/manage/shop', shopManager, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT s.id, s.category, s.emoji, s.name, s.partner, s.description, s.cost, s.is_active,
              (SELECT COUNT(*) FROM purchases p WHERE p.item_id = s.id) AS purchases
       FROM shop_items s ORDER BY s.id DESC`);
    res.json(rows);
  } catch (err) {
    console.error('shop manage:', err.message);
    fail(res, 500, 'Помилка отримання подарунків.');
  }
});

// 5. Додати подарунок
app.post('/api/manage/shop', shopManager, async (req, res) => {
  const name = String(req.body.name || '').trim();
  const partner = String(req.body.partner || '').trim();
  const description = String(req.body.description || '').trim().slice(0, 300);
  const category = req.body.category;
  const cost = parseInt(req.body.cost, 10);

  if (!name || !partner) return fail(res, 400, 'Вкажіть назву подарунка та партнера.');
  if (!SHOP_CATEGORIES.includes(category)) return fail(res, 400, 'Невірна категорія.');
  if (!Number.isFinite(cost) || cost < 1 || cost > 100000) return fail(res, 400, 'Ціна має бути від 1 до 100000 балів.');

  try {
    const [r] = await db.query(
      `INSERT INTO shop_items (category, emoji, name, partner, description, cost, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [category, cleanEmoji(req.body.emoji), name.slice(0, 120), partner.slice(0, 120), description, cost, req.auth.userId]);
    res.json({ success: true, id: r.insertId, message: 'Подарунок додано в магазин.' });
  } catch (err) {
    console.error('shop manage add:', err.code, err.message);
    fail(res, 500, 'Не вдалося додати подарунок.');
  }
});

// 6. Змінити подарунок: сховати/показати (is_active), ціна, назва тощо.
//    Видалення немає навмисно: покупки посилаються на подарунок, його лише ховають.
app.put('/api/manage/shop/:id', shopManager, async (req, res) => {
  const sets = [], vals = [];
  const b = req.body;
  if (b.is_active !== undefined) { sets.push('is_active = ?'); vals.push(b.is_active ? 1 : 0); }
  if (b.cost !== undefined) {
    const cost = parseInt(b.cost, 10);
    if (!Number.isFinite(cost) || cost < 1 || cost > 100000) return fail(res, 400, 'Ціна має бути від 1 до 100000 балів.');
    sets.push('cost = ?'); vals.push(cost);
  }
  if (b.name !== undefined)        { const v = String(b.name).trim();    if (!v) return fail(res, 400, 'Назва не може бути порожньою.');   sets.push('name = ?');    vals.push(v.slice(0, 120)); }
  if (b.partner !== undefined)     { const v = String(b.partner).trim(); if (!v) return fail(res, 400, 'Партнер не може бути порожнім.'); sets.push('partner = ?'); vals.push(v.slice(0, 120)); }
  if (b.description !== undefined) { sets.push('description = ?'); vals.push(String(b.description).trim().slice(0, 300)); }
  if (b.emoji !== undefined)       { sets.push('emoji = ?'); vals.push(cleanEmoji(b.emoji)); }
  if (b.category !== undefined) {
    if (!SHOP_CATEGORIES.includes(b.category)) return fail(res, 400, 'Невірна категорія.');
    sets.push('category = ?'); vals.push(b.category);
  }
  if (!sets.length) return fail(res, 400, 'Немає що змінювати.');

  try {
    const [r] = await db.query(`UPDATE shop_items SET ${sets.join(', ')} WHERE id = ?`, [...vals, req.params.id]);
    if (r.affectedRows === 0) return fail(res, 404, 'Подарунок не знайдено.');
    res.json({ success: true });
  } catch (err) {
    console.error('shop manage update:', err.message);
    fail(res, 500, 'Не вдалося оновити подарунок.');
  }
});

// Невідомі API-маршрути та помилки: завжди JSON
app.use('/api', (req, res) => fail(res, 404, 'Маршрут не знайдено.'));
app.use((err, req, res, next) => {
  console.error('unhandled:', err);
  fail(res, 500, 'Внутрішня помилка сервера.');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Сервер запущено! Відкрийте у браузері: http://localhost:${PORT}`);
});