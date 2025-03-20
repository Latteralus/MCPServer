const MessageModel = require('../../models/messageModel');
const AuditModel = require('../../models/auditModel');

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
    const message = await MessageModel.getById(req.params.id);
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
 * Create a new message
 */
exports.createMessage = async (req, res, next) => {
  try {
    // Attach sender info from authenticated user
    const messageData = {
      ...req.body,
      senderId: req.user.id
    };
    const newMessage = await MessageModel.create(messageData);

    // Log message creation event
    await AuditModel.log({
      userId: req.user.id,
      action: 'message_created',
      details: { messageId: newMessage.id }
    });

    res.status(201).json(newMessage);
  } catch (error) {
    next(error);
  }
};

/**
 * Update an existing message by ID
 */
exports.updateMessage = async (req, res, next) => {
  try {
    const updatedMessage = await MessageModel.update(req.params.id, req.body);
    if (!updatedMessage) {
      const err = new Error('Message not found');
      err.status = 404;
      return next(err);
    }

    // Log message update event
    await AuditModel.log({
      userId: req.user.id,
      action: 'message_updated',
      details: { messageId: req.params.id, changes: req.body }
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
    const deleted = await MessageModel.delete(req.params.id);
    if (!deleted) {
      const err = new Error('Message not found');
      err.status = 404;
      return next(err);
    }

    // Log message deletion event
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
