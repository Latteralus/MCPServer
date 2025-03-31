'use strict';

const argon2 = require('argon2');

exports.seed = async function (knex) {
  // 1. Ensure there’s a "super_admin" role, or create it.
  let [superAdminRole] = await knex('roles')
    .select('id')
    .where({ name: 'super_admin' });

  if (!superAdminRole) {
    [superAdminRole] = await knex('roles')
      .insert({
        name: 'super_admin',
        description: 'Full system access',
        is_default: false,
      })
      .returning('*');
  }

  // 2. Check if the user "Admin" already exists.
  const existingUser = await knex('users')
    .where({ username: 'Admin' })
    .first();

  // 3. If not, create the user with an Argon2-hashed password.
  if (!existingUser) {
    const hashedPassword = await argon2.hash('Admin123'); // Use the requested password

    await knex('users').insert({
      username: 'Admin', // Use the requested username
      email: 'admin@example.com',         // or leave it null/omitted if you prefer
      password_hash: hashedPassword,
      salt: '',                          // Argon2 includes salt internally, so you can store an empty string
      first_name: 'Admin', // Adjusted first name
      last_name: 'User',   // Adjusted last name
      role_id: superAdminRole.id,
      status: 'active',
      created_at: new Date(),
      updated_at: new Date(),
      two_factor_enabled: false,
      password_hash_type: 'argon2',      // So your auth code knows this user’s hashing method
    });
  }
};