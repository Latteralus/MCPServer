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
    lockout_until TIMESTAMP,
    force_password_change BOOLEAN DEFAULT FALSE,
    password_last_changed TIMESTAMP,
    password_hash_type VARCHAR(20) DEFAULT 'pbkdf2'
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
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    previous_log_hash VARCHAR(64) NULL, -- Hash of the previous log entry
    current_log_hash VARCHAR(64) NULL   -- Hash of this log entry
);

-- User Status History
CREATE TABLE IF NOT EXISTS user_status_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    status VARCHAR(20) NOT NULL, -- online, offline, away, busy
    start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    end_time TIMESTAMP
);

-- Session Records
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) NOT NULL,
    token_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    ip_address INET,
    user_agent TEXT,
    is_valid BOOLEAN DEFAULT TRUE
);

-- Password Reset Requests
CREATE TABLE IF NOT EXISTS password_reset_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) NOT NULL,
    token_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    used_at TIMESTAMP
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
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_sessions_user_id') THEN
        CREATE INDEX idx_sessions_user_id ON sessions(user_id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_sessions_token_hash') THEN
        CREATE INDEX idx_sessions_token_hash ON sessions(token_hash);
    END IF;
END $$;

-- Comments for HIPAA Compliance
COMMENT ON TABLE messages IS 'Stores all chat messages with sensitive data tracking';
COMMENT ON COLUMN messages.contains_phi IS 'Flag to indicate potential Protected Health Information';
COMMENT ON TABLE audit_logs IS 'Comprehensive audit trail for tracking all system activities';
COMMENT ON TABLE sessions IS 'Tracks active user sessions with validity status';
COMMENT ON TABLE users IS 'Stores user accounts with security features like password aging, lockouts, and 2FA';

-- Default Roles
INSERT INTO roles (name, description, is_default) 
VALUES 
  ('super_admin', 'System administrator with full access', false),
  ('admin', 'Administrator with extended privileges', false),
  ('moderator', 'Channel and user moderator', false),
  ('user', 'Standard user role', true)
ON CONFLICT (name) DO NOTHING;

-- Default Permissions
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
  ('channel.invite', 'Invite users to channels', 'channel'),
  ('message.create', 'Send messages', 'message'),
  ('message.read', 'Read messages', 'message'),
  ('message.update', 'Edit messages', 'message'),
  ('message.delete', 'Delete messages', 'message'),
  ('message.flag', 'Flag inappropriate messages', 'message'),
  ('admin.logs', 'Access system logs', 'admin'),
  ('admin.metrics', 'View system metrics', 'admin'),
  ('admin.users', 'Manage user accounts', 'admin'),
  ('admin.roles', 'Manage roles and permissions', 'admin'),
  ('admin.system', 'Manage system settings', 'admin')
ON CONFLICT (name) DO NOTHING;

-- NOTE: No default users are created here to avoid hardcoded credentials
-- Initial admin user should be created by the application during first run
-- using environment variables or a setup wizard

-- Function to automatically update timestamps
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at timestamps
CREATE TRIGGER update_users_modtime
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION update_modified_column();