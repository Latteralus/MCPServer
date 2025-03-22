// server/dashboard/messages.js - Message handling for admin dashboard
const fs = require('fs');
const path = require('path');
const { getAppDirectory } = require('../adminDashboard');
const { logAction } = require('./audit');

// In-memory cache of recent messages (for faster access without disk I/O)
const messageCache = {
  // Map of channel -> array of messages
  channels: new Map(),
  // Map of message ID -> message
  byId: new Map(),
  // Maximum number of messages to keep in memory per channel
  maxMessagesPerChannel: 100
};

/**
 * Get recent messages
 * @param {string} channelId - Channel ID, or 'all' for all channels
 * @param {object} options - Filter options
 * @param {number} options.limit - Maximum number of messages to return
 * @param {number} options.before - Get messages before this timestamp
 * @param {number} options.after - Get messages after this timestamp
 * @param {string} options.sender - Filter by sender
 * @param {boolean} options.includeDeleted - Whether to include deleted messages
 * @returns {object} Array of messages and metadata
 */
function getMessages(channelId, options = {}) {
  try {
    // Default options
    const limit = options.limit || 50;
    const includeDeleted = options.includeDeleted || false;
    
    let messages = [];
    
    // Get messages from cache
    if (channelId === 'all') {
      // Combine messages from all channels
      messageCache.channels.forEach(channelMessages => {
        messages = messages.concat(channelMessages);
      });
    } else {
      // Get messages for specific channel
      const channelMessages = messageCache.channels.get(channelId) || [];
      messages = [...channelMessages];
    }
    
    // Apply filters
    if (options.sender) {
      messages = messages.filter(msg => msg.sender === options.sender);
    }
    
    if (!includeDeleted) {
      messages = messages.filter(msg => !msg.deleted);
    }
    
    if (options.before) {
      const beforeDate = new Date(options.before);
      messages = messages.filter(msg => new Date(msg.timestamp) < beforeDate);
    }
    
    if (options.after) {
      const afterDate = new Date(options.after);
      messages = messages.filter(msg => new Date(msg.timestamp) > afterDate);
    }
    
    // Sort by timestamp (newest first)
    messages.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    // Apply limit
    messages = messages.slice(0, limit);
    
    return {
      messages,
      hasMore: messages.length === limit,
      channelId
    };
  } catch (error) {
    console.error('Error getting messages:', error);
    return { messages: [], hasMore: false, error: error.message };
  }
}

/**
 * Add a message to the cache
 * @param {object} message - Message object
 * @param {string} channelId - Channel ID
 */
function addMessageToCache(message, channelId) {
  if (!message || !message.id || !channelId) return;
  
  // Get channel messages array or create a new one
  let channelMessages = messageCache.channels.get(channelId) || [];
  
  // Add message to channel array
  channelMessages.unshift(message);
  
  // Limit size of channel array
  if (channelMessages.length > messageCache.maxMessagesPerChannel) {
    channelMessages = channelMessages.slice(0, messageCache.maxMessagesPerChannel);
  }
  
  // Update channel array in cache
  messageCache.channels.set(channelId, channelMessages);
  
  // Add to byId map
  messageCache.byId.set(message.id, message);
}

/**
 * Delete a message
 * @param {string} messageId - Message ID to delete
 * @param {string} adminUsername - Username of admin performing the action
 * @param {boolean} permanently - Whether to delete permanently or soft delete
 * @returns {object} Success status and message
 */
function deleteMessage(messageId, adminUsername, permanently = false) {
  try {
    // Find message in cache
    const message = messageCache.byId.get(messageId);
    
    if (!message) {
      return { 
        success: false, 
        message: 'Message not found' 
      };
    }
    
    if (permanently) {
      // Permanently delete from cache
      messageCache.byId.delete(messageId);
      
      // Remove from channels
      messageCache.channels.forEach((channelMessages, channelId) => {
        const index = channelMessages.findIndex(msg => msg.id === messageId);
        if (index !== -1) {
          channelMessages.splice(index, 1);
          messageCache.channels.set(channelId, channelMessages);
        }
      });
      
      // Log permanent deletion
      logAction(adminUsername, 'delete_message_permanent', {
        messageId,
        sender: message.sender,
        timestamp: message.timestamp
      });
      
      return { 
        success: true, 
        message: 'Message permanently deleted' 
      };
    } else {
      // Soft delete - mark as deleted
      message.deleted = true;
      message.deletedBy = adminUsername;
      message.deletedAt = new Date().toISOString();
      
      // Update message in cache
      messageCache.byId.set(messageId, message);
      
      // Update in channels
      messageCache.channels.forEach((channelMessages, channelId) => {
        const index = channelMessages.findIndex(msg => msg.id === messageId);
        if (index !== -1) {
          channelMessages[index] = message;
          messageCache.channels.set(channelId, channelMessages);
        }
      });
      
      // Log soft deletion
      logAction(adminUsername, 'delete_message', {
        messageId,
        sender: message.sender,
        timestamp: message.timestamp
      });
      
      return { 
        success: true, 
        message: 'Message deleted' 
      };
    }
  } catch (error) {
    console.error('Error deleting message:', error);
    return { 
      success: false, 
      message: 'Error deleting message: ' + error.message 
    };
  }
}

/**
 * Get a message by ID
 * @param {string} messageId - Message ID
 * @returns {object|null} Message object or null if not found
 */
function getMessageById(messageId) {
  return messageCache.byId.get(messageId) || null;
}

/**
 * Search messages
 * @param {string} query - Search query
 * @param {object} options - Search options
 * @param {string} options.channelId - Channel ID to search in, or 'all'
 * @param {string} options.sender - Filter by sender
 * @param {string} options.startDate - Start date (ISO string)
 * @param {string} options.endDate - End date (ISO string)
 * @param {number} options.limit - Maximum results to return
 * @returns {object} Search results
 */
function searchMessages(query, options = {}) {
  try {
    // Default options
    const channelId = options.channelId || 'all';
    const limit = options.limit || 50;
    
    // Get messages to search
    let messages = [];
    
    if (channelId === 'all') {
      // Search all channels
      messageCache.channels.forEach(channelMessages => {
        messages = messages.concat(channelMessages);
      });
    } else {
      // Search specific channel
      messages = messageCache.channels.get(channelId) || [];
    }
    
    // Apply date filters
    if (options.startDate) {
      const startDate = new Date(options.startDate);
      messages = messages.filter(msg => new Date(msg.timestamp) >= startDate);
    }
    
    if (options.endDate) {
      const endDate = new Date(options.endDate);
      messages = messages.filter(msg => new Date(msg.timestamp) <= endDate);
    }
    
    // Apply sender filter
    if (options.sender) {
      messages = messages.filter(msg => msg.sender === options.sender);
    }
    
    // Apply search query
    if (query && query.trim() !== '') {
      const queryLower = query.toLowerCase();
      messages = messages.filter(msg => 
        (msg.text && msg.text.toLowerCase().includes(queryLower)) ||
        (msg.sender && msg.sender.toLowerCase().includes(queryLower))
      );
    }
    
    // Sort by timestamp (newest first)
    messages.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    // Apply limit
    const limitedResults = messages.slice(0, limit);
    
    return {
      results: limitedResults,
      total: messages.length,
      hasMore: messages.length > limit,
      query
    };
  } catch (error) {
    console.error('Error searching messages:', error);
    return { results: [], total: 0, error: error.message };
  }
}

/**
 * Flag a message for review
 * @param {string} messageId - Message ID to flag
 * @param {string} reason - Reason for flagging
 * @param {string} adminUsername - Username of admin performing the action
 * @returns {object} Success status and message
 */
function flagMessage(messageId, reason, adminUsername) {
  try {
    // Find message in cache
    const message = messageCache.byId.get(messageId);
    
    if (!message) {
      return { 
        success: false, 
        message: 'Message not found' 
      };
    }
    
    // Add flag to message
    message.flagged = true;
    message.flagReason = reason;
    message.flaggedBy = adminUsername;
    message.flaggedAt = new Date().toISOString();
    
    // Update message in cache
    messageCache.byId.set(messageId, message);
    
    // Update in channels
    messageCache.channels.forEach((channelMessages, channelId) => {
      const index = channelMessages.findIndex(msg => msg.id === messageId);
      if (index !== -1) {
        channelMessages[index] = message;
        messageCache.channels.set(channelId, channelMessages);
      }
    });
    
    // Log flag action
    logAction(adminUsername, 'flag_message', {
      messageId,
      sender: message.sender,
      reason
    });
    
    return { 
      success: true, 
      message: 'Message flagged for review' 
    };
  } catch (error) {
    console.error('Error flagging message:', error);
    return { 
      success: false, 
      message: 'Error flagging message: ' + error.message 
    };
  }
}

/**
 * Get all flagged messages
 * @returns {object[]} Array of flagged messages
 */
function getFlaggedMessages() {
  const flagged = [];
  
  // Collect all flagged messages
  messageCache.byId.forEach(message => {
    if (message.flagged) {
      flagged.push(message);
    }
  });
  
  // Sort by flagged timestamp (newest first)
  flagged.sort((a, b) => new Date(b.flaggedAt) - new Date(a.flaggedAt));
  
  return flagged;
}

/**
 * Get message statistics
 * @returns {object} Message statistics
 */
function getMessageStats() {
  try {
    let totalMessages = 0;
    let deletedMessages = 0;
    let flaggedMessages = 0;
    const channelCounts = {};
    const senderCounts = {};
    
    // Calculate statistics from all cached messages
    messageCache.byId.forEach(message => {
      totalMessages++;
      
      if (message.deleted) {
        deletedMessages++;
      }
      
      if (message.flagged) {
        flaggedMessages++;
      }
      
      // Count by channel
      if (message.channel) {
        channelCounts[message.channel] = (channelCounts[message.channel] || 0) + 1;
      }
      
      // Count by sender
      if (message.sender) {
        senderCounts[message.sender] = (senderCounts[message.sender] || 0) + 1;
      }
    });
    
    return {
      totalMessages,
      deletedMessages,
      flaggedMessages,
      channelCounts,
      senderCounts
    };
  } catch (error) {
    console.error('Error getting message statistics:', error);
    return {
      totalMessages: 0,
      deletedMessages: 0,
      flaggedMessages: 0,
      error: error.message
    };
  }
}

// Export message functions
module.exports = {
  getMessages,
  addMessageToCache,
  deleteMessage,
  getMessageById,
  searchMessages,
  flagMessage,
  getFlaggedMessages,
  getMessageStats
};