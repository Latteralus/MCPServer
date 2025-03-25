// Database Migration Script for MCP Messenger
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class DatabaseMigration {
  constructor(config) {
    this.pool = new Pool(config);
  }

  /**
   * Read SQL schema file
   * @returns {string} SQL schema content
   */
  readSchemaFile() {
    const schemaPath = path.join(__dirname, 'schema.sql');
    return fs.readFileSync(schemaPath, 'utf8');
  }

  /**
   * Execute migration
   * @returns {Promise<void>}
   */
  async migrate() {
    const client = await this.pool.connect();

    try {
      // Start transaction
      await client.query('BEGIN');

      // Read and execute schema
      const schema = this.readSchemaFile();
      await client.query(schema);

      // Seed initial roles
      await this.seedInitialRoles(client);

      // Seed initial permissions
      await this.seedInitialPermissions(client);

      // Map role permissions
      await this.mapRolePermissions(client);

      // Check for admin user initialization
      await this.checkInitialAdmin(client);

      // Commit transaction
      await client.query('COMMIT');

      console.log('Database migration completed successfully.');
    } catch (error) {
      // Rollback transaction on error
      await client.query('ROLLBACK');
      console.error('Database migration failed:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Seed initial roles
   * @param {Object} client - Database client
   */
  async seedInitialRoles(client) {
    const roles = [
      {
        name: 'super_admin',
        description: 'System administrator with full access',
        is_default: false
      },
      {
        name: 'admin',
        description: 'Administrator with extended privileges',
        is_default: false
      },
      {
        name: 'moderator',
        description: 'Channel and user moderator',
        is_default: false
      },
      {
        name: 'user',
        description: 'Standard user role',
        is_default: true
      }
    ];

    for (const role of roles) {
      await client.query(
        `INSERT INTO roles (name, description, is_default) 
         VALUES ($1, $2, $3) 
         ON CONFLICT (name) DO NOTHING`,
        [role.name, role.description, role.is_default]
      );
    }
    
    console.log('Initial roles seeded successfully');
  }

  /**
   * Seed initial permissions
   * @param {Object} client - Database client
   */
  async seedInitialPermissions(client) {
    const permissions = [
      // User permissions
      { name: 'user.create', category: 'user', description: 'Create new user accounts' },
      { name: 'user.read', category: 'user', description: 'View user details' },
      { name: 'user.update', category: 'user', description: 'Update user information' },
      { name: 'user.delete', category: 'user', description: 'Delete user accounts' },

      // Channel permissions
      { name: 'channel.create', category: 'channel', description: 'Create new channels' },
      { name: 'channel.read', category: 'channel', description: 'View channel details' },
      { name: 'channel.update', category: 'channel', description: 'Update channel information' },
      { name: 'channel.delete', category: 'channel', description: 'Delete channels' },
      { name: 'channel.invite', category: 'channel', description: 'Invite users to channels' },

      // Message permissions
      { name: 'message.create', category: 'message', description: 'Send messages' },
      { name: 'message.read', category: 'message', description: 'Read messages' },
      { name: 'message.update', category: 'message', description: 'Update messages' },
      { name: 'message.delete', category: 'message', description: 'Delete messages' },
      { name: 'message.flag', category: 'message', description: 'Flag inappropriate messages' },

      // Admin permissions
      { name: 'admin.logs', category: 'admin', description: 'Access system logs' },
      { name: 'admin.metrics', category: 'admin', description: 'View system metrics' },
      { name: 'admin.users', category: 'admin', description: 'Manage user accounts' },
      { name: 'admin.roles', category: 'admin', description: 'Manage roles and permissions' },
      { name: 'admin.system', category: 'admin', description: 'Manage system settings' }
    ];

    for (const permission of permissions) {
      await client.query(
        `INSERT INTO permissions (name, category, description) 
         VALUES ($1, $2, $3) 
         ON CONFLICT (name) DO NOTHING`,
        [permission.name, permission.category, permission.description]
      );
    }
    
    console.log('Initial permissions seeded successfully');
  }
  
  /**
   * Map permissions to roles
   * @param {Object} client - Database client
   */
  async mapRolePermissions(client) {
    // Get role IDs
    const rolesResult = await client.query('SELECT id, name FROM roles');
    const roles = {};
    rolesResult.rows.forEach(role => {
      roles[role.name] = role.id;
    });
    
    // Get permission IDs
    const permissionsResult = await client.query('SELECT id, name FROM permissions');
    const permissions = {};
    permissionsResult.rows.forEach(permission => {
      permissions[permission.name] = permission.id;
    });
    
    // Define role-permission mappings
    const roleMappings = {
      'super_admin': Object.values(permissions), // All permissions
      'admin': [
        // User permissions
        permissions['user.create'], permissions['user.read'], 
        permissions['user.update'], permissions['user.delete'],
        
        // Channel permissions
        permissions['channel.create'], permissions['channel.read'],
        permissions['channel.update'], permissions['channel.delete'],
        permissions['channel.invite'],
        
        // Message permissions
        permissions['message.create'], permissions['message.read'],
        permissions['message.update'], permissions['message.delete'],
        permissions['message.flag'],
        
        // Some admin permissions
        permissions['admin.logs'], permissions['admin.metrics'],
        permissions['admin.users']
      ],
      'moderator': [
        // User read permissions
        permissions['user.read'],
        
        // Channel permissions
        permissions['channel.read'], permissions['channel.update'],
        
        // Message permissions
        permissions['message.create'], permissions['message.read'],
        permissions['message.update'], permissions['message.delete'],
        permissions['message.flag']
      ],
      'user': [
        // Basic permissions
        permissions['user.read'],
        permissions['channel.read'],
        permissions['message.create'], permissions['message.read'],
        permissions['message.update'] // Can update their own messages
      ]
    };
    
    // Assign permissions to roles
    for (const [roleName, permissionIds] of Object.entries(roleMappings)) {
      const roleId = roles[roleName];
      
      if (!roleId) {
        console.warn(`Role not found: ${roleName}`);
        continue;
      }
      
      for (const permissionId of permissionIds) {
        if (!permissionId) continue;
        
        await client.query(
          `INSERT INTO role_permissions (role_id, permission_id) 
           VALUES ($1, $2) 
           ON CONFLICT (role_id, permission_id) DO NOTHING`,
          [roleId, permissionId]
        );
      }
    }
    
    console.log('Role permissions mapped successfully');
  }

  /**
   * Check for initial admin setup
   * @param {Object} client - Database client
   */
  async checkInitialAdmin(client) {
    // Check if any admin users exist
    const userResult = await client.query(
      `SELECT COUNT(*) as user_count FROM users 
       WHERE role_id IN (SELECT id FROM roles WHERE name IN ('super_admin', 'admin'))`
    );
    
    const adminCount = parseInt(userResult.rows[0].user_count, 10);
    
    if (adminCount === 0) {
      // No admin users exist, check for environment variables
      const initialAdminEmail = process.env.INITIAL_ADMIN_EMAIL;
      
      if (initialAdminEmail) {
        // Get the super_admin role ID
        const roleResult = await client.query(
          'SELECT id FROM roles WHERE name = $1', 
          ['super_admin']
        );
        
        if (roleResult.rows.length === 0) {
          throw new Error('Super admin role not found');
        }
        
        const superAdminRoleId = roleResult.rows[0].id;
        
        // Generate a secure random temporary password
        const tempPassword = crypto.randomBytes(12).toString('base64').replace(/[+/=]/g, '');
        
        // Generate a secure salt
        const salt = crypto.randomBytes(16).toString('hex');
        
        // Hash the password - In production, use Argon2 or bcrypt
        // For this migration script, we use PBKDF2 which is available in Node crypto
        const passwordHash = crypto
          .pbkdf2Sync(tempPassword, salt, 10000, 64, 'sha512')
          .toString('hex');
        
        // Insert admin user
        await client.query(
          `INSERT INTO users (
            username, 
            email, 
            password_hash, 
            salt, 
            role_id, 
            first_name, 
            last_name, 
            status,
            failed_login_attempts,
            two_factor_enabled
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (username) DO NOTHING`,
          [
            'admin', 
            initialAdminEmail, 
            passwordHash, 
            salt,
            superAdminRoleId,
            'System', 
            'Administrator', 
            'active',
            0,
            false
          ]
        );
        
        // Insert an audit log entry for admin creation
        await client.query(
          `INSERT INTO audit_logs (action, details)
           VALUES ($1, $2)`,
          [
            'system.init',
            JSON.stringify({
              message: 'Initial admin account created during system setup',
              email: initialAdminEmail,
              timestamp: new Date()
            })
          ]
        );
        
        console.log('=======================================================');
        console.log('INITIAL ADMIN ACCOUNT CREATED');
        console.log(`Email: ${initialAdminEmail}`);
        console.log(`Temporary Password: ${tempPassword}`);
        console.log('YOU MUST CHANGE THIS PASSWORD ON FIRST LOGIN');
        console.log('=======================================================');
        
        // In production, you would typically send this via email instead
        // await sendAdminCredentialsEmail(initialAdminEmail, tempPassword);
      } else {
        console.log('No admin users exist and INITIAL_ADMIN_EMAIL environment variable is not set.');
        console.log('Please set INITIAL_ADMIN_EMAIL and restart the migration to create an admin account.');
      }
    } else {
      console.log(`Found ${adminCount} existing admin users, skipping initial admin setup.`);
    }
  }

  /**
   * Close database connection
   */
  async close() {
    await this.pool.end();
  }
}

// Export the migration class
module.exports = DatabaseMigration;

// Example usage
if (require.main === module) {
  const config = {
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'mcp_messenger_db',
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT || 5432,
  };
  
  // Check if DB password is provided
  if (!process.env.DB_PASSWORD) {
    console.error('ERROR: Database password is required. Set DB_PASSWORD environment variable.');
    process.exit(1);
  }

  const migration = new DatabaseMigration(config);
  
  migration.migrate()
    .then(() => {
      console.log('Migration successful');
      return migration.close();
    })
    .catch(error => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}