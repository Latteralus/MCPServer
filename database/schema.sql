-- HIPAA-Compliant Chat Application Database Schema
-- Version: 1.0.0
-- Created: 2025-03-19

-- Enable extensions for enhanced functionality
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Roles Table (moved up to fix circular dependency)
CREATE TABLE IF NOT EXISTS roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Users Table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    salt VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    role_id UUID REFERENCES roles(id),
    status VARCHAR(20) DEFAULT 'active', -- active, suspended, deleted
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    two_factor_enabled BOOLEAN DEFAULT FALSE,
    two_factor_secret VARCHAR(255),
    failed_login_attempts INTEGER DEFAULT 0,
    lockout_until TIMESTAMP
);

-- Permissions Table
CREATE TABLE IF NOT EXISTS permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    category VARCHAR(50)
);

-- Role Permissions Mapping
CREATE TABLE IF NOT EXISTS role_permissions (
    role_id UUID REFERENCES roles(id),
    permission_id UUID REFERENCES permissions(id),
    PRIMARY KEY (role_id, permission_id)
);

-- Channels Table
CREATE TABLE IF NOT EXISTS channels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    is_private BOOLEAN DEFAULT FALSE,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_activity TIMESTAMP,
    archived BOOLEAN DEFAULT FALSE,
    metadata JSONB
);

-- Channel Members Table
CREATE TABLE IF NOT EXISTS channel_members (
    channel_id UUID REFERENCES channels(id),
    user_id UUID REFERENCES users(id),
    role VARCHAR(20) DEFAULT 'member', -- member, admin, moderator
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_read_at TIMESTAMP,
    PRIMARY KEY (channel_id, user_id)
);

-- Messages Table
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    channel_id UUID REFERENCES channels(id),
    sender_id UUID REFERENCES users(id),
    text TEXT NOT NULL,
    encrypted_text BYTEA, -- For end-to-end encryption
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    edited_at TIMESTAMP,
    deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMP,
    deleted_by UUID REFERENCES users(id),
    flagged BOOLEAN DEFAULT FALSE,
    flag_reason TEXT,
    flagged_by UUID REFERENCES users(id),
    flagged_at TIMESTAMP,
    metadata JSONB,
    contains_phi BOOLEAN DEFAULT FALSE
);

-- Message Reactions Table
CREATE TABLE IF NOT EXISTS message_reactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id UUID REFERENCES messages(id),
    user_id UUID REFERENCES users(id),
    reaction VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Audit Log Table
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User Status History
CREATE TABLE IF NOT EXISTS user_status_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    status VARCHAR(20) NOT NULL, -- online, offline, away, busy
    start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    end_time TIMESTAMP
);

-- Create indexes only if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_messages_channel') THEN
        CREATE INDEX idx_messages_channel ON messages(channel_id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_messages_sender') THEN
        CREATE INDEX idx_messages_sender ON messages(sender_id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_audit_logs_user') THEN
        CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_audit_logs_timestamp') THEN
        CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_user_status_history') THEN
        CREATE INDEX idx_user_status_history ON user_status_history(user_id);
    END IF;
END $$;

-- Comments for HIPAA Compliance
COMMENT ON TABLE messages IS 'Stores all chat messages with sensitive data tracking';
COMMENT ON COLUMN messages.contains_phi IS 'Flag to indicate potential Protected Health Information';
COMMENT ON TABLE audit_logs IS 'Comprehensive audit trail for tracking all system activities';

-- Initial data setup (added for immediate usability)
-- Create default roles
INSERT INTO roles (name, description, is_default) 
VALUES 
  ('admin', 'System administrator with full access', false),
  ('user', 'Standard user role', true)
ON CONFLICT (name) DO NOTHING;

-- Create initial admin user (username: admin, password: admin123)
DO $$
DECLARE
  admin_role_id UUID;
BEGIN
  SELECT id INTO admin_role_id FROM roles WHERE name = 'admin';
  
  -- Simple password hash for initial setup (should be replaced with proper hashing in production)
  INSERT INTO users (username, email, password_hash, salt, first_name, last_name, role_id, status)
  VALUES (
    'admin', 
    'admin@example.com', 
    '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9', -- SHA-256 hash of 'admin123'
    'initial_salt', 
    'System', 
    'Administrator', 
    admin_role_id,
    'active'
  )
  ON CONFLICT (username) DO NOTHING;
END $$;

-- Add basic permissions
INSERT INTO permissions (name, description, category)
VALUES
  ('user.create', 'Create new users', 'user'),
  ('user.read', 'View user details', 'user'),
  ('user.update', 'Update user information', 'user'),
  ('user.delete', 'Delete users', 'user'),
  ('channel.create', 'Create new channels', 'channel'),
  ('channel.read', 'View channel details', 'channel'),
  ('channel.update', 'Update channel information', 'channel'),
  ('channel.delete', 'Delete channels', 'channel'),
  ('message.create', 'Send messages', 'message'),
  ('message.read', 'Read messages', 'message'),
  ('message.update', 'Edit messages', 'message'),
  ('message.delete', 'Delete messages', 'message')
ON CONFLICT (name) DO NOTHING;

-- Assign all permissions to admin role
DO $$
DECLARE
  admin_role_id UUID;
  perm_id UUID;
  perm_cursor CURSOR FOR SELECT id FROM permissions;
BEGIN
  SELECT id INTO admin_role_id FROM roles WHERE name = 'admin';
  
  OPEN perm_cursor;
  LOOP
    FETCH perm_cursor INTO perm_id;
    EXIT WHEN NOT FOUND;
    
    INSERT INTO role_permissions (role_id, permission_id)
    VALUES (admin_role_id, perm_id)
    ON CONFLICT (role_id, permission_id) DO NOTHING;
  END LOOP;
  CLOSE perm_cursor;
END $$;