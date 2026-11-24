CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(254) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  base_role ENUM('owner','admin','core','member') NOT NULL DEFAULT 'member',
  status ENUM('pending','active','rejected') NOT NULL DEFAULT 'pending',
  lead_id CHAR(36) NULL,
  owner_slot TINYINT GENERATED ALWAYS AS (IF(base_role = 'owner', 1, NULL)) STORED UNIQUE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (lead_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash CHAR(64) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  expires_at DATETIME NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX (expires_at)
);
CREATE TABLE IF NOT EXISTS invites (
  id CHAR(36) PRIMARY KEY,
  token_hash CHAR(64) NOT NULL UNIQUE,
  email VARCHAR(254) NOT NULL,
  issued_by CHAR(36) NOT NULL,
  lead_id CHAR(36) NULL,
  expires_at DATETIME NOT NULL,
  consumed_at DATETIME NULL,
  revoked_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (issued_by) REFERENCES users(id),
  FOREIGN KEY (lead_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS custom_roles (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(70) NOT NULL UNIQUE,
  permissions JSON NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS user_roles (
  user_id CHAR(36) NOT NULL,
  role_id CHAR(36) NOT NULL,
  PRIMARY KEY (user_id, role_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (role_id) REFERENCES custom_roles(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS forms (
  id CHAR(36) PRIMARY KEY,
  slug VARCHAR(96) NOT NULL UNIQUE,
  title VARCHAR(140) NOT NULL,
  description TEXT NOT NULL,
  status ENUM('draft','open','closed') NOT NULL DEFAULT 'draft',
  published_at DATETIME NULL,
  schema_json JSON NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS applications (
  id CHAR(36) PRIMARY KEY,
  form_id CHAR(36) NOT NULL,
  applicant_name VARCHAR(120) NOT NULL,
  email VARCHAR(254) NOT NULL,
  answers JSON NOT NULL,
  ai_consent BOOLEAN NOT NULL DEFAULT FALSE,
  status ENUM('new','reviewing','approved','rejected') NOT NULL DEFAULT 'new',
  review_note TEXT NULL,
  reviewer_id CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  reviewed_at DATETIME NULL,
  FOREIGN KEY (form_id) REFERENCES forms(id),
  FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (form_id, email),
  INDEX (form_id, created_at, id),
  INDEX (form_id, status)
);
CREATE TABLE IF NOT EXISTS mcp_keys (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  label VARCHAR(100) NOT NULL,
  tail CHAR(6) NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  kind ENUM('personal','oauth') NOT NULL,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS oauth_clients (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  redirect_uri VARCHAR(512) COLLATE utf8mb4_bin NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (redirect_uri)
);
CREATE TABLE IF NOT EXISTS oauth_codes (
  token_hash CHAR(64) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  client_id CHAR(36) NOT NULL,
  redirect_uri VARCHAR(512) COLLATE utf8mb4_bin NOT NULL,
  challenge CHAR(43) NOT NULL,
  expires_at DATETIME NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES oauth_clients(id) ON DELETE CASCADE,
  INDEX (expires_at)
);
CREATE TABLE IF NOT EXISTS audit_events (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  actor_id CHAR(36) NOT NULL,
  action VARCHAR(80) NOT NULL,
  target VARCHAR(96) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (actor_id) REFERENCES users(id)
);
