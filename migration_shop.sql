-- =====================================================
-- МІГРАЦІЯ: магазин подарунків
-- Запустіть ОДИН раз на вже існуючій базі. Дані НЕ видаляються.
-- =====================================================
SET NAMES utf8mb4;   -- щоб кирилиця й емодзі зберігались правильно з консолі mysql
USE volunteer_db;

-- 1. Каталог подарунків (їх додають організатори у вкладці «Подарунки»)
CREATE TABLE IF NOT EXISTS shop_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    category VARCHAR(20) NOT NULL,                -- food, merch, fun, sport, edu
    emoji VARCHAR(16) NOT NULL DEFAULT '🎁',
    name VARCHAR(120) NOT NULL,
    partner VARCHAR(120) NOT NULL,
    description VARCHAR(300) NOT NULL DEFAULT '',
    cost INT NOT NULL,                            -- ціна в балах (users.coins)
    is_active TINYINT(1) NOT NULL DEFAULT 1,      -- 0 = прихований, у магазині не видно
    created_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_shop_active (is_active, category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Покупки волонтерів (кожна має унікальний промокод)
CREATE TABLE IF NOT EXISTS purchases (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    item_id INT NOT NULL,
    code VARCHAR(20) NOT NULL UNIQUE,
    cost INT NOT NULL,                            -- ціна на момент покупки
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES shop_items(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
