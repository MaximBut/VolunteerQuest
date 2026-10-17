-- =====================================================
-- ДоброРазом: повна схема бази даних (MySQL 5.7+ / 8 / MariaDB)
-- Для НОВОЇ бази з нуля. Якщо база вже є з даними, запустіть
-- замість цього файл migration_review.sql.
-- =====================================================

CREATE DATABASE IF NOT EXISTS volunteer_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

SET NAMES utf8mb4;    -- щоб кирилиця й емодзі зберігались правильно з консолі mysql
USE volunteer_db;

-- УВАГА: наступні три рядки ВИДАЛЯЮТЬ усі дані (користувачів, завдання, прогрес).
-- Після появи реальних користувачів закоментуйте їх (поставте -- на початку).
DROP TABLE IF EXISTS purchases;
DROP TABLE IF EXISTS shop_items;
DROP TABLE IF EXISTS user_tasks;
DROP TABLE IF EXISTS tasks;
DROP TABLE IF EXISTS users;

-- 1. Користувачі (волонтери та організатори)
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,              -- bcrypt-хеш
    role ENUM('volunteer', 'organizer') NOT NULL DEFAULT 'volunteer',
    coins INT NOT NULL DEFAULT 0,                -- бали для обміну на бонуси партнерів
    xp INT NOT NULL DEFAULT 0,                   -- досвід (рівень = xp / 100 + 1)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 2. Завдання, які створюють організатори (з полем category)
CREATE TABLE tasks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(150) NOT NULL,
    category VARCHAR(50) NOT NULL,               -- <--- Поле категорії для фільтрації
    description TEXT NOT NULL,
    district VARCHAR(100) NOT NULL,
    date VARCHAR(50) NOT NULL,
    duration VARCHAR(50) NOT NULL,
    reward_points INT NOT NULL DEFAULT 50,       -- скільки XP отримає волонтер
    reward_coins INT NOT NULL DEFAULT 10,        -- скільки балів отримає волонтер
    organizer_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (organizer_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_tasks_district (district)
) ENGINE=InnoDB;

-- 3. «Мої завдання»: зв'язок волонтерів із завданнями
--    in_progress      -> волонтер взяв завдання
--    pending_approval -> волонтер натиснув "Завершити", чекає перевірки організатора
--    completed        -> організатор підтвердив, бали нараховано
CREATE TABLE user_tasks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    task_id INT NOT NULL,
    status ENUM('in_progress', 'pending_approval', 'completed') NOT NULL DEFAULT 'in_progress',
    taken_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    submitted_at TIMESTAMP NULL DEFAULT NULL,
    reviewed_at TIMESTAMP NULL DEFAULT NULL,
    review_note VARCHAR(255) NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    UNIQUE KEY uq_user_task (user_id, task_id)
) ENGINE=InnoDB;

-- 4. Каталог подарунків (додають організатори у вкладці «Подарунки»)
CREATE TABLE shop_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    category VARCHAR(20) NOT NULL,                -- food, merch, fun, sport, edu
    emoji VARCHAR(16) NOT NULL DEFAULT '🎁',
    name VARCHAR(120) NOT NULL,
    partner VARCHAR(120) NOT NULL,
    description VARCHAR(300) NOT NULL DEFAULT '',
    cost INT NOT NULL,                            -- ціна в балах (users.coins)
    is_active TINYINT(1) NOT NULL DEFAULT 1,      -- 0 = прихований
    created_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_shop_active (is_active, category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Покупки волонтерів (унікальний промокод)
CREATE TABLE purchases (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    item_id INT NOT NULL,
    code VARCHAR(20) NOT NULL UNIQUE,
    cost INT NOT NULL,                            -- ціна на момент покупки
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES shop_items(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;