// Database Migration Script for MCP Messenger
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

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

      // Seed admin user
      await this.seedAdminUser(client);

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
      { name: 'admin.metrics', category: 'admin', description: 'View system metrics' }
    ];

    for (const permission of permissions) {
      await client.query(
        `INSERT INTO permissions (name, category, description) 
         VALUES ($1, $2, $3) 
         ON CONFLICT (name) DO NOTHING`,
        [permission.name, permission.category, permission.description]
      );
    }
  }

  /**
   * Seed initial admin user
   * @param {Object} client - Database client
   */
  async seedAdminUser(client) {
    // Generate a secure salt
    const salt = await generateSalt();
    
    // Hash the password
    const hashedPassword = await hashPassword('admin123', salt);

    // Get the super_admin role ID
    const roleResult = await client.query(
      'SELECT id FROM roles WHERE name = $1', 
      ['super_admin']
    );

    if (roleResult.rows.length === 0) {
      throw new Error('Super admin role not found');
    }

    const superAdminRoleId = roleResult.rows[0].id;

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
        status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (username) DO NOTHING`,
      [
        'admin', 
        'admin@company.com', 
        hashedPassword, 
        salt,
        superAdminRoleId,
        'System', 
        'Administrator', 
        'active'
      ]
    );
  }

  /**
   * Close database connection
   */
  async close() {
    await this.pool.end();
  }
}

/**
 * Generate a secure salt
 * @returns {Promise<string>} Salt
 */
async function generateSalt() {
  return await crypto.randomBytes(16).toString('hex');
}

/**
 * Hash a password with salt
 * @param {string} password - Plain text password
 * @param {string} salt - Salt to use in hashing
 * @returns {Promise<string>} Hashed password
 */
async function hashPassword(password, salt) {
  return await crypto
    .pbkdf2Sync(password, salt, 10000, 64, 'sha512')
    .toString('hex');
}

// Export the migration class
module.exports = DatabaseMigration;

// Example usage
if (require.main === module) {
  const config = {
    user: process.env.DB_USER || 'mcp_messenger_admin',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'mcp_messenger_db',
    password: process.env.DB_PASSWORD || 'admin123',
    port: process.env.DB_PORT || 5432,
  };

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