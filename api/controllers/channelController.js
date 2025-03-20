const ChannelModel = require('../../models/channelModel');
const AuditModel = require('../../models/auditModel');

/**
 * Retrieve all channels
 */
exports.getAllChannels = async (req, res, next) => {
  try {
    const channels = await ChannelModel.getAll();
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
    const newChannel = await ChannelModel.create(req.body);

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
 * Update an existing channel by ID
 */
exports.updateChannel = async (req, res, next) => {
  try {
    const updatedChannel = await ChannelModel.update(req.params.id, req.body);
    if (!updatedChannel) {
      const err = new Error('Channel not found');
      err.status = 404;
      return next(err);
    }

    // Log channel update event
    await AuditModel.log({
      userId: req.user.id,
      action: 'channel_updated',
      details: { channelId: req.params.id, changes: req.body }
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

    // Log channel deletion event
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
