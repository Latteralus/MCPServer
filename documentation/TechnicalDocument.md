# MCP Messenger Server Documentation

## Table of Contents
1. [Introduction](#introduction)
2. [Server Architecture Overview](#server-architecture-overview)
3. [Server Requirements](#server-requirements)
4. [Configuration](#configuration)
5. [Installation and Setup](#installation-and-setup)
6. [Client Connectivity Guide](#client-connectivity-guide)
7. [API Reference](#api-reference)
8. [Database Schema](#database-schema)
9. [Authentication and Security](#authentication-and-security)
10. [WebSocket Communication](#websocket-communication)
11. [Admin Dashboard](#admin-dashboard)
12. [Maintenance and Monitoring](#maintenance-and-monitoring)
13. [Troubleshooting](#troubleshooting)
14. [Security Considerations](#security-considerations)
15. [Key Findings Summary](#key-findings-summary)

## Introduction

MCP Messenger is a HIPAA-compliant WebSocket chat server designed for secure messaging within healthcare organizations. The server provides real-time messaging capabilities over WebSockets, with comprehensive authentication, audit logging, and administrative features required for healthcare communications.

### Core Features

- Real-time messaging through WebSockets
- HIPAA-compliant communications with PHI identification
- User authentication and authorization with role-based permissions
- Secure channel-based messaging
- Message encryption for sensitive data
- Comprehensive audit logging
- Administrative dashboard
- REST API for management operations

## Server Architecture Overview

The MCP Messenger server is built using Node.js and follows a modular architecture. The main components include:

- **HTTP/WebSocket Server**: Handles both HTTP API requests and WebSocket connections
- **Authentication Service**: Manages user sessions and verifies credentials
- **Messaging Service**: Processes and routes messages between users and channels
- **Database Layer**: Stores user data, messages, and audit logs
- **Admin Dashboard**: Web interface for server administration
- **Encryption Service**: Handles encryption/decryption of sensitive messages

### Directory Structure

```
/server/
├── app.js                              # Main application entry point
├── chatServer.js                       # Core WebSocket server implementation
├── adminDashboard.js                   # Admin dashboard initialization
├── config.js                           # Configuration management
├── config.json                         # Default configuration
├── package.json                        # NPM dependencies and scripts
├── startServer.sh                      # Script to start the server (Unix)
├── start-server.bat                    # Script to start the server (Windows)
├── start-production.js                 # Production startup script
├── fix-imports.js                      # Import path correction utility
│
├── admin/                              # Admin Panel frontend
│   ├── dashboard.html                  # Admin dashboard HTML
│   ├── login.html                      # Admin login HTML
│   └── assets/                         # Admin assets (CSS, JS)
│
├── api/                                # API Components
│   ├── routes/                         # API route definitions
│   │   ├── index.js                    # Route registration
│   │   ├── userRoutes.js               # User management endpoints
│   │   ├── channelRoutes.js            # Channel management endpoints
│   │   ├── messageRoutes.js            # Message management endpoints
│   │   └── auditRoutes.js              # Audit log endpoints
│   │
│   ├── controllers/                    # API controllers
│   │   ├── auditController.js          # Audit log controller
│   │   ├── channelController.js        # Channel controller
│   │   ├── messageController.js        # Message controller
│   │   └── userController.js           # User controller
│   │
│   └── middleware/                     # API middleware
│       ├── auth.js                     # Authentication middleware
│       ├── validation.js               # Request validation
│       ├── rateLimit.js                # Rate limiting
│       └── errorHandler.js             # Error handling
│
├── dashboard/                          # Admin dashboard backend
│   ├── assets.js                       # Asset handling
│   ├── audit.js                        # Audit logging
│   ├── auth.js                         # Authentication
│   ├── config.js                       # Dashboard config
│   ├── http.js                         # HTTP routes
│   ├── messages.js                     # Message handling
│   ├── metrics.js                      # Server metrics
│   └── websocket.js                    # WebSocket handling
│
├── database/                           # Database components
│   ├── migrations/                     # Database migrations
│   │   └── 001_initial_schema.js       # Initial schema
│   ├── schema.sql                      # Database schema
│   └── seed.js                         # Database seed script
│
├── models/                             # Database models
│   ├── auditModel.js                   # Audit log model
│   ├── channelModel.js                 # Channel model
│   ├── messageModel.js                 # Message model
│   ├── roleModel.js                    # Role model
│   └── userModel.js                    # User model
│
├── services/                           # Business logic services
│   ├── authService.js                  # Authentication service
│   ├── channelService.js               # Channel service
│   ├── encryptionService.js            # Encryption service
│   ├── messageService.js               # Message service
│   ├── notificationService.js          # Notification service
│   ├── permissionService.js            # Permission service
│   └── resourceAuthorizationService.js # Resource authorization
│
├── utils/                              # Utility modules
│   └── dbTransaction.js                # Database transaction utilities
│
├── websocket/                          # WebSocket components
│   ├── handlers.js                     # Message handlers
│   └── broadcaster.js                  # Message broadcasting
│
├── config/                             # Configuration
│   └── database.js                     # Database configuration
│
├── logs/                               # Log directory
│   └── admin/                          # Admin logs
│
└── exports/                            # Data export directory
```

## Server Requirements

### System Requirements

- **Node.js**: v16.0.0 or higher
- **PostgreSQL**: v12.0 or higher
- **Operating System**: Linux, Windows, or macOS

### Hardware Recommendations

- **CPU**: 2+ cores
- **RAM**: 4GB minimum (8GB recommended)
- **Disk Space**: 10GB minimum for application and logs

### Third-Party Dependencies

All dependencies are listed in `package.json` and include:

- **Express**: Web server framework
- **ws**: WebSocket library
- **pg**: PostgreSQL client
- **jsonwebtoken**: JWT authentication
- **crypto**: Cryptography functions
- **dotenv**: Environment variable management
- **joi**: Configuration validation
- **argon2**: Password hashing (via AuthService)

## Configuration

The server uses a layered configuration approach, combining environment variables, config files, and command-line arguments.

### Configuration Files

- **config.json**: Default configuration
- **.env**: Environment-specific configuration (not included in repo)

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | 3000 |
| `DB_HOST` | Database hostname | localhost |
| `DB_PORT` | Database port | 5432 |
| `DB_NAME` | Database name | mcp_messenger_db |
| `DB_USER` | Database username | mcp_messenger_admin |
| `DB_PASSWORD` | Database password | *Required* |
| `DB_MAX_CONNECTIONS` | Max DB connections | 20 |
| `JWT_SECRET` | JWT signing secret | *Required* |
| `JWT_EXPIRES_IN` | JWT expiration time | 24h |
| `LOG_LEVEL` | Logging level (error, warn, info, debug) | info |
| `AUTHENTICATE_USERS` | Require authentication | true |
| `ALLOWED_NETWORK_RANGE` | Allowed IP range | 192.168.0.0/16 |
| `INITIAL_ADMIN_USERNAME` | Initial admin username | *Optional* |
| `INITIAL_ADMIN_EMAIL` | Initial admin email | *Optional* |
| `ENCRYPTION_KEY` | Encryption key for PHI (AES-256) | *Required* |
| `METADATA_KEY` | Encryption key for metadata (AES-256) | *Required* |
| `NODE_ENV` | Environment (development/production) | development |

### Default Port Configuration

- **HTTP/WebSocket Server**: Port 3000 (default, configurable)
- **Admin Dashboard**: Same port as the main server
- **Database**: Port 5432 (PostgreSQL default)

## Installation and Setup

### Prerequisites

1. Install Node.js (v16.0.0+)
2. Install PostgreSQL (v12.0+)
3. Create a PostgreSQL database and user

### Installation Steps

1. Clone the repository:
```bash
git clone [repository-url]
cd mcp-messenger-server
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file with your configuration:
```
PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=mcp_messenger_db
DB_USER=mcp_messenger_admin
DB_PASSWORD=your_secure_password
JWT_SECRET=your_secure_jwt_secret
ENCRYPTION_KEY=your_secure_32_byte_encryption_key_base64_encoded
METADATA_KEY=your_secure_32_byte_metadata_key_base64_encoded
NODE_ENV=production
```
**Important:** Ensure `DB_PASSWORD`, `JWT_SECRET`, `ENCRYPTION_KEY`, and `METADATA_KEY` are strong, unique, and managed securely. Do not commit the `.env` file to version control.

4. Initialize the database:
```bash
npm run init-db
```

5. Start the server:
```bash
# Development mode
npm run start:dev

# Production mode
npm start
```

### Docker Installation (Alternative)

While no Dockerfile is included in the provided files, you could containerize the application with the following steps:

1. Create a `Dockerfile`:
```dockerfile
FROM node:16-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
```

2. Build and run the Docker container:
```bash
docker build -t mcp-messenger .
docker run -p 3000:3000 --env-file .env mcp-messenger
```

## Client Connectivity Guide

### WebSocket Connection

Clients connect to the server via WebSockets. The connection process is as follows:

1. **Establish WebSocket Connection**: Connect to `ws://server-address:port` or `wss://server-address:port` for secure connections.

2. **Authentication**: Send an authentication message immediately after connecting:
```json
{
  "type": "authenticate",
  "token": "your_jwt_token"
}
```

3. **Authentication Response**: The server will respond with an authentication result:
```json
{
  "type": "authentication_response",
  "success": true,
  "user": {
    "id": "user-id",
    "username": "username"
  }
}
```

4. **Join Channels**: After authentication, join channels to receive messages:
```json
{
  "type": "join_channel",
  "channelId": "channel-id"
}
```

5. **Send Messages**: Send messages to a channel:
```json
{
  "type": "send_message",
  "channelId": "channel-id",
  "text": "Your message text",
  "containsPHI": false
}
```

### REST API Connection

The server also provides a REST API for management operations. All API endpoints require authentication via JWT token in the Authorization header:

```
Authorization: Bearer your_jwt_token
```

#### Authentication Endpoints

- **POST /api/auth/login**: Authenticate a user
  ```json
  {
    "username": "username",
    "password": "password"
  }
  ```

- **POST /api/auth/refresh-token**: Refresh an authentication token

#### User Endpoints

- **GET /api/users**: List all users
- **GET /api/users/:id**: Get user details
- **POST /api/users**: Create a new user
- **PUT /api/users/:id**: Update a user
- **DELETE /api/users/:id**: Delete a user

#### Channel Endpoints

- **GET /api/channels**: List all channels
- **GET /api/channels/:id**: Get channel details
- **POST /api/channels**: Create a new channel
- **PUT /api/channels/:id**: Update a channel
- **DELETE /api/channels/:id**: Delete a channel

#### Message Endpoints

- **GET /api/messages**: List messages
- **GET /api/messages/:id**: Get message details
- **POST /api/messages**: Create a new message
- **PUT /api/messages/:id**: Update a message
- **DELETE /api/messages/:id**: Delete a message

### Connection Code Examples

#### JavaScript WebSocket Client Example

```javascript
// Connect to the WebSocket server
const ws = new WebSocket('ws://server-address:3000');

// Handle connection open
ws.onopen = () => {
  console.log('Connected to the server');
  
  // Authenticate
  ws.send(JSON.stringify({
    type: 'authenticate',
    token: 'your_jwt_token'
  }));
};

// Handle incoming messages
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  console.log('Received:', message);
  
  // Handle authentication response
  if (message.type === 'authentication_response' && message.success) {
    // Join a channel
    ws.send(JSON.stringify({
      type: 'join_channel',
      channelId: 'channel-id'
    }));
  }
  
  // Handle other message types
  if (message.type === 'new_message') {
    // Display the message
    console.log(`${message.data.sender}: ${message.data.text}`);
  }
};

// Send a message
function sendMessage(channelId, text) {
  ws.send(JSON.stringify({
    type: 'send_message',
    channelId,
    text,
    containsPHI: false
  }));
}
```

#### REST API Example (JavaScript)

```javascript
// Login and get token
async function login(username, password) {
  const response = await fetch('http://server-address:3000/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ username, password })
  });
  
  const data = await response.json();
  return data.token;
}

// Get user list
async function getUsers(token) {
  const response = await fetch('http://server-address:3000/api/users', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  return await response.json();
}

// Create a new channel
async function createChannel(token, channelData) {
  const response = await fetch('http://server-address:3000/api/channels', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(channelData)
  });
  
  return await response.json();
}
```

## API Reference

### WebSocket API Messages

| Message Type | Direction | Description | Required Fields |
|--------------|-----------|-------------|----------------|
| `authenticate` | Client → Server | Authenticate the connection | `token` |
| `authentication_response` | Server → Client | Authentication result | `success`, `user` |
| `join_channel` | Client → Server | Join a channel | `channelId` |
| `leave_channel` | Client → Server | Leave a channel | `channelId` |
| `send_message` | Client → Server | Send a message | `channelId`, `text` |
| `new_message` | Server → Client | New message notification | `data` (message details) |
| `edit_message` | Client → Server | Edit a message | `messageId`, `text` |
| `message_updated` | Server → Client | Message edited notification | `data` (message details) |
| `delete_message` | Client → Server | Delete a message | `messageId` |
| `message_deleted` | Server → Client | Message deleted notification | `data` (message and channel IDs) |
| `typing_indicator` | Client → Server | Indicate user is typing | `channelId` |
| `read_receipt` | Client → Server | Mark messages as read | `channelId`, `messageId` |
| `ping`/`heartbeat` | Client → Server | Keep connection alive | - |
| `pong` | Server → Client | Heartbeat response | - |
| `system_event` | Server → Client | System notification | `eventType`, `data` |
| `notification` | Server → Client | User notification | various |

### REST API Endpoints

**Note:** All state-changing API endpoints (POST, PUT, DELETE) are now protected against Cross-Site Request Forgery (CSRF). Clients must include a valid CSRF token, typically obtained during session initialization or page load, in requests (e.g., via `CSRF-Token` header or `_csrf` form field). GET, HEAD, and OPTIONS requests do not require CSRF tokens. Rate limiting is also applied (stricter limits on `/api/auth`, standard limits elsewhere).

#### Authentication

| Method | Endpoint | Description | Request Body | Response |
|--------|----------|-------------|--------------|----------|
| POST | `/api/auth/login` | Login | `username`, `password` | JWT Token |
| POST | `/api/auth/refresh-token` | Refresh token | - | New JWT Token |
| POST | `/api/auth/register` | Register new user | User details | User object |
| POST | `/api/auth/change-password` | Change password | `currentPassword`, `newPassword` | Success message |

#### Users

| Method | Endpoint | Description | Request Body | Response |
|--------|----------|-------------|--------------|----------|
| GET | `/api/users` | List users | - | User array |
| GET | `/api/users/:id` | Get user | - | User object |
| POST | `/api/users` | Create user | User details | User object |
| PUT | `/api/users/:id` | Update user | Update fields | Updated user |
| DELETE | `/api/users/:id` | Delete user | - | Success message |
| GET | `/api/users/:id/permissions` | Get permissions | - | Permissions array |
| PUT | `/api/users/:id/password` | Update password | Password details | Success message |
| PUT | `/api/users/:id/notification-preferences` | Update preferences | Preference object | Success message |
| POST | `/api/users/search` | Search users | Search criteria | User array |
| GET | `/api/users/:id/audit-log` | Get user audit log | - | Audit entries |
| GET | `/api/users/:id/sessions` | Get user sessions | - | Session array |
| POST | `/api/users/:id/terminate-sessions` | End sessions | Options | Success message |

#### Channels

| Method | Endpoint | Description | Request Body | Response |
|--------|----------|-------------|--------------|----------|
| GET | `/api/channels` | List channels | - | Channel array |
| GET | `/api/channels/:id` | Get channel | - | Channel object |
| POST | `/api/channels` | Create channel | Channel details | Channel object |
| PUT | `/api/channels/:id` | Update channel | Update fields | Updated channel |
| DELETE | `/api/channels/:id` | Delete channel | - | Success message |

#### Messages

| Method | Endpoint | Description | Request Body | Response |
|--------|----------|-------------|--------------|----------|
| GET | `/api/messages` | List messages | - | Message array |
| GET | `/api/messages/:id` | Get message | - | Message object |
| POST | `/api/messages` | Create message | Message details | Message object |
| PUT | `/api/messages/:id` | Update message | Update fields | Updated message |
| DELETE | `/api/messages/:id` | Delete message | - | Success message |

#### Audit Logs

| Method | Endpoint | Description | Query Params | Response |
|--------|----------|-------------|--------------|----------|
| GET | `/api/audit` | List audit logs | Filters | Audit log array |
| GET | `/api/audit/:id` | Get audit entry | - | Audit log entry |

## Database Schema

The server uses PostgreSQL and defines the following tables:

### Users Table

```sql
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    salt VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    role_id UUID REFERENCES roles(id),
    status VARCHAR(20) DEFAULT 'active',
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
```

### Roles Table

```sql
CREATE TABLE IF NOT EXISTS roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Permissions Table

```sql
CREATE TABLE IF NOT EXISTS permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    category VARCHAR(50)
);

CREATE TABLE IF NOT EXISTS role_permissions (
    role_id UUID REFERENCES roles(id),
    permission_id UUID REFERENCES permissions(id),
    PRIMARY KEY (role_id, permission_id)
);
```

### Channels Table

```sql
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

CREATE TABLE IF NOT EXISTS channel_members (
    channel_id UUID REFERENCES channels(id),
    user_id UUID REFERENCES users(id),
    role VARCHAR(20) DEFAULT 'member',
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_read_at TIMESTAMP,
    PRIMARY KEY (channel_id, user_id)
);
```

### Messages Table

```sql
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    channel_id UUID REFERENCES channels(id),
    sender_id UUID REFERENCES users(id),
    text TEXT NOT NULL,
    encrypted_text BYTEA,
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

CREATE TABLE IF NOT EXISTS message_reactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id UUID REFERENCES messages(id),
    user_id UUID REFERENCES users(id),
    reaction VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Audit Log Table

```sql
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Sessions and Password Reset Tables

```sql
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

CREATE TABLE IF NOT EXISTS password_reset_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) NOT NULL,
    token_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    used_at TIMESTAMP
);
```

## Authentication and Security

### Authentication Process

1. **Login**: Users authenticate via the `/api/auth/login` endpoint with username and password.
2. **Token Generation**: On successful authentication, the server issues a JWT token.
3. **Session Creation**: The server creates a session record in the database with the token hash and expiry.
4. **Token Usage**: The client uses this token for all API requests and WebSocket authentication.
5. **Session Validation**: The server validates the token and checks the database session on each request.
6. **Token Refresh**: Clients can refresh their token without re-authenticating.


### Password Security

- User passwords are hashed using Argon2id (preferred), with an upgrade mechanism from legacy PBKDF2/SHA-256 hashes.
- Admin dashboard passwords are also hashed using Argon2id (previously SHA-256).
- Salt is generated for each user and stored in the database (Note: Argon2id hashes typically include the salt).
- Account lockout after multiple failed login attempts is implemented for both API and admin dashboard.
- Password complexity requirements are enforced via API validation.
### Role-Based Access Control

The system uses a role-based permission system:

1. **Roles**: Pre-defined roles such as super_admin, admin, moderator, and user
2. **Permissions**: Granular permissions for each operation
3. **Role-Permission Assignment**: Each role has a set of assigned permissions
4. **Permission Checking**: The server checks permissions before each action

Default roles and their capabilities:

| Role | Description | Example Permissions |
|------|-------------|---------------------|
| super_admin | Full system access | All permissions |
| admin | Administrative access | User management, channel management, logs |
| moderator | Content moderation | Flag/delete messages, channel management |
| user | Standard access | Send messages, join channels |

### CSRF Protection

- State-changing API endpoints (POST, PUT, DELETE) and Admin Dashboard forms/actions are protected against Cross-Site Request Forgery (CSRF) using the `csurf` middleware with cookie-based token storage.
- Clients (including the Admin Dashboard frontend) must include the `_csrf` token in form submissions or the `CSRF-Token` header in AJAX requests for these operations. The frontend implementation has been verified to correctly handle this.

### Rate Limiting

- API endpoints are rate-limited using `express-rate-limit` to prevent abuse.
- Authentication routes (`/api/auth`) have a stricter limit (e.g., 10 requests / 15 minutes per IP).
- Other API routes have a standard limit (e.g., 100 requests / 15 minutes per IP).
- Requests from trusted local network ranges may be excluded from rate limiting (see `api/middleware/rateLimit.js`).

### Message Encryption

Message content is encrypted using the centralized `EncryptionService` for HIPAA compliance:

1. **Encryption Algorithm**: Uses AES-256-GCM (authenticated encryption) for strong security.
2. **Key Management**: Relies on persistent `ENCRYPTION_KEY` and `METADATA_KEY` provided via environment variables. The application will fail to start if these keys are not configured. Temporary key generation has been removed.
3. **Storage**: Only the encrypted ciphertext (along with IV and auth tag, stored as JSON) is stored in the database (`encrypted_text` column). The plaintext `text` column is always stored as NULL.
4. **PHI Flag**: A `contains_phi` flag can still be set on messages, primarily for potential filtering or reporting, but encryption occurs regardless of the flag's value.
5. **Decryption**: The `EncryptionService` handles decryption using the appropriate persistent key. Access control mechanisms should restrict who can trigger decryption.

## WebSocket Communication

### Connection Lifecycle

1. **Connection Establishment**: Client connects to the WebSocket endpoint
2. **Authentication**: Client sends authentication message with JWT token
3. **Channel Joining**: Client joins channels to receive messages
4. **Message Exchange**: Client and server exchange messages
5. **Heartbeat**: Client sends periodic ping messages to keep the connection alive
6. **Disconnection**: Client or server closes the connection

### Message Handling

When a message is received:

1. The `WebSocketHandlers` class processes the message based on its type
2. For chat messages, the message is validated, stored in the database, and broadcast to channel members
3. The server handles different message types (text, commands, etc.)
4. Messages with PHI are encrypted before storage
5. All message actions are logged in the audit log

### Broadcaster

The `WebSocketBroadcaster` class handles message distribution:

1. **Channel Broadcasting**: Sends messages to all members of a channel
2. **User Broadcasting**: Sends direct messages to specific users
3. **System Broadcasting**: Sends system-wide announcements

### Connection Management

The server monitors connections for:

1. **Idle Connections**: Connections without activity are terminated
2. **Ping/Pong**: Clients must respond to ping messages
3. **Authentication Timeout**: Clients must authenticate within a short window
4. **Rate Limiting**: Messages are rate-limited to prevent abuse

## Admin Dashboard

### Dashboard Access

The admin dashboard is accessible at:
- URL: `http://server-address:3000/admin`
- Default credentials are set during initial setup

### Dashboard Features

The admin dashboard provides the following features:

1. **Server Metrics**: Active connections, message counts, memory usage
2. **User Management**: Create, view, edit, and delete users
3. **Channel Management**: Create, view, edit, and delete channels
4. **Message Monitoring**: View and moderate messages
5. **Audit Logs**: View system activity
6. **System Settings**: Configure server settings

### Dashboard Interface

The dashboard consists of:

1. **Login Page**: Authentication for admin access
2. **Dashboard Home**: Overview of system metrics
3. **User Management**: User listing and management
4. **Channel Management**: Channel listing and management
5. **Message Monitoring**: Message listing with moderation tools
6. **Logs**: System and audit logs
7. **Settings**: Server configuration

## Maintenance and Monitoring

### Logging and Auditing

1.  **Structured System Logs**: The application uses a structured logger (`pino`) configured via `config/logger.js`. Logs are output to the console (pretty-printed in development) and potentially files based on configuration. Log levels (`error`, `warn`, `info`, `debug`) are configurable via the `LOG_LEVEL` environment variable. All `console.*` calls have been refactored to use this logger. (Completed 2025-03-30)
2.  **Database Audit Trail**: A comprehensive audit trail of significant actions (logins, messages, configuration changes, errors, etc.) is stored in the `audit_logs` database table. Critical security events are logged immediately, bypassing any configured batching. Logged details include user ID, action, timestamp, IP address, user agent, hostname, and process ID. Tamper-evidence (hash chaining via `previous_log_hash` and `current_log_hash`) is implemented for immediate logs and logs written within database transactions (`logWithClient`). This mechanism is not applied to batched, non-critical logs due to complexity. (Partially Completed 2025-03-30)
3.  **Admin Logs**: Specific admin actions might still be logged separately (e.g., in `/logs/admin/`), although the primary audit trail is the database.

### Database Maintenance

1. **Backups**: Regular database backups should be implemented
2. **Migrations**: Database schema can be updated using migration scripts
3. **Indexes**: The schema includes indexes for performance
4. **Monitoring**: Database metrics should be monitored for performance

### Performance Monitoring

The server includes built-in metrics collection:

1. **Connection Metrics**: Active connections, connection history
2. **Message Metrics**: Message counts, rates
3. **System Metrics**: Memory usage, CPU load
4. **Database Metrics**: Connection pool status

### Health Checks

The server provides a health check endpoint:
- URL: `http://server-address:3000/health`
- Response: JSON with status, uptime, and timestamp

### Backup Procedures

Recommended backup procedures:

1. **Database**: Regular PostgreSQL dumps
2. **Configuration**: Backup of `.env` and configuration files
3. **Logs**: Backup and rotation of log files

## Troubleshooting

### Common Issues

#### Connection Problems

1. **WebSocket Connection Failure**:
   - Check server is running
   - Verify correct server address and port
   - Check client WebSocket implementation
   - Verify network connectivity and firewall settings

2. **Authentication Failure**:
   - Check username and password
   - Verify JWT token is valid and not expired
   - Check if account is locked due to failed attempts

3. **Database Connection Issues**:
   - Verify PostgreSQL is running
   - Check database credentials in `.env`
   - Verify database name and connection parameters

#### Server Startup Problems

1. **Port Already in Use**:
   - Check if another service is using port 3000
   - Change the port in configuration

2. **Database Migration Failures**:
   - Check database connection
   - Verify user has permissions to create tables
   - Look for SQL errors in logs

3. **Missing Dependencies**:
   - Run `npm install` to install dependencies
   - Check Node.js version is 16.0.0 or higher

### Diagnostic Procedures

1. **Check Server Logs**:
   - Look for error messages in console output
   - Check logs in `/logs` directory

2. **Verify Database Connection**:
   - Run `node -e "require('./config/database').testConnection()"`

3. **Test API Endpoints**:
   - Use cURL or Postman to test REST API
   - Check for error responses

4. **Review Configuration**:
   - Verify environment variables are set correctly
   - Check configuration values in logs

### Restart Procedures

To restart the server:

1. **Graceful Shutdown**:
   - Send a SIGTERM signal to the process
   - The server will finish processing requests and close connections

2. **Start the Server**:
   - Run `npm start`
   - Or use the start scripts: `./startServer.sh` or `start-server.bat`

## Security Considerations

### Security Status & Remaining Concerns (Post-Remediation)

Several critical security issues identified previously have been addressed:

1. **Credentials & Secrets Management**:
   - Hardcoded fallback JWT secret removed; application requires `JWT_SECRET` environment variable.
   - Hardcoded default admin password hash removed from `admin-config.json`.
   - Hardcoded database credential fallbacks removed from init scripts and config files; application requires environment variables.
   - Initial admin temporary password is no longer logged to console.
   - *Remaining Concern*: Default weak DB password (`admin123`) still exists in `config.json` (though overridden by env vars). Secure initialization process for admin user is needed.

2. **Authentication & Authorization**:
   - Admin dashboard authentication upgraded from SHA-256 to Argon2id.
   - WebSocket broadcast authorization checks implemented.
   - *Remaining Concern*: Review role permissions for least privilege. Consider adding 2FA.

3. **Data Encryption**:
   - Message encryption upgraded to AES-256-GCM using persistent keys from environment variables (`ENCRYPTION_KEY`, `METADATA_KEY`).
   - Insecure temporary key generation removed; application fails startup without keys.
   - Plaintext message storage removed; only encrypted data is stored.
   - *Remaining Concern*: Lack of automated key rotation mechanism. Consider integration with a KMS.

4. **API & Network Security**:
   - API rate limiting implemented with stricter limits for authentication endpoints.
   - API-side CSRF protection implemented using `csurf`.
   - *Remaining Concern*: Frontend CSRF token handling needs completion in admin dashboard JS. Review `allowedNetworkRange` default. Implement HTTPS/WSS.

5. **Audit Logging**:
   - Critical audit events are now logged immediately, bypassing batching.
   - Logged details enhanced with hostname and process ID.
   - Basic tamper-evidence (hash chaining) implemented for immediate logs.
   - *Remaining Concern*: Tamper-evidence for batched/transactional logs needs review/implementation. Log rotation and secure storage policies need definition.

6. **Input Sanitization**:
   - Potential XSS in admin dashboard message list (via `data-messageid`) fixed by escaping the ID.
   - *Remaining Concern*: General use of `innerHTML` in dashboard JS requires careful review to ensure all dynamic data is properly escaped. Implement Content Security Policy (CSP).

7. **Dependencies**:
   - Addressed high-severity vulnerabilities reported by `npm audit` by updating packages.
   - *Status (2025-03-30)*: Two low-severity vulnerabilities in `cookie` (<0.7.0, via `csurf`) persist. `npm audit fix` ineffective. Accepted risk for now, documented in `IdentifiedIssues.md`.

### Security Recommendations

1. **Credentials Management**:
   - Change default database password
   - Use a strong JWT secret
   - Rotate credentials regularly
   - Implement a secrets management solution (HashiCorp Vault, AWS KMS)

2. **Network Security**:
   - Configure allowedNetworkRange in settings
   - Use HTTPS and WSS for all connections
   - Set up proper firewall rules
   - Use a reverse proxy (nginx, Apache) with TLS termination
   - Implement rate limiting for all endpoints

3. **Data Protection**:
   - Enable encryption for PHI data
   - Use field-level encryption for sensitive database columns
   - Implement encryption at rest for database files
   - Utilize secure key management for encryption keys
   - Consider implementing database column-level encryption

4. **Authentication Enhancements**:
   - Enable two-factor authentication for administrative users
   - Implement IP-based login restrictions
   - Set up account lockout monitoring and alerts
   - Consider using OIDC/SAML for enterprise identity integration

5. **Monitoring and Detection**:
   - Implement real-time security monitoring
   - Set up alerts for suspicious activities
   - Monitor for unusual login patterns or data access
   - Consider a SIEM solution for log aggregation and analysis

6. **Compliance Documentation**:
   - Document all security controls for HIPAA compliance
   - Maintain an up-to-date system security plan
   - Implement regular security assessment procedures
   - Create data breach response and notification procedures