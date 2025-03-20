# HIPAA-Compliant Chat Server Structure

This document outlines the comprehensive structure of the HIPAA-compliant chat server and client application after migrating from localStorage to a server-managed database approach.

## Server Directory Structure

```
/server/
├── chatServer.js                      # Main WebSocket server entry point (updated for database integration)
├── adminDashboard.js                  # Admin dashboard initialization (updated to use database models)
├── config.json                        # Server configuration file (expanded with database settings)
├── start-server.bat                   # Windows startup script
├── startServer.sh                     # Unix/Linux startup script
├── package.json                       # NPM package definition (updated with database dependencies)
│
├── api/                               # REST API components
│   ├── routes/                        # API route definitions
│   │   ├── index.js                   # Route registration and middleware application
│   │   ├── authRoutes.js              # Authentication endpoints (login, logout, etc.)
│   │   ├── userRoutes.js              # User management endpoints
│   │   ├── channelRoutes.js           # Channel management endpoints
│   │   └── messageRoutes.js           # Message management endpoints
│   │
│   ├── controllers/                   # API controllers
│   │   ├── authController.js          # Authentication logic (login, token verification)
│   │   ├── userController.js          # User management logic (CRUD operations)
│   │   ├── channelController.js       # Channel management logic (CRUD operations)
│   │   └── messageController.js       # Message handling logic (send, retrieve, search)
│   │
│   └── middleware/                    # API middleware
│       ├── auth.js                    # Authentication and authorization middleware
│       ├── validation.js              # Request validation middleware
│       ├── rateLimit.js               # Rate limiting for API endpoints
│       └── errorHandler.js            # Centralized error handling
│
├── database/                          # Database components
│   ├── index.js                       # Database connection setup and pooling
│   ├── queryBuilder.js                # SQL query builder and helper methods
│   ├── schema.sql                     # Database schema definition
│   ├── config.js                      # Database-specific configuration
│   │
│   └── migrations/                    # Database migrations
│       ├── 001_initial_schema.js      # Initial schema creation
│       └── 002_add_message_flags.js   # Example future migration
│
├── models/                            # Database models
│   ├── userModel.js                   # User operations (storage, auth, roles)
│   ├── roleModel.js                   # Role and permission operations
│   ├── channelModel.js                # Channel operations (CRUD, membership)
│   ├── messageModel.js                # Message operations (CRUD, search, flags)
│   └── auditModel.js                  # Audit logging operations (HIPAA compliance)
│
├── services/                          # Business logic services
│   ├── authService.js                 # Authentication logic (JWT, sessions)
│   ├── permissionService.js           # Permission checking and role-based access
│   ├── channelService.js              # Channel business logic
│   ├── messageService.js              # Message handling with HIPAA compliance checks
│   ├── notificationService.js         # Real-time notification delivery
│   └── encryptionService.js           # Message encryption/decryption logic
│
├── websocket/                         # WebSocket components
│   ├── handlers.js                    # Message handling functions
│   ├── broadcaster.js                 # Broadcasting logic for channels
│   ├── authenticate.js                # WebSocket authentication
│   └── connections.js                 # Connection tracking and management
│
├── dashboard/                         # Admin dashboard modules (updated)
│   ├── assets.js                      # Static asset handling
│   ├── auth.js                        # Authentication using database (updated)
│   ├── audit.js                       # Audit logging with database (updated)
│   ├── config.js                      # Configuration management
│   ├── http.js                        # HTTP route handling (updated for new API)
│   ├── metrics.js                     # Server metrics collection (updated)
│   ├── messages.js                    # Message management (updated for database)
│   ├── websocket.js                   # WebSocket handling for admin
│   └── admin-config.json              # Admin dashboard specific configuration
│
├── admin/                             # Admin dashboard static files
│   ├── login.html                     # Login page
│   ├── dashboard.html                 # Dashboard page
│   └── assets/                        # Dashboard assets
│       ├── dashboard-core.js          # Core dashboard functionality
│       ├── dashboard-users-channels.js  # User and channel management
│       ├── dashboard-messages.js      # Message and log monitoring
│       ├── login.css                  # Login page styles
│       ├── dashboard.css              # Dashboard page styles
│       └── favicon.png                # Dashboard favicon
│
├── utils/                             # Server utilities
│   ├── logger.js                      # Enhanced logging with database integration
│   ├── encryption.js                  # Enhanced encryption with key management
│   ├── validation.js                  # Input validation with HIPAA compliance
│   └── phi-detection.js               # Protected Health Information detection
│
├── config/                            # Configuration modules
│   ├── database.js                    # Database configuration by environment
│   ├── security.js                    # Security and encryption settings
│   ├── websocket.js                   # WebSocket configuration
│   └── hipaa.js                       # HIPAA compliance settings
│
├── scripts/                           # Utility scripts
│   ├── setupDb.js                     # Database initialization
│   ├── generateTestData.js            # Test data generation
│   ├── dataExport.js                  # Data export tools for compliance
│   └── dataImport.js                  # Data import tooling
│
└── logs/                              # Log directory
    ├── chat_server_YYYY-MM-DD.log     # Server logs
    ├── api_YYYY-MM-DD.log             # API access logs
    └── admin/                         # Admin action logs
        └── admin_YYYY-MM-DD.log       # Admin action audit logs
```

## Key Components and Their Responsibilities

### Server Core

- **chatServer.js**: Main WebSocket server that now integrates with database models for message persistence and user authentication.

- **adminDashboard.js**: Initializes the admin dashboard, now using database models for data access.

### Database Layer

- **database/index.js**: Sets up database connections, pooling, and provides transaction support. Critical for performance.

- **database/schema.sql**: Defines the complete database schema including tables for users, channels, messages, and HIPAA compliance logging.

- **models/*.js**: Provide data access abstraction for the application, encapsulating all SQL queries and database interactions.

### Authentication System

- **services/authService.js**: Handles JWT token generation, validation, and session management, replacing client-side auth.

- **api/middleware/auth.js**: Middleware that validates authentication for all API requests. Critical security component.

### Message Handling

- **models/messageModel.js**: Database operations for messages with full CRUD operations and search capabilities.

- **services/messageService.js**: Business logic for message handling, including HIPAA compliance checks and encryption.

- **websocket/handlers.js**: Processes incoming WebSocket messages and coordinates with services and models for persistence.

### API Layer

- **api/routes/*.js**: Define RESTful endpoints for client-server communication, replacing localStorage operations.

- **api/controllers/*.js**: Implement business logic for API endpoints, coordinating between client requests and services.

### Client Integration

- **chat/services/api.js**: Centralized client-side API service that handles all server communication with error handling and retries.

- **chat/utils/storage.js**: Converted to a caching layer using IndexedDB for performance and offline support.

- **chat/utils/offlineQueue.js**: Manages messages during offline periods and handles synchronization when connection is restored.

### Security & Compliance

- **utils/phi-detection.js**: Analyzes message content for potential Protected Health Information, critical for HIPAA compliance.

- **services/encryptionService.js**: Provides encryption services for messages both in transit and at rest.

- **models/auditModel.js**: Provides comprehensive audit logging for all actions, supporting HIPAA compliance requirements.

## Database Schema Overview

The database will use a relational structure with the following key tables:

1. **users**: Stores user accounts with authentication data
2. **roles**: Defines available roles in the system
3. **permissions**: Specific permissions that can be assigned to roles
4. **channels**: Chat channels and their metadata
5. **channel_members**: Maps users to channels they have access to
6. **messages**: Stores all chat messages with metadata
7. **message_flags**: Tracks flagged messages for moderation
8. **audit_logs**: Comprehensive audit trail for HIPAA compliance

## Security Features

- **Server-side Authentication**: JWT-based authentication replaces client storage of credentials
- **End-to-End Encryption**: Messages encrypted before storage
- **PHI Detection**: Automatic scanning of messages for protected health information
- **Comprehensive Audit Logging**: All actions tracked for compliance
- **Role-Based Access Control**: Granular permissions system
- **Secure Password Storage**: Argon2 password hashing (upgraded from SHA-256)
- **Session Management**: Automatic session expiration and validation
- **Rate Limiting**: Protection against brute-force attacks
- **Data Retention Policies**: Automatic enforcement of data retention for compliance

## Data Flow

1. Client authenticates via API and receives JWT token
2. Client establishes WebSocket connection with authentication token
3. Messages sent via WebSocket are validated, processed, and stored in the database
4. Clients receive real-time updates via WebSocket
5. Historical data is retrieved via REST API with pagination
6. All operations are logged to the audit trail

## Migration Path

The migration from localStorage to server-managed storage will be performed in phases:

1. Database and server-side components implementation
2. API endpoints implementation
3. Client-side services updated to use API
4. Data migration from localStorage to server
5. Gradual rollout to users

This architecture provides a robust, scalable, and HIPAA-compliant foundation while maintaining the existing UI components and user experience.