// dashboard-users-channels.js - User and channel management functionality

/**
 * Initialize users page
 */
function initUsersPage() {
    // Add user button handler
    const addUserBtn = document.querySelector('.user-page-header .btn-primary');
    if (addUserBtn) {
      addUserBtn.addEventListener('click', function() {
        showCreateUserModal();
      });
    }
    
    // Refresh user list
    refreshUserList();
  }
  
  /**
   * Refresh user list
   */
  function refreshUserList() {
    const userTableBody = document.getElementById('userTableBody');
    
    if (!userTableBody) return;
    
    fetch('/admin/api/users')
      .then(response => response.json())
      .then(data => {
        if (data.users && data.users.length > 0) {
          // Update user table
          const tableHtml = data.users.map(user => {
            // Status badge
            let statusBadge = `<span class="badge badge-secondary">Offline</span>`;
            if (user.status === 'online') {
              statusBadge = `<span class="badge badge-success">Online</span>`;
            } else if (user.status === 'idle') {
              statusBadge = `<span class="badge badge-warning">Idle</span>`;
            }
            
            return `
              <tr>
                <td>${window.dashboard.escapeHtml(user.username)}</td>
                <td>${window.dashboard.escapeHtml(user.role || 'User')}</td>
                <td>${statusBadge}</td>
                <td>${user.lastLogin ? window.dashboard.formatTimeAgo(user.lastLogin) : 'Never'}</td>
                <td class="actions">
                  <button class="btn-sm edit-user-btn" data-userid="${user.id}">Edit</button>
                  <button class="btn-sm btn-danger delete-user-btn" data-userid="${user.id}">Delete</button>
                </td>
              </tr>
            `;
          }).join('');
          
          userTableBody.innerHTML = tableHtml;
          
          // Add event listeners for edit and delete buttons
          addUserActionHandlers();
        } else {
          // No users
          userTableBody.innerHTML = `
            <tr>
              <td colspan="5" class="empty-state">No users available</td>
            </tr>
          `;
        }
      })
      .catch(error => {
        console.error('Error fetching users:', error);
        userTableBody.innerHTML = `
          <tr>
            <td colspan="5" class="empty-state">Failed to load user data</td>
          </tr>
        `;
      });
  }
  
  /**
   * Add event handlers for user actions
   */
  function addUserActionHandlers() {
    // Edit user buttons
    document.querySelectorAll('.edit-user-btn').forEach(button => {
      button.addEventListener('click', function() {
        const userId = this.getAttribute('data-userid');
        showEditUserModal(userId);
      });
    });
    
    // Delete user buttons
    document.querySelectorAll('.delete-user-btn').forEach(button => {
      button.addEventListener('click', function() {
        const userId = this.getAttribute('data-userid');
        showDeleteUserModal(userId);
      });
    });
  }
  
  /**
   * Show modal for creating a new user
   */
  function showCreateUserModal() {
    document.getElementById('modalTitle').textContent = 'Create New User';
    
    document.getElementById('modalBody').innerHTML = `
      <form id="createUserForm">
        <div class="form-group">
          <label for="username">Username</label>
          <input type="text" id="username" name="username" required>
        </div>
        <div class="form-group">
          <label for="password">Password</label>
          <input type="password" id="password" name="password" required>
        </div>
        <div class="form-group">
          <label for="role">Role</label>
          <select id="role" name="role">
            <option value="user">User</option>
            <option value="moderator">Moderator</option>
            <option value="admin">Administrator</option>
          </select>
        </div>
      </form>
    `;
    
    document.getElementById('modalFooter').innerHTML = `
      <button type="button" class="btn-secondary" onclick="window.dashboard.closeModal()">Cancel</button>
      <button type="button" class="btn-primary" id="createUserSubmit">Create User</button>
    `;
    
    // Add submit handler
    document.getElementById('createUserSubmit').addEventListener('click', function() {
      const form = document.getElementById('createUserForm');
      const formData = new FormData(form);
      
      // Convert FormData to JSON
      const userData = {};
      formData.forEach((value, key) => {
        userData[key] = value;
      });
      
      // Send API request
      fetch('/admin/api/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(userData)
      })
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          // Close modal and refresh user list
          window.dashboard.closeModal();
          refreshUserList();
        } else {
          // Show error message
          alert(`Error creating user: ${data.message}`);
        }
      })
      .catch(error => {
        console.error('Error creating user:', error);
        alert('Failed to create user. Please try again.');
      });
    });
    
    // Show the modal
    window.dashboard.openModal();
  }
  
  /**
   * Show modal for editing a user
   * @param {string} userId - User ID to edit
   */
  function showEditUserModal(userId) {
    // Fetch user data
    fetch(`/admin/api/users/${userId}`)
      .then(response => response.json())
      .then(user => {
        document.getElementById('modalTitle').textContent = `Edit User: ${window.dashboard.escapeHtml(user.username)}`;
        
        document.getElementById('modalBody').innerHTML = `
          <form id="editUserForm">
            <input type="hidden" id="userId" name="userId" value="${user.id}">
            <div class="form-group">
              <label for="username">Username</label>
              <input type="text" id="username" name="username" value="${window.dashboard.escapeHtml(user.username)}" required>
            </div>
            <div class="form-group">
              <label for="password">New Password (leave blank to keep current)</label>
              <input type="password" id="password" name="password">
            </div>
            <div class="form-group">
              <label for="role">Role</label>
              <select id="role" name="role">
                <option value="user" ${user.role === 'user' ? 'selected' : ''}>User</option>
                <option value="moderator" ${user.role === 'moderator' ? 'selected' : ''}>Moderator</option>
                <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Administrator</option>
              </select>
            </div>
          </form>
        `;
        
        document.getElementById('modalFooter').innerHTML = `
          <button type="button" class="btn-secondary" onclick="window.dashboard.closeModal()">Cancel</button>
          <button type="button" class="btn-primary" id="updateUserSubmit">Update User</button>
        `;
        
        // Add submit handler
        document.getElementById('updateUserSubmit').addEventListener('click', function() {
          const form = document.getElementById('editUserForm');
          const formData = new FormData(form);
          
          // Convert FormData to JSON
          const userData = {};
          formData.forEach((value, key) => {
            userData[key] = value;
          });
          
          // Remove password if empty
          if (!userData.password) {
            delete userData.password;
          }
          
          // Send API request
          fetch(`/admin/api/users/${userId}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(userData)
          })
          .then(response => response.json())
          .then(data => {
            if (data.success) {
              // Close modal and refresh user list
              window.dashboard.closeModal();
              refreshUserList();
            } else {
              // Show error message
              alert(`Error updating user: ${data.message}`);
            }
          })
          .catch(error => {
            console.error('Error updating user:', error);
            alert('Failed to update user. Please try again.');
          });
        });
        
        // Show the modal
        window.dashboard.openModal();
      })
      .catch(error => {
        console.error('Error fetching user data:', error);
        alert('Failed to load user data. Please try again.');
      });
  }
  
  /**
   * Show modal for deleting a user
   * @param {string} userId - User ID to delete
   */
  function showDeleteUserModal(userId) {
    // Fetch user data to display name
    fetch(`/admin/api/users/${userId}`)
      .then(response => response.json())
      .then(user => {
        document.getElementById('modalTitle').textContent = `Delete User`;
        
        document.getElementById('modalBody').innerHTML = `
          <div class="confirmation-message">
            <p>Are you sure you want to delete the user <strong>${window.dashboard.escapeHtml(user.username)}</strong>?</p>
            <p class="text-danger">This action cannot be undone.</p>
          </div>
        `;
        
        document.getElementById('modalFooter').innerHTML = `
          <button type="button" class="btn-secondary" onclick="window.dashboard.closeModal()">Cancel</button>
          <button type="button" class="btn-danger" id="confirmDeleteUser">Delete</button>
        `;
        
        // Add delete confirmation handler
        document.getElementById('confirmDeleteUser').addEventListener('click', function() {
          // Send API request
          fetch(`/admin/api/users/${userId}`, {
            method: 'DELETE'
          })
          .then(response => response.json())
          .then(data => {
            if (data.success) {
              // Close modal and refresh user list
              window.dashboard.closeModal();
              refreshUserList();
            } else {
              // Show error message
              alert(`Error deleting user: ${data.message}`);
            }
          })
          .catch(error => {
            console.error('Error deleting user:', error);
            alert('Failed to delete user. Please try again.');
          });
        });
        
        // Show the modal
        window.dashboard.openModal();
      })
      .catch(error => {
        console.error('Error fetching user data:', error);
        alert('Failed to load user data. Please try again.');
      });
  }
  
  /**
   * Initialize channels page
   */
  function initChannelsPage() {
    // Add channel button handler
    const addChannelBtn = document.querySelector('.channel-page-header .btn-primary');
    if (addChannelBtn) {
      addChannelBtn.addEventListener('click', function() {
        showCreateChannelModal();
      });
    }
    
    // Refresh channel list
    refreshChannelList();
  }
  
  /**
   * Refresh channel list with full details
   */
  function refreshChannelList() {
    // For dashboard we have a simpler channel list
    const channelsTable = document.getElementById('channelsTable');
    if (channelsTable) {
      // This is the dashboard version
      fetch('/admin/api/channels')
        .then(response => response.json())
        .then(data => {
          if (data.channels && data.channels.length > 0) {
            // Update channels table
            const tableHtml = data.channels.map(channel => `
              <tr>
                <td>${window.dashboard.escapeHtml(channel.name)}</td>
                <td>${channel.userCount} users</td>
                <td>${channel.messageCount} messages</td>
                <td>${window.dashboard.formatTimeAgo(channel.lastActivity)}</td>
              </tr>
            `).join('');
            
            channelsTable.innerHTML = tableHtml;
          } else {
            // No channels
            channelsTable.innerHTML = `
              <tr>
                <td colspan="4" class="empty-state">No channels available</td>
              </tr>
            `;
          }
        })
        .catch(error => {
          console.error('Error fetching channels:', error);
          channelsTable.innerHTML = `
            <tr>
              <td colspan="4" class="empty-state">Failed to load channel data</td>
            </tr>
          `;
        });
      return;
    }
    
    // For the channels page, we have a more detailed table
    const channelTableBody = document.getElementById('channelTableBody');
    if (!channelTableBody) return;
    
    fetch('/admin/api/channels?details=full')
      .then(response => response.json())
      .then(data => {
        if (data.channels && data.channels.length > 0) {
          // Update channel table
          const tableHtml = data.channels.map(channel => `
            <tr>
              <td>${window.dashboard.escapeHtml(channel.name)}</td>
              <td>${window.dashboard.escapeHtml(channel.description || '')}</td>
              <td>${channel.userCount} users</td>
              <td>${window.dashboard.formatTimeAgo(channel.createdAt)}</td>
              <td class="actions">
                <button class="btn-sm edit-channel-btn" data-channelid="${channel.id}">Edit</button>
                <button class="btn-sm btn-danger delete-channel-btn" data-channelid="${channel.id}">Delete</button>
              </td>
            </tr>
          `).join('');
          
          channelTableBody.innerHTML = tableHtml;
          
          // Add event listeners for edit and delete buttons
          addChannelActionHandlers();
        } else {
          // No channels
          channelTableBody.innerHTML = `
            <tr>
              <td colspan="5" class="empty-state">No channels available</td>
            </tr>
          `;
        }
      })
      .catch(error => {
        console.error('Error fetching channels:', error);
        channelTableBody.innerHTML = `
          <tr>
            <td colspan="5" class="empty-state">Failed to load channel data</td>
          </tr>
        `;
      });
  }
  
  /**
   * Add event handlers for channel actions
   */
  function addChannelActionHandlers() {
    // Edit channel buttons
    document.querySelectorAll('.edit-channel-btn').forEach(button => {
      button.addEventListener('click', function() {
        const channelId = this.getAttribute('data-channelid');
        showEditChannelModal(channelId);
      });
    });
    
    // Delete channel buttons
    document.querySelectorAll('.delete-channel-btn').forEach(button => {
      button.addEventListener('click', function() {
        const channelId = this.getAttribute('data-channelid');
        showDeleteChannelModal(channelId);
      });
    });
  }
  
  /**
   * Show modal for creating a new channel
   */
  function showCreateChannelModal() {
    document.getElementById('modalTitle').textContent = 'Create New Channel';
    
    document.getElementById('modalBody').innerHTML = `
      <form id="createChannelForm">
        <div class="form-group">
          <label for="name">Channel Name</label>
          <input type="text" id="name" name="name" required>
        </div>
        <div class="form-group">
          <label for="description">Description</label>
          <textarea id="description" name="description" rows="3"></textarea>
        </div>
        <div class="form-group">
          <label for="isPrivate">Privacy</label>
          <select id="isPrivate" name="isPrivate">
            <option value="false">Public</option>
            <option value="true">Private</option>
          </select>
        </div>
      </form>
    `;
    
    document.getElementById('modalFooter').innerHTML = `
      <button type="button" class="btn-secondary" onclick="window.dashboard.closeModal()">Cancel</button>
      <button type="button" class="btn-primary" id="createChannelSubmit">Create Channel</button>
    `;
    
    // Add submit handler
    document.getElementById('createChannelSubmit').addEventListener('click', function() {
      const form = document.getElementById('createChannelForm');
      const formData = new FormData(form);
      
      // Convert FormData to JSON
      const channelData = {};
      formData.forEach((value, key) => {
        // Convert isPrivate string to boolean
        if (key === 'isPrivate') {
          channelData[key] = value === 'true';
        } else {
          channelData[key] = value;
        }
      });
      
      // Send API request
      fetch('/admin/api/channels', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(channelData)
      })
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          // Close modal and refresh channel list
          window.dashboard.closeModal();
          refreshChannelList();
        } else {
          // Show error message
          alert(`Error creating channel: ${data.message}`);
        }
      })
      .catch(error => {
        console.error('Error creating channel:', error);
        alert('Failed to create channel. Please try again.');
      });
    });
    
    // Show the modal
    window.dashboard.openModal();
  }
  
  /**
   * Show modal for editing a channel
   * @param {string} channelId - Channel ID to edit
   */
  function showEditChannelModal(channelId) {
    // Fetch channel data
    fetch(`/admin/api/channels/${channelId}`)
      .then(response => response.json())
      .then(channel => {
        document.getElementById('modalTitle').textContent = `Edit Channel: ${window.dashboard.escapeHtml(channel.name)}`;
        
        document.getElementById('modalBody').innerHTML = `
          <form id="editChannelForm">
            <input type="hidden" id="channelId" name="channelId" value="${channel.id}">
            <div class="form-group">
              <label for="name">Channel Name</label>
              <input type="text" id="name" name="name" value="${window.dashboard.escapeHtml(channel.name)}" required>
            </div>
            <div class="form-group">
              <label for="description">Description</label>
              <textarea id="description" name="description" rows="3">${window.dashboard.escapeHtml(channel.description || '')}</textarea>
            </div>
            <div class="form-group">
              <label for="isPrivate">Privacy</label>
              <select id="isPrivate" name="isPrivate">
                <option value="false" ${!channel.isPrivate ? 'selected' : ''}>Public</option>
                <option value="true" ${channel.isPrivate ? 'selected' : ''}>Private</option>
              </select>
            </div>
          </form>
        `;
        
        document.getElementById('modalFooter').innerHTML = `
          <button type="button" class="btn-secondary" onclick="window.dashboard.closeModal()">Cancel</button>
          <button type="button" class="btn-primary" id="updateChannelSubmit">Update Channel</button>
        `;
        
        // Add submit handler
        document.getElementById('updateChannelSubmit').addEventListener('click', function() {
          const form = document.getElementById('editChannelForm');
          const formData = new FormData(form);
          
          // Convert FormData to JSON
          const channelData = {};
          formData.forEach((value, key) => {
            // Convert isPrivate string to boolean
            if (key === 'isPrivate') {
              channelData[key] = value === 'true';
            } else {
              channelData[key] = value;
            }
          });
          
          // Send API request
          fetch(`/admin/api/channels/${channelId}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(channelData)
          })
          .then(response => response.json())
          .then(data => {
            if (data.success) {
              // Close modal and refresh channel list
              window.dashboard.closeModal();
              refreshChannelList();
            } else {
              // Show error message
              alert(`Error updating channel: ${data.message}`);
            }
          })
          .catch(error => {
            console.error('Error updating channel:', error);
            alert('Failed to update channel. Please try again.');
          });
        });
        
        // Show the modal
        window.dashboard.openModal();
      })
      .catch(error => {
        console.error('Error fetching channel data:', error);
        alert('Failed to load channel data. Please try again.');
      });
  }
  
  /**
   * Show modal for deleting a channel
   * @param {string} channelId - Channel ID to delete
   */
  function showDeleteChannelModal(channelId) {
    // Fetch channel data to display name
    fetch(`/admin/api/channels/${channelId}`)
      .then(response => response.json())
      .then(channel => {
        document.getElementById('modalTitle').textContent = `Delete Channel`;
        
        document.getElementById('modalBody').innerHTML = `
          <div class="confirmation-message">
            <p>Are you sure you want to delete the channel <strong>${window.dashboard.escapeHtml(channel.name)}</strong>?</p>
            <p class="text-danger">This will permanently delete all messages in this channel. This action cannot be undone.</p>
          </div>
        `;
        
        document.getElementById('modalFooter').innerHTML = `
          <button type="button" class="btn-secondary" onclick="window.dashboard.closeModal()">Cancel</button>
          <button type="button" class="btn-danger" id="confirmDeleteChannel">Delete</button>
        `;
        
        // Add delete confirmation handler
        document.getElementById('confirmDeleteChannel').addEventListener('click', function() {
          // Send API request
          fetch(`/admin/api/channels/${channelId}`, {
            method: 'DELETE'
          })
          .then(response => response.json())
          .then(data => {
            if (data.success) {
              // Close modal and refresh channel list
              window.dashboard.closeModal();
              refreshChannelList();
            } else {
              // Show error message
              alert(`Error deleting channel: ${data.message}`);
            }
          })
          .catch(error => {
            console.error('Error deleting channel:', error);
            alert('Failed to delete channel. Please try again.');
          });
        });
        
        // Show the modal
        window.dashboard.openModal();
      })
      .catch(error => {
        console.error('Error fetching channel data:', error);
        alert('Failed to load channel data. Please try again.');
      });
  }
  
  /**
   * Refresh activity log
   */
  function refreshActivityLog() {
    const activityLog = document.getElementById('activityLog');
    
    if (!activityLog) return;
    
    fetch('/admin/api/logs?limit=5')
      .then(response => response.json())
      .then(data => {
        if (data.logs && data.logs.length > 0) {
          // Update activity log
          const logHtml = data.logs.map(log => {
            // Determine icon based on action
            const icons = {
              'login': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path><polyline points="10 17 15 12 10 7"></polyline><line x1="15" y1="12" x2="3" y2="12"></line></svg>',
              'logout': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>',
              'message': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>',
              'channel': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>',
              'user': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>',
              'system': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>'
            };
            
            // Default icon
            let icon = icons.system;
            
            // Try to determine category from action
            if (log.action.includes('login') || log.action.includes('logout')) {
              icon = log.action.includes('login') ? icons.login : icons.logout;
            } else if (log.action.includes('message')) {
              icon = icons.message;
            } else if (log.action.includes('channel')) {
              icon = icons.channel;
            } else if (log.action.includes('user')) {
              icon = icons.user;
            }
            
            return `
              <div class="activity-item">
                <div class="activity-icon">
                  ${icon}
                </div>
                <div class="activity-content">
                  <span class="activity-text">${formatActivityText(log)}</span>
                  <span class="activity-time">${window.dashboard.formatTimeAgo(log.timestamp)}</span>
                </div>
              </div>
            `;
          }).join('');
          
          activityLog.innerHTML = logHtml;
        } else {
          // No activity
          activityLog.innerHTML = `<div class="empty-state">No recent activity to display</div>`;
        }
      })
      .catch(error => {
        console.error('Error fetching activity logs:', error);
        activityLog.innerHTML = `<div class="empty-state">Failed to load activity data</div>`;
      });
  }
  
  /**
   * Format activity text from log entry
   * @param {object} log - Log entry
   * @returns {string} Formatted text
   */
  function formatActivityText(log) {
    // Default format
    let text = `${window.dashboard.escapeHtml(log.username || 'System')} performed ${window.dashboard.escapeHtml(log.action)}`;
    
    // Format based on action
    if (log.action === 'login') {
      text = `User <strong>${window.dashboard.escapeHtml(log.username)}</strong> logged in`;
    } else if (log.action === 'logout') {
      text = `User <strong>${window.dashboard.escapeHtml(log.username)}</strong> logged out`;
    } else if (log.action === 'message_sent') {
      text = `<strong>${window.dashboard.escapeHtml(log.username)}</strong> sent a message in channel <strong>${window.dashboard.escapeHtml(log.details?.channel || 'unknown')}</strong>`;
    } else if (log.action === 'channel_created') {
      text = `New channel <strong>${window.dashboard.escapeHtml(log.details?.channel || 'unknown')}</strong> created by <strong>${window.dashboard.escapeHtml(log.username)}</strong>`;
    } else if (log.action === 'user_created') {
      text = `New user <strong>${window.dashboard.escapeHtml(log.details?.newUser || 'unknown')}</strong> created by <strong>${window.dashboard.escapeHtml(log.username)}</strong>`;
    }
    
    return text;
  }
  
  // Register functions with the global dashboard object
  window.dashboard.refreshUserList = refreshUserList;
  window.dashboard.refreshChannelList = refreshChannelList;
  window.dashboard.refreshActivityLog = refreshActivityLog;
  window.dashboard.initUsersPage = initUsersPage;
  window.dashboard.initChannelsPage = initChannelsPage;