# MCP Messenger: Technical Documentation

## Table of Contents
1. [Introduction](#introduction)
2. [Server Architecture](#server-architecture)
3. [Connectivity & Configuration](#connectivity--configuration)
4. [Dependencies & Requirements](#dependencies--requirements)
5. [Deployment & Setup Instructions](#deployment--setup-instructions)
6. [Database Setup](#database-setup)
7. [API Endpoints](#api-endpoints)
8. [WebSocket Protocol](#websocket-protocol)
9. [Admin Dashboard](#admin-dashboard)
10. [Security Considerations](#security-considerations)
11. [Maintenance Guidelines](#maintenance-guidelines)
12. [Troubleshooting](#troubleshooting)
13. [Key Findings & Summary](#key-findings--summary)

## Introduction

MCP Messenger is a HIPAA-compliant chat application designed for secure messaging within healthcare environments. It features real-time communication via WebSockets, channel-based messaging, user authentication, and comprehensive audit logging suitable for regulatory compliance.

Key features include:
- WebSocket-based real-time messaging
- User authentication and permission-based access control
- Channel-based conversations
- Admin dashboard for system monitoring and management
- Comprehensive audit logging for HIPAA compliance
- Message encryption for protected health information (PHI)

## Server Architecture

### Component Overview

The application is built using Node.js with Express for the HTTP server and WebSocket protocol for real-time communication. The architecture consists of the following components:

1. **HTTP/API Server**: Express-based server that handles REST API requests and serves static assets.
2. **WebSocket Server**: Manages real-time communication between clients.
3. **Chat Server**: Core business logic for message handling, channels, and users.
4. **Admin Dashboard**: Web interface for system administration.
5. **PostgreSQL Database**: Stores users, messages, channels, and audit logs.

### File Structure

```
├── app.js                 # Main application entry point
├── chatServer.js          # WebSocket server implementation
├── config.js              # Application configuration
├── config/
│   ├── database.js        # Database connection configuration
├── models/
│   ├── auditModel.js      # Audit logging model
│   ├── channelModel.js    # Channel management model
│   ├── messageModel.js    # Message handling model
│   ├── roleModel.js       # User roles and permissions model
│   └── userModel.js       # User management model
├── services/
│   ├── authService.js     # Authentication and token handling
│   ├── channelService.js  # Channel business logic
│   ├── encryptionService.js # Encryption for PHI data
│   ├── messageService.js  # Message business logic
│   ├── notificationService.js # User notifications
│   └── permissionService.js # Permission checking and enforcement
├── api/
│   ├── routes/            # API route handlers
│   ├── controllers/       # Business logic for API endpoints
│   └── middleware/        # Express middleware
├── websocket/
│   ├── handlers.js        # WebSocket message handlers
│   └── broadcaster.js     # Message broadcasting functionality
└── admin/                 # Admin dashboard files
    ├── dashboard/         # Admin UI components
    └── assets/            # Admin dashboard static assets
```

## Connectivity & Configuration

### Server Ports & Protocols

The MCP Messenger server operates on a single port with both HTTP and WebSocket protocols:

- **Default Port**: 3000 (configurable via environment variable)
- **HTTP Protocol**: Used for API endpoints and static assets
- **WebSocket Protocol**: Used for real-time messaging

### Environment Variables

The server can be configured using the following environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port number | 3000 |
| `LOG_LEVEL` | Logging verbosity | "info" |
| `MAX_CONNECTIONS` | Maximum concurrent WebSocket connections | 100 |
| `AUTHENTICATE_USERS` | Whether to enforce user authentication | false |
| `CONNECTION_TIMEOUT` | WebSocket connection timeout (ms) | 120000 |
| `HEARTBEAT_INTERVAL` | WebSocket ping interval (ms) | 30000 |
| `ALLOWED_NETWORK_RANGE` | Network range allowed to connect | "192.168.0.0/16" |
| `DB_HOST` | PostgreSQL database host | "localhost" |
| `DB_PORT` | PostgreSQL database port | 5432 |
| `DB_NAME` | PostgreSQL database name | "mcp_messenger_db" |
| `DB_USER` | PostgreSQL database user | "mcp_messenger_admin" |
| `DB_PASSWORD` | PostgreSQL database password | "admin123" |
| `DB_MAX_CONNECTIONS` | Maximum database connections | 10 |
| `TOKEN_SECRET` | Secret key for authentication tokens | "your-secret-key-should-be-in-env-variables" |
| `ENCRYPTION_KEY` | Key for encrypting PHI data | [Generated if not provided] |
| `METADATA_KEY` | Key for encrypting metadata | [Generated if not provided] |

### Configuration Files

The server can also be configured using:

1. **config.json**: Contains default server settings
2. **admin-config.json**: Configuration for admin dashboard

## Dependencies & Requirements

### System Requirements

- **Node.js**: v14.x or higher
- **PostgreSQL**: v12.x or higher
- **Operating System**: Any OS that supports Node.js (Linux recommended for production)
- **Memory**: Minimum 1GB RAM (2GB+ recommended for production)
- **Disk Space**: Minimum 1GB for application (plus storage for database)

### NPM Dependencies

Key dependencies include:

- **express**: Web framework for API endpoints
- **ws**: WebSocket library for real-time communication
- **pg**: PostgreSQL client for database operations
- **dotenv**: Environment variable management
- **crypto**: Cryptographic functionality (built into Node.js)
- **express-validator**: Input validation for API endpoints
- **express-rate-limit**: Rate limiting for API endpoints

## Deployment & Setup Instructions

### Prerequisites

1. Ensure Node.js (v14+) is installed
2. Ensure PostgreSQL (v12+) is installed and running
3. Create a PostgreSQL database for the application

### Installation Steps

1. Clone the repository:
   ```bash
   git clone [repository-url]
   cd mcp-messenger
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file in the project root with required configuration:
   ```
   PORT=3000
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=mcp_messenger_db
   DB_USER=mcp_messenger_admin
   DB_PASSWORD=your_secure_password
   AUTHENTICATE_USERS=true
   TOKEN_SECRET=your_random_secure_token_secret
   ```

4. Initialize the database:
   ```bash
   node migrations/001_initial_schema.js
   ```

5. Start the server:
   ```bash
   node app.js
   ```

### Production Deployment Recommendations

For production environments:

1. Use a process manager like PM2:
   ```bash
   npm install -g pm2
   pm2 start app.js --name mcp-messenger
   ```

2. Set up NGINX as a reverse proxy to handle HTTPS termination.

3. Use environment variables for all sensitive information.

4. Enable user authentication by setting `AUTHENTICATE_USERS=true`.

5. Set up proper database credentials with least privilege access.

6. Consider containerization with Docker for easier deployment.

## Database Setup

### Database Schema

The application uses a PostgreSQL database with the following key tables:

- **users**: User accounts and authentication details
- **roles**: User roles for permission management
- **permissions**: Available permissions in the system
- **role_permissions**: Mapping between roles and permissions
- **channels**: Chat channels
- **channel_members**: Users associated with channels
- **messages**: Chat messages
- **audit_logs**: System audit trail for compliance

### Initialization

The database schema can be initialized using the provided migration script:

```bash
node migrations/001_initial_schema.js
```

This script will:
1. Create all required tables
2. Set up indexes for performance
3. Create default roles (admin, user)
4. Create a default admin user

### Default Admin Credentials

After initialization, you can log in with the default admin account:

- **Username**: admin
- **Password**: admin123

**IMPORTANT**: Change these credentials immediately after the first login.

## API Endpoints

The server exposes the following REST API endpoints:

### Authentication Endpoints

- **POST /api/auth/login**: Authenticate user and get token
  - Request body: `{ "username": "string", "password": "string" }`
  - Response: `{ "user": {}, "token": "string" }`

- **POST /api/auth/register**: Register a new user
  - Request body: `{ "username": "string", "email": "string", "password": "string", "firstName": "string", "lastName": "string" }`
  - Response: `{ "message": "User registered successfully", "user": {} }`

- **POST /api/auth/change-password**: Change user password
  - Request body: `{ "currentPassword": "string", "newPassword": "string" }`
  - Response: `{ "message": "Password changed successfully" }`

### User Management Endpoints

- **GET /api/users**: Get all users
- **GET /api/users/:id**: Get user by ID
- **POST /api/users**: Create a new user (admin only)
- **PUT /api/users/:id**: Update user
- **DELETE /api/users/:id**: Delete user

### Channel Management Endpoints

- **GET /api/channels**: Get all channels
- **GET /api/channels/:id**: Get channel by ID
- **POST /api/channels**: Create a new channel
- **PUT /api/channels/:id**: Update channel
- **DELETE /api/channels/:id**: Delete channel

### Message Endpoints

- **GET /api/messages**: Get messages (filterable)
- **GET /api/messages/:id**: Get message by ID
- **POST /api/messages**: Create a new message
- **PUT /api/messages/:id**: Update message
- **DELETE /api/messages/:id**: Delete message

### Admin Endpoints

- **GET /admin/api/metrics**: Get system metrics
- **GET /admin/api/logs**: Get system logs
- **GET /admin/api/users**: Get user management data
- **GET /admin/api/channels**: Get channel management data
- **GET /admin/api/messages**: Get message monitoring data

## WebSocket Protocol

### Connection Establishment

Clients connect to the WebSocket server at:
```
ws://server-address:port
```

For secure deployments:
```
wss://server-address:port
```

### Authentication

1. Connect to the WebSocket server
2. Send an authentication message:
   ```json
   {
     "type": "authenticate",
     "token": "your-auth-token"
   }
   ```
3. Server responds with authentication result:
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

### Message Format

All WebSocket messages follow this general format:
```json
{
  "type": "message-type",
  "payload": {
    // Message-specific data
  }
}
```

### Supported Message Types

The server supports the following WebSocket message types:

| Type | Direction | Description |
|------|-----------|-------------|
| `authenticate` | Client → Server | Authenticate with token |
| `chat_message` | Client → Server | Send a message to a channel |
| `channel_join` | Client → Server | Join a channel |
| `channel_leave` | Client → Server | Leave a channel |
| `edit_message` | Client → Server | Edit a previously sent message |
| `delete_message` | Client → Server | Delete a message |
| `typing_indicator` | Client → Server | Indicate user is typing |
| `read_receipt` | Client → Server | Acknowledge message read |
| `ping` | Client → Server | Connection healthcheck |
| `channel_list_request` | Client → Server | Request list of channels |
| `new_message` | Server → Client | New message notification |
| `message_updated` | Server → Client | Message update notification |
| `message_deleted` | Server → Client | Message deletion notification |
| `member_joined` | Server → Client | User joined channel notification |
| `member_left` | Server → Client | User left channel notification |
| `typing_indicator` | Server → Client | User typing notification |
| `read_receipt` | Server → Client | Message read notification |
| `system_message` | Server → Client | System notification |
| `error` | Server → Client | Error message |

### Sample Client Implementation

```javascript
// Connect to WebSocket server
const ws = new WebSocket('ws://server-address:port');

// Handle connection open
ws.onopen = () => {
  // Authenticate user
  ws.send(JSON.stringify({
    type: 'authenticate',
    token: 'your-auth-token'
  }));
};

// Handle incoming messages
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  
  switch (message.type) {
    case 'authentication_response':
      // Handle authentication result
      break;
    case 'new_message':
      // Handle new message
      break;
    // Handle other message types
  }
};

// Send a message to a channel
function sendMessage(channelId, text) {
  ws.send(JSON.stringify({
    type: 'chat_message',
    payload: {
      channelId: channelId,
      text: text
    }
  }));
}

// Join a channel
function joinChannel(channelId) {
  ws.send(JSON.stringify({
    type: 'channel_join',
    channelId: channelId
  }));
}
```

## Admin Dashboard

### Access and Authentication

The admin dashboard is accessible at:
```
http://server-address:port/admin
```

Default admin credentials:
- **Username**: admin
- **Password**: admin123

**IMPORTANT**: Change these credentials immediately after the first login.

### Dashboard Features

The admin dashboard provides:

1. **System Overview**: Server stats, active connections, message counts
2. **User Management**: Create, edit, and delete users
3. **Channel Management**: Create, edit, and delete channels
4. **Message Monitoring**: View, flag, and moderate messages
5. **System Logs**: Audit trail for compliance and troubleshooting
6. **Settings**: Configure server behavior and security settings

### Configuration

Admin dashboard settings are stored in `admin-config.json`, which includes:

- Authentication settings
- UI preferences
- Audit log retention
- Security settings
- Feature toggles

## Security Considerations

### Authentication & Authorization

1. Use the built-in authentication system by setting `AUTHENTICATE_USERS=true`
2. Change default admin credentials immediately after setup
3. Configure proper permission roles for different user types
4. Enable HTTPS in production environments

### Data Protection

1. Configure encryption keys for PHI data:
   - Set `ENCRYPTION_KEY` and `METADATA_KEY` environment variables
   - Alternatively, store encryption keys in secure key files

2. The server encrypts PHI-flagged messages with AES-256-GCM

3. Sensitive information should be explicitly marked with `containsPHI: true` when sending messages

### Network Security

1. Configure `ALLOWED_NETWORK_RANGE` appropriately for your environment
2. Use a reverse proxy like NGINX with HTTPS for production
3. Enable WebSocket secure (WSS) protocol in production
4. Consider network-level security (firewalls, VPNs) for added protection

### Security Improvements Recommended

1. **Password Policy Enforcement**: Enhance the password requirements beyond the current basic checks
2. **Token Refresh Mechanism**: Implement token expiration and refresh flow
3. **Rate Limiting**: Enable rate limiting on authentication endpoints
4. **IP Restriction**: Restrict admin dashboard access to specific IP ranges
5. **Two-Factor Authentication**: Add 2FA support, especially for admin users
6. **Regular Security Audits**: Implement scheduled security audits and penetration testing

## Maintenance Guidelines

### Routine Maintenance

1. **Database Backups**: Configure regular PostgreSQL backups
2. **Log Rotation**: Implement log rotation to prevent disk space issues
3. **Audit Log Retention**: Configure audit log retention policy based on compliance requirements
4. **Dependency Updates**: Regularly update NPM dependencies to address security vulnerabilities

### Monitoring

1. **Server Health**: Monitor server resource usage (CPU, memory, disk)
2. **Connection Count**: Track WebSocket connection count for capacity planning
3. **Message Volume**: Monitor message volume for performance tuning
4. **Error Rates**: Track error rates in logs for issue identification
5. **Database Performance**: Monitor database query performance

### Code Maintenance

When maintaining or extending the codebase, follow these guidelines:

1. **Architecture**: Maintain the separation of concerns between models, services, and controllers
2. **Error Handling**: Use the centralized error handling middleware
3. **Validation**: Add input validation for all new endpoints
4. **Logging**: Include audit logging for all security-relevant operations
5. **Testing**: Write tests for new functionality

## Troubleshooting

### Common Issues

#### Connection Issues

**Problem**: Clients cannot connect to WebSocket server
**Possible causes and solutions**:
- Verify server is running (`ps aux | grep node`)
- Check port availability (`netstat -tuln | grep 3000`)
- Verify firewall settings (`sudo iptables -L`)
- Check client connection URL format
- Verify authentication token if authentication is enabled

#### Authentication Problems

**Problem**: Authentication fails with valid credentials
**Possible causes and solutions**:
- Check database connection in logs
- Verify user exists in database
- Check password hashing implementation
- Verify TOKEN_SECRET environment variable is set
- Check token format and expiration

#### Database Connectivity

**Problem**: Server cannot connect to database
**Possible causes and solutions**:
- Verify PostgreSQL is running (`pg_isready`)
- Check database credentials in .env file
- Ensure database exists (`psql -l`)
- Check network connectivity to database host
- Verify database user permissions

#### Message Delivery Issues

**Problem**: Messages not received by clients
**Possible causes and solutions**:
- Check WebSocket connection status
- Verify channel membership
- Check permission settings
- Look for errors in server logs
- Verify message format sent by client

### Log Locations

- **Server Logs**: Standard output/error (captured by process manager or container logs)
- **Audit Logs**: Database `audit_logs` table and `logs/admin/*.log` files
- **Admin Dashboard Logs**: `logs/admin/admin_YYYY-MM-DD.log`

### Diagnostic Commands

1. Check server status:
   ```bash
   pm2 status mcp-messenger
   ```

2. View server logs:
   ```bash
   pm2 logs mcp-messenger
   ```

3. Check database connectivity:
   ```bash
   psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "SELECT 'Connected successfully';"
   ```

4. Test WebSocket connectivity:
   ```bash
   npm install -g wscat
   wscat -c ws://localhost:3000
   ```

5. Verify database tables:
   ```bash
   psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "\dt"
   ```

## Key Findings & Summary

- **Server Type**: Node.js WebSocket server with Express for HTTP/API endpoints
- **Key Features**: HIPAA-compliant messaging, channel-based chat, real-time updates, admin dashboard
- **Default Port**: 3000 (HTTP and WebSocket)
- **Authentication**: Token-based authentication with configurable enforcement
- **Database**: PostgreSQL for data storage
- **Message Encryption**: AES-256-GCM encryption for PHI data
- **Admin Interface**: Web-based admin dashboard at `/admin`
- **Default Admin Credentials**: Username: `admin`, Password: `admin123` (change immediately)
- **Scalability**: Designed for moderate scale with configurable connection limits
- **Compliance**: Built with HIPAA compliance in mind, including comprehensive audit logging
- **Security Considerations**: Several recommended security improvements identified
- **Deployment Options**: Supports standard Node.js deployment or containerization

### Key Technical Specifications

- **Node.js Version**: v14.x or higher
- **PostgreSQL Version**: v12.x or higher
- **Main NPM Dependencies**: express, ws, pg, dotenv, crypto
- **Recommended Memory**: 2GB RAM for production
- **Configuration Method**: Environment variables and JSON config files
- **Authentication Method**: JWT-like token system
- **Key Environment Variables**: `PORT`, `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `AUTHENTICATE_USERS`, `TOKEN_SECRET`
- **Key Files**: `app.js` (entry point), `chatServer.js` (WebSocket handler), `config.js` (configuration)