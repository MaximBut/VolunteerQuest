-- =====================================================
-- ДоброРазом: повна схема бази даних (MySQL 8 / MariaDB)
-- =====================================================

CREATE DATABASE IF NOT EXISTS volunteer_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE volunteer_db;

-- УВАГА: наступні три рядки ВИДАЛЯЮТЬ усі дані (користувачів, завдання, прогрес).
-- Для першого запуску це нормально. Після того, як з'являться реальні
-- користувачі, закоментуйте їх (поставте -- на початку), щоб не втратити дані.
DROP TABLE IF EXISTS user_tasks;
DROP TABLE IF EXISTS tasks;
DROP TABLE IF EXISTS users;

-- 1. Користувачі (волонтери та організатори)
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,              -- bcrypt-хеш, не пароль у відкритому вигляді
    role ENUM('volunteer', 'organizer') NOT NULL DEFAULT 'volunteer',
    coins INT NOT NULL DEFAULT 0,                -- бали для обміну на бонуси партнерів
    xp INT NOT NULL DEFAULT 0,                   -- досвід (рівень = xp / 100 + 1)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 2. Завдання (квести), які створюють організатори
CREATE TABLE tasks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(150) NOT NULL,
    description TEXT NOT NULL,
    district VARCHAR(100) NOT NULL,
    date VARCHAR(50) NOT NULL,
    duration VARCHAR(50) NOT NULL,
    reward_points INT NOT NULL DEFAULT 50,       -- скільки XP отримає волонтер
    reward_coins INT NOT NULL DEFAULT 10,        -- скільки монет отримає волонтер
    organizer_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (organizer_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_tasks_district (district)
) ENGINE=InnoDB;

-- 3. «Мої завдання»: зв'язок волонтерів із завданнями
CREATE TABLE user_tasks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    task_id INT NOT NULL,
    status ENUM('in_progress', 'completed') NOT NULL DEFAULT 'in_progress',
    taken_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    UNIQUE KEY uq_user_task (user_id, task_id)   -- одне завдання можна взяти лише раз
) ENGINE=InnoDB;