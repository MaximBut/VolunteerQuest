require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const bcrypt = require('bcrypt');
const path = require('path');

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

    res.json({
      success: true,
      redirect: user.role === 'organizer' ? '/organizer-dashboard.html' : '/volunteer-dashboard.html',
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
       Number(reward_points) || 50, Number(reward_coins) || 10, organizer_id]
    );
    res.json({ success: true, message: 'Завдання успішно створено!' });
  } catch (err) {
    console.error('create task:', err.code, err.message);
    fail(res, 500, 'Помилка створення завдання');
  }
});

// 3. Взяти завдання («Мої завдання»)
app.post('/api/user-tasks', async (req, res) => {
  const { user_id, task_id } = req.body;
  if (!user_id || !task_id) return fail(res, 400, 'Потрібні user_id і task_id.');

  try {
    const [task] = await db.query('SELECT id FROM tasks WHERE id = ?', [task_id]);
    if (task.length === 0) return fail(res, 404, 'Завдання не знайдено.');

    const [exists] = await db.query('SELECT id FROM user_tasks WHERE user_id = ? AND task_id = ?', [user_id, task_id]);
    if (exists.length > 0) return fail(res, 400, 'Ви вже взяли це завдання.');

    await db.query(`INSERT INTO user_tasks (user_id, task_id, status) VALUES (?, ?, 'in_progress')`, [user_id, task_id]);
    res.json({ success: true, message: 'Завдання успішно додано до вашого кабінету!' });
  } catch (err) {
    console.error('take task:', err.code, err.message);
    fail(res, 500, 'Не вдалося взяти завдання.');
  }
});

// 4. Мої завдання волонтера
app.get('/api/user-tasks/:userId', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT ut.id AS user_task_id, ut.status, ut.taken_at, t.*
       FROM user_tasks ut JOIN tasks t ON t.id = ut.task_id
       WHERE ut.user_id = ? ORDER BY ut.id DESC`, [req.params.userId]);
    res.json(rows);
  } catch (err) {
    console.error('my tasks:', err.message);
    res.status(500).json({ success: false, message: 'Помилка отримання ваших завдань' });
  }
});

// 5. Завершити завдання: нарахувати XP і монети, перерахувати рівень
app.post('/api/user-tasks/complete', async (req, res) => {
  const { user_id, task_id } = req.body;
  if (!user_id || !task_id) return fail(res, 400, 'Потрібні user_id і task_id.');

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [tasks] = await conn.query('SELECT reward_points, reward_coins FROM tasks WHERE id = ?', [task_id]);
    if (tasks.length === 0) { await conn.rollback(); return fail(res, 404, 'Завдання не знайдено.'); }

    const [before] = await conn.query('SELECT xp FROM users WHERE id = ?', [user_id]);
    if (before.length === 0) { await conn.rollback(); return fail(res, 404, 'Користувача не знайдено.'); }

    // Умова status='in_progress' не дає нарахувати нагороду двічі
    const [upd] = await conn.query(
      `UPDATE user_tasks SET status = 'completed'
       WHERE user_id = ? AND task_id = ? AND status = 'in_progress'`, [user_id, task_id]);
    if (upd.affectedRows === 0) {
      await conn.rollback();
      return fail(res, 400, 'Це завдання не в роботі або вже завершене.');
    }

    const { reward_points, reward_coins } = tasks[0];
    await conn.query('UPDATE users SET xp = xp + ?, coins = coins + ? WHERE id = ?', [reward_points, reward_coins, user_id]);
    const [after] = await conn.query('SELECT xp, coins FROM users WHERE id = ?', [user_id]);

    await conn.commit();

    const oldLevel = levelOf(before[0].xp);
    const newLevel = levelOf(after[0].xp);
    res.json({
      success: true,
      gained: { xp: reward_points, coins: reward_coins },
      xp: after[0].xp,
      coins: after[0].coins,
      level: newLevel,
      leveledUp: newLevel > oldLevel
    });
  } catch (err) {
    await conn.rollback();
    console.error('complete task:', err.code, err.message);
    fail(res, 500, 'Не вдалося завершити завдання.');
  } finally {
    conn.release();
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