const MessageModel = require('../../models/messageModel');
const AuditModel = require('../../models/auditModel');
const { withTransaction } = require('../../utils/dbTransaction');

/**
 * Retrieve all messages
 */
exports.getAllMessages = async (req, res, next) => {
  try {
    const messages = await MessageModel.getAll();
    res.json(messages);
  } catch (error) {
    next(error);
  }
};

/**
 * Retrieve a single message by its ID
 */
exports.getMessageById = async (req, res, next) => {
  try {
    const message = await MessageModel.getById(req.params.id, req.user.id);
    if (!message) {
      const err = new Error('Message not found');
      err.status = 404;
      return next(err);
    }
    res.json(message);
  } catch (error) {
    next(error);
  }
};

/**
 * Create a new message using a transaction.
 */
exports.createMessage = async (req, res, next) => {
  try {
    const newMessage = await withTransaction(async (client) => {
      const messageData = { ...req.body, senderId: req.user.id };
      const createdMessage = await MessageModel.createWithClient(client, messageData);
      await AuditModel.logWithClient(client, {
        userId: req.user.id,
        action: 'message_created',
        details: { messageId: createdMessage.id }
      });
      return createdMessage;
    });
    res.status(201).json(newMessage);
  } catch (error) {
    next(error);
  }
};

/**
 * Update an existing message by ID using a transaction.
 */
exports.updateMessage = async (req, res, next) => {
  try {
    const updatedMessage = await withTransaction(async (client) => {
      const message = await MessageModel.updateWithClient(client, req.params.id, req.user.id, req.body);
      await AuditModel.logWithClient(client, {
        userId: req.user.id,
        action: 'message_updated',
        details: { messageId: req.params.id, changes: req.body }
      });
      return message;
    });
    res.json(updatedMessage);
  } catch (error) {
    next(error);
  }
};

/**
 * Delete a message by ID
 */
exports.deleteMessage = async (req, res, next) => {
  try {
    const deleted = await MessageModel.delete(req.params.id, req.user.id);
    if (!deleted) {
      const err = new Error('Message not found');
      err.status = 404;
      return next(err);
    }
    await AuditModel.log({
      userId: req.user.id,
      action: 'message_deleted',
      details: { messageId: req.params.id }
    });
    res.json({ message: 'Message deleted successfully' });
  } catch (error) {
    next(error);
  }
};
