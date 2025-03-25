MCP Chat Server Structure: Updated

```
/server/
├── chatServer.js                      # Main WebSocket server with database integration
├── adminDashboard.js                  # Admin dashboard initialization
├── config.js                        # Server configuration file
├── config.json                        # Server configuration file
├── startServer.sh                     # Script to start the server
├── start-server.bat                   # Batch file to start the server
├── fix-imports.js                     # Script to fix imports
├── package.json                       # NPM package definition updated
│
├── admin/                             # Admin Panel
│   ├── dashboard.html                 # Admin dashboard HTML
│   └── login.html                     # Admin login HTML
│   └── assets/                        # Admin assets
│       ├── dashboard-core.js          # Core dashboard javascript
│       └── dashboard-messages.js      # Dashboard messages javascript
│
├── api/                               # API Components
│   ├── routes/                        # API route definitions
│   │   ├── index.js                   # Route registration and middleware
│   │   ├── userRoutes.js              # Pending: User management endpoints
│   │   ├── channelRoutes.js           # Pending: Channel management endpoints
│   │   └── messageRoutes.js           # Pending: Message management endpoints
│   │
│   ├── controllers/                   # API controllers
│   │   ├── authController.js          # Authentication controller
│   │   ├── userController.js          # User controller
│   │   ├── channelController.js         # Channel controller
│   │   └── messageController.js         # Message controller
│   │
│   └── middleware/                    #  API middleware
│       ├── auth.js                    #  Authentication middleware
│       ├── validation.js              #  Request validation
│       ├── rateLimit.js               #  Rate limiting
│       └── errorHandler.js            #  Centralized error handling
│
├── dashboard/                         # Dashboard components
│   ├── admin-config.json              # Admin configuration
│   ├── assets.js                      # Assets javascript
│   ├── audit.js                       # Audit javascript
│   ├── auth.js                        # Auth javascript
│   ├── config.js                      # Config javascript
│   ├── http.css                       # HTTP CSS
│   ├── http.js                        # HTTP javascript
│   ├── messages.js                    # Messages javascript
│   ├── metrics.js                     # Metrics javascript
│   ├── system.js                      # System javascript
│   └── websocket.js                   # Websocket javascript
│
├── database/                          #  Database components
│   ├── index.js                       # Database connection setup
│   ├── schema.sql                     #  Comprehensive database schema
│   ├── seed.js                        # Database seed script
│   └── migrations/                    #  Database migrations
│       ├── 001_initial_schema.js      #  Initial schema migration
│       └── 002_add_message_flags.js   # Placeholder for future migrations
│
├── deployment/                        # Deployment scripts
│   └── deploy.ps1                     # Powershell deployment script
│
├── models/                            #  Database models
│   ├── userModel.js                   #  User operations
│   ├── roleModel.js                   #  Role and permission operations
│   ├── channelModel.js                #  Channel operations
│   ├── messageModel.js                #  Message operations
│   └── auditModel.js                  #  Audit logging
│
├── scripts/                           # Scripts
│   └── init-db.js                     # Initialization script
│
├── services/                          # Business logic services
│   ├── authService.js                 # Authentication logic
│   ├── permissionService.js           # Permission checking
│   ├── channelService.js              # Channel business logic
│   ├── messageService.js              # Message handling
│   ├── notificationService.js         # Real-time notifications
│   ├── encryptionService.js           # Pending: Encryption services
│   ├── resourceAuthorizationService.js # Resource authorization service
│   └── userService.js                 # User service
│
├── utils/                             # Utility modules
│   └── dbTransaction.js               # Database transaction utilities
│
├── websocket/                         #  WebSocket components
│   ├── handlers.js                    #  Message handling functions
│   └── broadcaster.js                 #  Broadcasting logic
│
/logs/                                 # Log storage
/exports/                              # Data export directory
```