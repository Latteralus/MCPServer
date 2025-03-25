'use strict';

exports.up = async function (knex) {
  // Ensure uuid-ossp is enabled, so uuid_generate_v4() works
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');

  // ---------------------------------------------------------------------------
  // ROLES
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('roles', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.string('name', 50).unique().notNullable();
    table.text('description');
    table.boolean('is_default').defaultTo(false);
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // ---------------------------------------------------------------------------
  // PERMISSIONS
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('permissions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.string('name', 100).unique().notNullable();
    table.text('description');
    table.string('category', 50);
  });

  await knex.schema.createTable('role_permissions', (table) => {
    table
      .uuid('role_id')
      .notNullable()
      .references('id')
      .inTable('roles')
      .onDelete('CASCADE');

    table
      .uuid('permission_id')
      .notNullable()
      .references('id')
      .inTable('permissions')
      .onDelete('CASCADE');

    table.primary(['role_id', 'permission_id']);
  });

  // ---------------------------------------------------------------------------
  // USERS
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('users', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.string('username', 50).unique().notNullable();
    table.string('email', 255).unique();
    table.string('password_hash', 255).notNullable();
    table.string('salt', 255).notNullable();
    table.string('first_name', 100);
    table.string('last_name', 100);

    table
      .uuid('role_id')
      .references('id')
      .inTable('roles')
      .onDelete('SET NULL'); // or CASCADE/RESTRICT, depending on your preference

    table.string('status', 20).defaultTo('active');
    table.timestamp('last_login');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.boolean('two_factor_enabled').defaultTo(false);
    table.string('two_factor_secret', 255);
    table.integer('failed_login_attempts').defaultTo(0);
    table.timestamp('lockout_until');
    table.boolean('force_password_change').defaultTo(false);
    table.timestamp('password_last_changed');
    table.string('password_hash_type', 20).defaultTo('pbkdf2');
  });

  // ---------------------------------------------------------------------------
  // CHANNELS
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('channels', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.string('name', 100).notNullable();
    table.text('description');
    table.boolean('is_private').defaultTo(false);

    table
      .uuid('created_by')
      .references('id')
      .inTable('users')
      .onDelete('SET NULL'); // or CASCADE/RESTRICT

    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('last_activity');
    table.boolean('archived').defaultTo(false);
    table.jsonb('metadata');
  });

  await knex.schema.createTable('channel_members', (table) => {
    table
      .uuid('channel_id')
      .notNullable()
      .references('id')
      .inTable('channels')
      .onDelete('CASCADE');

    table
      .uuid('user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');

    table.string('role', 20).defaultTo('member');
    table.timestamp('joined_at').defaultTo(knex.fn.now());
    table.timestamp('last_read_at');
    table.primary(['channel_id', 'user_id']);
  });

  // ---------------------------------------------------------------------------
  // MESSAGES
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('messages', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table
      .uuid('channel_id')
      .references('id')
      .inTable('channels')
      .onDelete('CASCADE');
    table
      .uuid('sender_id')
      .references('id')
      .inTable('users')
      .onDelete('SET NULL'); // or CASCADE/RESTRICT
    table.text('text').notNullable();
    table.binary('encrypted_text');
    table.timestamp('timestamp').defaultTo(knex.fn.now());
    table.timestamp('edited_at');
    table.boolean('deleted').defaultTo(false);
    table.timestamp('deleted_at');

    table
      .uuid('deleted_by')
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');

    table.boolean('flagged').defaultTo(false);
    table.text('flag_reason');

    table
      .uuid('flagged_by')
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');

    table.timestamp('flagged_at');
    table.jsonb('metadata');
    table.boolean('contains_phi').defaultTo(false);
  });

  await knex.schema.createTable('message_reactions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table
      .uuid('message_id')
      .notNullable()
      .references('id')
      .inTable('messages')
      .onDelete('CASCADE');
    table
      .uuid('user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table.string('reaction', 20).notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // ---------------------------------------------------------------------------
  // AUDIT LOGS
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('audit_logs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table
      .uuid('user_id')
      .references('id')
      .inTable('users')
      .onDelete('SET NULL'); // or CASCADE/RESTRICT
    table.string('action', 100).notNullable();
    table.jsonb('details');
    table.specificType('ip_address', 'inet');
    table.text('user_agent');
    table.timestamp('timestamp').defaultTo(knex.fn.now());
  });

  // ---------------------------------------------------------------------------
  // SESSIONS
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('sessions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table
      .uuid('user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table.string('token_hash', 255).notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('expires_at').notNullable();
    table.specificType('ip_address', 'inet');
    table.text('user_agent');
    table.boolean('is_valid').defaultTo(true);
  });

  // ---------------------------------------------------------------------------
  // PASSWORD RESET REQUESTS
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('password_reset_requests', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table
      .uuid('user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table.string('token_hash', 255).notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('expires_at').notNullable();
    table.boolean('used').defaultTo(false);
    table.timestamp('used_at');
  });
};

exports.down = async function (knex) {
  // Drop tables in reverse order to avoid foreign key conflicts
  await knex.schema.dropTableIfExists('password_reset_requests');
  await knex.schema.dropTableIfExists('sessions');
  await knex.schema.dropTableIfExists('audit_logs');
  await knex.schema.dropTableIfExists('message_reactions');
  await knex.schema.dropTableIfExists('messages');
  await knex.schema.dropTableIfExists('channel_members');
  await knex.schema.dropTableIfExists('channels');
  await knex.schema.dropTableIfExists('users');
  await knex.schema.dropTableIfExists('role_permissions');
  await knex.schema.dropTableIfExists('permissions');
  await knex.schema.dropTableIfExists('roles');

  // Optionally drop uuid‐ossp extension (usually you keep it around)
  // await knex.raw('DROP EXTENSION IF EXISTS "uuid-ossp";');
};
