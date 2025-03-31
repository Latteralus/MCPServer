// MCPServer/api/controllers/notificationPreferenceController.js
const NotificationPreferenceModel = require('../../models/notificationPreferenceModel');
const AuditModel = require('../../models/auditModel');
const logger = require('../../config/logger');

/**
 * Get all notification preferences for the authenticated user.
 */
exports.getPreferences = async (req, res, next) => {
  try {
    const userId = req.user.id; // Get user ID from authenticated request
    const preferences = await NotificationPreferenceModel.getByUserId(userId);

    // Optionally log audit event
    // await AuditModel.log({
    //   userId: userId,
    //   action: 'notification_preferences_viewed',
    //   details: { ipAddress: req.ip }
    // });

    res.json(preferences || []);
  } catch (error) {
    logger.error({ err: error, userId: req.user?.id }, 'Error fetching user notification preferences');
    next(error);
  }
};

/**
 * Set/Update one or more notification preferences for the authenticated user.
 * Expects request body like:
 * {
 *   "preferences": [
 *     { "contextType": "global", "contextId": null, "notificationLevel": "mentions" },
 *     { "contextType": "channel", "contextId": "uuid-channel-1", "notificationLevel": "none" },
 *     { "contextType": "dm", "contextId": "uuid-user-2", "notificationLevel": "all" }
 *   ]
 * }
 * OR update a single preference:
 * { "contextType": "channel", "contextId": "uuid-channel-1", "notificationLevel": "all" }
 */
exports.setPreferences = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const updates = req.body; // Can be a single object or an object with a 'preferences' array

    let preferencesToUpdate = [];
    if (Array.isArray(updates.preferences)) {
        preferencesToUpdate = updates.preferences;
    } else if (updates.contextType && updates.notificationLevel) {
        // Handle single preference update
        preferencesToUpdate.push({
            contextType: updates.contextType,
            contextId: updates.contextId !== undefined ? updates.contextId : null, // Ensure null if missing
            notificationLevel: updates.notificationLevel
        });
    } else {
        return res.status(400).json({ error: 'Invalid request body format. Provide a single preference object or a "preferences" array.' });
    }

    if (preferencesToUpdate.length === 0) {
         return res.status(400).json({ error: 'No preferences provided to update.' });
    }

    const results = [];
    const errors = [];

    // Process each preference update
    for (const pref of preferencesToUpdate) {
      try {
        // Validate input format for each preference
        if (!pref.contextType || !pref.notificationLevel) {
            throw new Error(`Invalid preference format: Missing contextType or notificationLevel for contextId ${pref.contextId}`);
        }
        // contextId can be null for global, ensure it's handled correctly
        const contextId = pref.contextId !== undefined ? pref.contextId : null;

        const updatedPref = await NotificationPreferenceModel.setPreference(
          userId,
          pref.contextType,
          contextId,
          pref.notificationLevel
        );
        results.push(updatedPref);
      } catch (error) {
        logger.error({ err: error, userId, preference: pref }, 'Error setting individual notification preference');
        errors.push({ context: pref, error: error.message });
      }
    }

    // Log audit event for the overall action
    await AuditModel.log({
      userId: userId,
      action: 'notification_preferences_updated',
      details: { ipAddress: req.ip, updatedCount: results.length, errorCount: errors.length }
    });

    if (errors.length > 0) {
        // If some updates failed, return a partial success response
        return res.status(207).json({
            message: `Processed ${preferencesToUpdate.length} preferences with ${errors.length} errors.`,
            successes: results,
            failures: errors
        });
    }

    // If all succeeded
    res.json({ message: 'Notification preferences updated successfully', preferences: results });

  } catch (error) {
    // Catch unexpected errors during the overall process
    logger.error({ err: error, userId: req.user?.id, body: req.body }, 'Error updating user notification preferences');
    next(error);
  }
};

/**
 * Delete a specific notification preference for the authenticated user.
 * Requires contextType and contextId (or null for global) as query parameters or body.
 */
exports.deletePreference = async (req, res, next) => {
    try {
        const userId = req.user.id;
        // Get context from query params or body
        const contextType = req.query.contextType || req.body.contextType;
        // Handle contextId carefully, ensuring null is treated correctly
        let contextId = null;
        if (req.query.contextId !== undefined) {
            contextId = req.query.contextId === 'null' ? null : req.query.contextId;
        } else if (req.body.contextId !== undefined) {
            contextId = req.body.contextId === null ? null : req.body.contextId;
        }


        if (!contextType) {
            return res.status(400).json({ error: 'Missing required parameter: contextType' });
        }
         // Basic validation
        const validContextTypes = ['global', 'channel', 'dm'];
        if (!validContextTypes.includes(contextType)) {
            return res.status(400).json({ error: `Invalid context type: ${contextType}` });
        }
        if (contextType === 'global' && contextId !== null) {
             return res.status(400).json({ error: 'contextId must be null for contextType global' });
        }
        if ((contextType === 'channel' || contextType === 'dm') && contextId === null) {
             return res.status(400).json({ error: `contextId cannot be null for contextType ${contextType}` });
        }


        const deleted = await NotificationPreferenceModel.deletePreference(userId, contextType, contextId);

        if (!deleted) {
            return res.status(404).json({ error: 'Notification preference not found for the specified context.' });
        }

        await AuditModel.log({
            userId: userId,
            action: 'notification_preference_deleted',
            details: { ipAddress: req.ip, contextType, contextId }
        });

        res.status(200).json({ message: 'Notification preference deleted successfully.' });

    } catch (error) {
        logger.error({ err: error, userId: req.user?.id, query: req.query, body: req.body }, 'Error deleting notification preference');
        next(error);
    }
};