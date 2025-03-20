// dashboard-messages.js - Message and log handling functionality

/**
 * Initialize messages page
 */
function initMessagesPage() {
    // Set up filter form
    const filterForm = document.getElementById('messageFilterForm');
    if (filterForm) {
      filterForm.addEventListener('submit', function(e) {
        e.preventDefault();
        refreshMessageLog();
      });
    }
    
    // Initialize date pickers if available
    initDatePickers();
    
    // Refresh message log
    refreshMessageLog();
  }
  
  /**
   * Initialize logs page
   */
  function initLogsPage() {
    // Set up filter form
    const filterForm = document.getElementById('logFilterForm');
    if (filterForm) {
      filterForm.addEventListener('submit', function(e) {
        e.preventDefault();
        refreshLogs();
      });
    }
    
    // Initialize date pickers if available
    initDatePickers();
    
    // Refresh logs
    refreshLogs();
  }
  
  /**
   * Initialize date pickers if jQuery UI is available
   */
  function initDatePickers() {
    if (typeof $ !== 'undefined' && $.fn.datepicker) {
      $('.datepicker').datepicker({
        dateFormat: 'yy-mm-dd',
        maxDate: new Date()
      });
    }
  }
  
  /**
   * Refresh message log
   */
  function refreshMessageLog() {
    const messageTableBody = document.getElementById('messageTableBody');
    if (!messageTableBody) return;
    
    // Get filter values if form exists
    let queryParams = '';
    const filterForm = document.getElementById('messageFilterForm');
    if (filterForm) {
      const formData = new FormData(filterForm);
      const params = new URLSearchParams();
      
      formData.forEach((value, key) => {
        if (value) {
          params.append(key, value);
        }
      });
      
      queryParams = params.toString();
    }
    
    // Fetch messages with filters
    fetch(`/admin/api/messages${queryParams ? '?' + queryParams : ''}`)
      .then(response => response.json())
      .then(data => {
        if (data.messages && data.messages.length > 0) {
          // Update message table
          const tableHtml = data.messages.map(message => {
            // Message status
            let statusBadge = '';
            if (message.flagged) {
              statusBadge = `<span class="badge badge-warning">Flagged</span>`;
            }
            if (message.deleted) {
              statusBadge = `<span class="badge badge-danger">Deleted</span>`;
            }
            
            return `
              <tr ${message.flagged ? 'class="flagged-row"' : ''}>
                <td>${window.dashboard.formatTimeAgo(message.timestamp)}</td>
                <td>${window.dashboard.escapeHtml(message.channel)}</td>
                <td>${window.dashboard.escapeHtml(message.sender)}</td>
                <td class="message-content">${window.dashboard.escapeHtml(message.text)}</td>
                <td>${statusBadge}</td>
                <td class="actions">
                  <button class="btn-sm view-message-btn" data-messageid="${message.id}">View</button>
                  ${!message.deleted ? `<button class="btn-sm btn-danger delete-message-btn" data-messageid="${message.id}">Delete</button>` : ''}
                  ${!message.flagged ? `<button class="btn-sm flag-message-btn" data-messageid="${message.id}">Flag</button>` : ''}
                </td>
              </tr>
            `;
          }).join('');
          
          messageTableBody.innerHTML = tableHtml;
          
          // Add event listeners for message actions
          addMessageActionHandlers();
        } else {
          // No messages
          messageTableBody.innerHTML = `
            <tr>
              <td colspan="6" class="empty-state">No messages match the selected filters</td>
            </tr>
          `;
        }
      })
      .catch(error => {
        console.error('Error fetching messages:', error);
        messageTableBody.innerHTML = `
          <tr>
            <td colspan="6" class="empty-state">Failed to load message data</td>
          </tr>
        `;
      });
  }
  
  /**
   * Refresh system logs
   */
  function refreshLogs() {
    const logTableBody = document.getElementById('logTableBody');
    if (!logTableBody) return;
    
    // Get filter values if form exists
    let queryParams = '';
    const filterForm = document.getElementById('logFilterForm');
    if (filterForm) {
      const formData = new FormData(filterForm);
      const params = new URLSearchParams();
      
      formData.forEach((value, key) => {
        if (value) {
          params.append(key, value);
        }
      });
      
      queryParams = params.toString();
    }
    
    // Fetch logs with filters
    fetch(`/admin/api/logs${queryParams ? '?' + queryParams : ''}`)
      .then(response => response.json())
      .then(data => {
        if (data.logs && data.logs.length > 0) {
          // Update log table
          const tableHtml = data.logs.map(log => {
            // Log level
            let levelClass = 'level-info';
            if (log.level === 'warn' || log.level === 'warning') {
              levelClass = 'level-warning';
            } else if (log.level === 'error') {
              levelClass = 'level-error';
            }
            
            return `
              <tr class="${levelClass}">
                <td>${new Date(log.timestamp).toLocaleString()}</td>
                <td>${window.dashboard.escapeHtml(log.level).toUpperCase()}</td>
                <td>${window.dashboard.escapeHtml(log.username || 'System')}</td>
                <td>${window.dashboard.escapeHtml(log.action)}</td>
                <td class="actions">
                  <button class="btn-sm view-log-btn" data-logid="${log.id}">Details</button>
                </td>
              </tr>
            `;
          }).join('');
          
          logTableBody.innerHTML = tableHtml;
          
          // Add event listeners for log actions
          addLogActionHandlers();
        } else {
          // No logs
          logTableBody.innerHTML = `
            <tr>
              <td colspan="5" class="empty-state">No logs match the selected filters</td>
            </tr>
          `;
        }
      })
      .catch(error => {
        console.error('Error fetching logs:', error);
        logTableBody.innerHTML = `
          <tr>
            <td colspan="5" class="empty-state">Failed to load log data</td>
          </tr>
        `;
      });
  }
  
  /**
   * Add event handlers for message actions
   */
  function addMessageActionHandlers() {
    // View message buttons
    document.querySelectorAll('.view-message-btn').forEach(button => {
      button.addEventListener('click', function() {
        const messageId = this.getAttribute('data-messageid');
        showViewMessageModal(messageId);
      });
    });
    
    // Delete message buttons
    document.querySelectorAll('.delete-message-btn').forEach(button => {
      button.addEventListener('click', function() {
        const messageId = this.getAttribute('data-messageid');
        showDeleteMessageModal(messageId);
      });
    });
    
    // Flag message buttons
    document.querySelectorAll('.flag-message-btn').forEach(button => {
      button.addEventListener('click', function() {
        const messageId = this.getAttribute('data-messageid');
        showFlagMessageModal(messageId);
      });
    });
  }
  
  /**
   * Add event handlers for log actions
   */
  function addLogActionHandlers() {
    // View log buttons
    document.querySelectorAll('.view-log-btn').forEach(button => {
      button.addEventListener('click', function() {
        const logId = this.getAttribute('data-logid');
        showViewLogModal(logId);
      });
    });
  }
  
  /**
   * Show modal for viewing a message
   * @param {string} messageId - Message ID to view
   */
  function showViewMessageModal(messageId) {
    // Fetch message data
    fetch(`/admin/api/messages/${messageId}`)
      .then(response => response.json())
      .then(message => {
        document.getElementById('modalTitle').textContent = `Message Details`;
        
        document.getElementById('modalBody').innerHTML = `
          <div class="message-details">
            <div class="detail-row">
              <div class="detail-label">Sender:</div>
              <div class="detail-value">${window.dashboard.escapeHtml(message.sender)}</div>
            </div>
            <div class="detail-row">
              <div class="detail-label">Channel:</div>
              <div class="detail-value">${window.dashboard.escapeHtml(message.channel)}</div>
            </div>
            <div class="detail-row">
              <div class="detail-label">Sent:</div>
              <div class="detail-value">${new Date(message.timestamp).toLocaleString()}</div>
            </div>
            ${message.edited ? `
              <div class="detail-row">
                <div class="detail-label">Edited:</div>
                <div class="detail-value">${new Date(message.editedAt).toLocaleString()}</div>
              </div>
            ` : ''}
            ${message.deleted ? `
              <div class="detail-row">
                <div class="detail-label">Deleted by:</div>
                <div class="detail-value">${window.dashboard.escapeHtml(message.deletedBy)} (${new Date(message.deletedAt).toLocaleString()})</div>
              </div>
            ` : ''}
            ${message.flagged ? `
              <div class="detail-row">
                <div class="detail-label">Flagged by:</div>
                <div class="detail-value">${window.dashboard.escapeHtml(message.flaggedBy)} (${new Date(message.flaggedAt).toLocaleString()})</div>
              </div>
              <div class="detail-row">
                <div class="detail-label">Flag reason:</div>
                <div class="detail-value">${window.dashboard.escapeHtml(message.flagReason || 'No reason provided')}</div>
              </div>
            ` : ''}
            <div class="detail-row">
              <div class="detail-label">Message:</div>
              <div class="detail-value message-content">${window.dashboard.escapeHtml(message.text)}</div>
            </div>
          </div>
        `;
        
        document.getElementById('modalFooter').innerHTML = `
          <button type="button" class="btn-secondary" onclick="window.dashboard.closeModal()">Close</button>
          ${!message.deleted ? `<button type="button" class="btn-danger" id="deleteMessageBtn">Delete</button>` : ''}
        `;
        
        // Add delete handler if button exists
        const deleteBtn = document.getElementById('deleteMessageBtn');
        if (deleteBtn) {
          deleteBtn.addEventListener('click', function() {
            window.dashboard.closeModal();
            showDeleteMessageModal(messageId);
          });
        }
        
        // Show the modal
        window.dashboard.openModal();
      })
      .catch(error => {
        console.error('Error fetching message data:', error);
        alert('Failed to load message data. Please try again.');
      });
  }
  
  /**
   * Show modal for viewing a log entry
   * @param {string} logId - Log ID to view
   */
  function showViewLogModal(logId) {
    // Fetch log data
    fetch(`/admin/api/logs/${logId}`)
      .then(response => response.json())
      .then(log => {
        document.getElementById('modalTitle').textContent = `Log Details`;
        
        document.getElementById('modalBody').innerHTML = `
          <div class="log-details">
            <div class="detail-row">
              <div class="detail-label">Timestamp:</div>
              <div class="detail-value">${new Date(log.timestamp).toLocaleString()}</div>
            </div>
            <div class="detail-row">
              <div class="detail-label">Level:</div>
              <div class="detail-value ${log.level === 'error' ? 'text-danger' : log.level === 'warn' ? 'text-warning' : 'text-info'}">${log.level.toUpperCase()}</div>
            </div>
            <div class="detail-row">
              <div class="detail-label">User:</div>
              <div class="detail-value">${window.dashboard.escapeHtml(log.username || 'System')}</div>
            </div>
            <div class="detail-row">
              <div class="detail-label">Action:</div>
              <div class="detail-value">${window.dashboard.escapeHtml(log.action)}</div>
            </div>
            <div class="detail-row">
              <div class="detail-label">IP Address:</div>
              <div class="detail-value">${window.dashboard.escapeHtml(log.details?.ip || 'Unknown')}</div>
            </div>
            <div class="detail-row">
              <div class="detail-label">Details:</div>
              <div class="detail-value">
                <pre>${window.dashboard.escapeHtml(JSON.stringify(log.details || {}, null, 2))}</pre>
              </div>
            </div>
          </div>
        `;
        
        document.getElementById('modalFooter').innerHTML = `
          <button type="button" class="btn-secondary" onclick="window.dashboard.closeModal()">Close</button>
        `;
        
        // Show the modal
        window.dashboard.openModal();
      })
      .catch(error => {
        console.error('Error fetching log data:', error);
        alert('Failed to load log data. Please try again.');
      });
  }
  
  /**
   * Show modal for deleting a message
   * @param {string} messageId - Message ID to delete
   */
  function showDeleteMessageModal(messageId) {
    // Fetch message data to display info
    fetch(`/admin/api/messages/${messageId}`)
      .then(response => response.json())
      .then(message => {
        document.getElementById('modalTitle').textContent = `Delete Message`;
        
        document.getElementById('modalBody').innerHTML = `
          <div class="confirmation-message">
            <p>Are you sure you want to delete this message from <strong>${window.dashboard.escapeHtml(message.sender)}</strong> in channel <strong>${window.dashboard.escapeHtml(message.channel)}</strong>?</p>
            <p class="message-preview">"${window.dashboard.escapeHtml(message.text.substring(0, 100))}${message.text.length > 100 ? '...' : ''}"</p>
            <div class="form-group">
              <label for="deleteReason">Reason for deletion (optional):</label>
              <textarea id="deleteReason" name="deleteReason" rows="2"></textarea>
            </div>
            <div class="form-group">
              <div class="checkbox">
                <input type="checkbox" id="permanentDelete" name="permanentDelete">
                <label for="permanentDelete">Permanently delete (cannot be recovered)</label>
              </div>
            </div>
          </div>
        `;
        
        document.getElementById('modalFooter').innerHTML = `
          <button type="button" class="btn-secondary" onclick="window.dashboard.closeModal()">Cancel</button>
          <button type="button" class="btn-danger" id="confirmDeleteMessage">Delete</button>
        `;
        
        // Add delete confirmation handler
        document.getElementById('confirmDeleteMessage').addEventListener('click', function() {
          const reason = document.getElementById('deleteReason').value;
          const permanent = document.getElementById('permanentDelete').checked;
          
          // Send API request
          fetch(`/admin/api/messages/${messageId}`, {
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              reason: reason,
              permanent: permanent
            })
          })
          .then(response => response.json())
          .then(data => {
            if (data.success) {
              // Close modal and refresh message list
              window.dashboard.closeModal();
              refreshMessageLog();
            } else {
              // Show error message
              alert(`Error deleting message: ${data.message}`);
            }
          })
          .catch(error => {
            console.error('Error deleting message:', error);
            alert('Failed to delete message. Please try again.');
          });
        });
        
        // Show the modal
        window.dashboard.openModal();
      })
      .catch(error => {
        console.error('Error fetching message data:', error);
        alert('Failed to load message data. Please try again.');
      });
  }
  
  /**
   * Show modal for flagging a message
   * @param {string} messageId - Message ID to flag
   */
  function showFlagMessageModal(messageId) {
    // Fetch message data to display info
    fetch(`/admin/api/messages/${messageId}`)
      .then(response => response.json())
      .then(message => {
        document.getElementById('modalTitle').textContent = `Flag Message for Review`;
        
        document.getElementById('modalBody').innerHTML = `
          <div class="confirmation-message">
            <p>You are flagging a message from <strong>${window.dashboard.escapeHtml(message.sender)}</strong> in channel <strong>${window.dashboard.escapeHtml(message.channel)}</strong> for review:</p>
            <p class="message-preview">"${window.dashboard.escapeHtml(message.text.substring(0, 100))}${message.text.length > 100 ? '...' : ''}"</p>
            <div class="form-group">
              <label for="flagReason">Reason for flagging:</label>
              <select id="flagReason" name="flagReason">
                <option value="inappropriate">Inappropriate content</option>
                <option value="harassment">Harassment</option>
                <option value="spam">Spam</option>
                <option value="phi">Contains PHI</option>
                <option value="other">Other (specify below)</option>
              </select>
            </div>
            <div class="form-group">
              <label for="flagDetails">Additional details (optional):</label>
              <textarea id="flagDetails" name="flagDetails" rows="2"></textarea>
            </div>
          </div>
        `;
        
        document.getElementById('modalFooter').innerHTML = `
          <button type="button" class="btn-secondary" onclick="window.dashboard.closeModal()">Cancel</button>
          <button type="button" class="btn-warning" id="confirmFlagMessage">Flag</button>
        `;
        
        // Add flag confirmation handler
        document.getElementById('confirmFlagMessage').addEventListener('click', function() {
          const reason = document.getElementById('flagReason').value;
          const details = document.getElementById('flagDetails').value;
          
          // Send API request
          fetch(`/admin/api/messages/${messageId}/flag`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              reason: reason,
              details: details
            })
          })
          .then(response => response.json())
          .then(data => {
            if (data.success) {
              // Close modal and refresh message list
              window.dashboard.closeModal();
              refreshMessageLog();
            } else {
              // Show error message
              alert(`Error flagging message: ${data.message}`);
            }
          })
          .catch(error => {
            console.error('Error flagging message:', error);
            alert('Failed to flag message. Please try again.');
          });
        });
        
        // Show the modal
        window.dashboard.openModal();
      })
      .catch(error => {
        console.error('Error fetching message data:', error);
        alert('Failed to load message data. Please try again.');
      });
  }
  
  // Register functions with the global dashboard object
  window.dashboard.refreshMessageLog = refreshMessageLog;
  window.dashboard.refreshLogs = refreshLogs;
  window.dashboard.initMessagesPage = initMessagesPage;
  window.dashboard.initLogsPage = initLogsPage;