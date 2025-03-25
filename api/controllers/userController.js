const UserModel = require('../../models/userModel');
const AuditModel = require('../../models/auditModel');
const { withTransaction } = require('../../utils/dbTransaction');

/**
 * Retrieve all users
 */
exports.getAllUsers = async (req, res, next) => {
  try {
    const users = await UserModel.getAll();
    res.json(users);
  } catch (error) {
    next(error);
  }
};

/**
 * Retrieve a single user by ID
 */
exports.getUserById = async (req, res, next) => {
  try {
    const user = await UserModel.getById(req.params.id);
    if (!user) {
      const err = new Error('User not found');
      err.status = 404;
      return next(err);
    }
    res.json(user);
  } catch (error) {
    next(error);
  }
};

/**
 * Create a new user
 */
exports.createUser = async (req, res, next) => {
  try {
    const newUser = await UserModel.create(req.body);
    await AuditModel.log({
      userId: newUser.id,
      action: 'user_created',
      details: { username: newUser.username }
    });
    res.status(201).json(newUser);
  } catch (error) {
    next(error);
  }
};

/**
 * Update an existing user by ID using a transaction.
 */
exports.updateUser = async (req, res, next) => {
  try {
    const updatedUser = await withTransaction(async (client) => {
      const user = await UserModel.updateWithClient(client, req.params.id, req.body);
      await AuditModel.logWithClient(client, {
        userId: req.params.id,
        action: 'user_updated',
        details: { changes: req.body }
      });
      return user;
    });
    res.json(updatedUser);
  } catch (error) {
    next(error);
  }
};

/**
 * Delete a user by ID
 */
exports.deleteUser = async (req, res, next) => {
  try {
    const deleted = await UserModel.delete(req.params.id);
    if (!deleted) {
      const err = new Error('User not found');
      err.status = 404;
      return next(err);
    }
    await AuditModel.log({
      userId: req.params.id,
      action: 'user_deleted',
      details: {}
    });
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    next(error);
  }
};
