CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'admin',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE categories (
    id SERIAL PRIMARY KEY,
    category_name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE items (
    id SERIAL PRIMARY KEY,
    item_code VARCHAR(100) UNIQUE NOT NULL,
    item_name VARCHAR(255) NOT NULL,
    category_id INTEGER,
    description TEXT,
    quantity INTEGER DEFAULT 0,
    unit_price DECIMAL(10,2) DEFAULT 0,
    image_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_category FOREIGN KEY(category_id) REFERENCES categories(id)
);

-- Insert default admin user (password: admin123)
-- Password hashed with bcrypt (cost 10) – generate your own and replace
INSERT INTO users (username, password, role) VALUES ('admin', '$2a$10$YourHashedPasswordHere', 'admin');

-- Sample categories
INSERT INTO categories (category_name) VALUES ('Electronics'), ('Clothing'), ('Books');