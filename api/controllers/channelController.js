const ChannelModel = require('../../models/channelModel');
const AuditModel = require('../../models/auditModel');
const { withTransaction } = require('../../utils/dbTransaction');
const PermissionService = require('../../services/permissionService'); // Added for permission checks

/**
 * Retrieve all channels
 */
exports.getAllChannels = async (req, res, next) => {
  try {
    // Pass user ID to model to filter channels appropriately
    const userId = req.user.id;
    const channels = await ChannelModel.getAllForUser(userId); // Assuming model method is named getAllForUser
    res.json(channels);
  } catch (error) {
    next(error);
  }
};

/**
 * Retrieve a single channel by ID
 */
exports.getChannelById = async (req, res, next) => {
  try {
    const channel = await ChannelModel.getById(req.params.id);
    if (!channel) {
      const err = new Error('Channel not found');
      err.status = 404;
      return next(err);
    }
    res.json(channel);
  } catch (error) {
    next(error);
  }
};

/**
 * Create a new channel
 */
exports.createChannel = async (req, res, next) => {
  try {
    // Check admin permission
    const hasPermission = await PermissionService.validatePermissions(req.user.id, ['admin.channels']);
    if (!hasPermission) {
      await AuditModel.log({
        userId: req.user.id,
        action: 'unauthorized_channel_creation',
        details: { ipAddress: req.ip }
      });
      return res.status(403).json({ error: 'Insufficient permissions to create channels' });
    }

    const newChannel = await ChannelModel.create(req.body, req.user.id);

    // Log channel creation event
    await AuditModel.log({
      userId: req.user.id,
      action: 'channel_created',
      details: { channelId: newChannel.id }
    });

    res.status(201).json(newChannel);
  } catch (error) {
    next(error);
  }
};

/**
 * Update an existing channel by ID using a transaction.
 */
exports.updateChannel = async (req, res, next) => {
  try {
    const updatedChannel = await withTransaction(async (client) => {
      const channel = await ChannelModel.updateWithClient(client, req.params.id, req.body);
      await AuditModel.logWithClient(client, {
        userId: req.user.id,
        action: 'channel_updated',
        details: { channelId: req.params.id, changes: req.body }
      });
      return channel;
    });
    res.json(updatedChannel);
  } catch (error) {
    next(error);
  }
};

/**
 * Delete a channel by ID
 */
exports.deleteChannel = async (req, res, next) => {
  try {
    const deleted = await ChannelModel.delete(req.params.id);
    if (!deleted) {
      const err = new Error('Channel not found');
      err.status = 404;
      return next(err);
    }
    await AuditModel.log({
      userId: req.user.id,
      action: 'channel_deleted',
      details: { channelId: req.params.id }
    });
    res.json({ message: 'Channel deleted successfully' });
  } catch (error) {
    next(error);
  }
};
