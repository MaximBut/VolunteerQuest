require('dotenv').config();
const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
 
const app = express();
const PORT = process.env.PORT || 3000;
 
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
 
mongoose
  .connect(process.env.MONGODB_URI, { dbName: process.env.MONGODB_DB || 'volunteerquest' })
  .then(() => console.log('MongoDB підключена'))
  .catch((err) => console.error('Помилка підключення к MongoDB:', err.message));
 
const page = (file) => (req, res) => res.sendFile(path.join(__dirname, file));
 
app.get('/', page('home.html'));
app.get('/home', page('home.html'));
app.get('/login', page('login.html'));
app.get('/dobrokvest', page('dobrokvest.html'));
app.get('/organizer-dashboard', page('organizer-dashboard.html'));
app.get('/volunteer-dashboard', page('volunteer-dashboard.html'));
 
['home', 'login', 'dobrokvest', 'organizer-dashboard', 'volunteer-dashboard'].forEach((name) => {
  app.get(`/${name}.html`, page(`${name}.html`));
});
 
['style.css', 'login.css', 'login.js', 'volun1.jpg'].forEach((file) => {
  app.get(`/${file}`, page(file));
});
 
app.use('/images', express.static(path.join(__dirname, 'images')));
 
app.get('/api/health', (req, res) => {
  const states = ['отключена', 'подключена', 'подключается', 'отключается'];
  res.json({ server: 'ok', mongodb: states[mongoose.connection.readyState] });
});
 
app.use((req, res) => {
  res.status(404).send('Страница не найдена');
});
 
app.listen(PORT, () => {
  console.log(`Сервер запущен: http://localhost:${PORT}`);
});