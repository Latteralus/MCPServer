# Client Compatibility Guide for MCP Messenger Server

This document outlines the necessary information for a client application to connect and interact with the MCP Messenger server.

## 1. Server Connection Details

*   **Protocol:** Use `HTTPS` for REST API calls and `WSS` (WebSocket Secure) for WebSocket connections in production environments. Unencrypted connections (`http`, `ws`) are insecure and not suitable for production.
*   **Default Port:** The server defaults to port `3000` (configurable via the `PORT` environment variable on the server).
*   **Base URL Structure:**
    *   REST API: `https://<server-address>:<port>/api`
    *   WebSocket: `wss://<server-address>:<port>`

## 2. REST API Communication

### 2.1. Authentication

*   All protected API endpoints require authentication using a JSON Web Token (JWT).
*   The token must be included in the `Authorization` header as a Bearer token:
    ```
    Authorization: Bearer <your_jwt_token>
    ```
*   Obtain the token via the Login endpoint.

### 2.2. Key Endpoints

*   **Login:**
    *   `POST /api/auth/login`
    *   Request Body: `{ "username": "...", "password": "..." }`
    *   Response: JSON containing the JWT token (e.g., `{ "token": "...", ... }`).
*   **Users:**
    *   `GET /api/users` (List)
    *   `GET /api/users/:id` (Get specific)
    *   `POST /api/users` (Create)
    *   `PUT /api/users/:id` (Update)
    *   `DELETE /api/users/:id` (Delete)
*   **Channels:**
    *   `GET /api/channels` (List)
    *   `GET /api/channels/:id` (Get specific)
    *   `POST /api/channels` (Create)
    *   `PUT /api/channels/:id` (Update)
    *   `DELETE /api/channels/:id` (Delete)
*   **Messages:**
    *   `GET /api/messages` (List)
    *   `GET /api/messages/:id` (Get specific)
    *   `POST /api/messages` (Create)
    *   `PUT /api/messages/:id` (Update)
    *   `DELETE /api/messages/:id` (Delete)
*   **Audit Logs:**
    *   `GET /api/audit` (List)
    *   `GET /api/audit/:id` (Get specific)

*(Refer to the full `TechnicalDocument.md` for details on request bodies, query parameters, and responses for all endpoints.)*

### 2.3. CSRF Protection

*   All state-changing REST API endpoints (POST, PUT, DELETE) are protected by CSRF tokens.
*   Clients must include a valid CSRF token in these requests.
*   The token is typically obtained during session initialization or page load (often via a cookie named `_csrf` set by the server).
*   The token must be sent back in either:
    *   A `CSRF-Token` HTTP header.
    *   A form field named `_csrf`.

## 3. WebSocket Communication

### 3.1. Connection & Authentication

1.  **Establish Connection:** Connect to the WebSocket endpoint (e.g., `wss://<server-address>:<port>`).
2.  **Authenticate Immediately:** As soon as the connection opens, send an authentication message:
    ```json
    {
      "type": "authenticate",
      "token": "<your_jwt_token>"
    }
    ```
3.  **Handle Response:** Expect an authentication response from the server:
    ```json
    {
      "type": "authentication_response",
      "success": true, // or false
      "user": { // Included on success
        "id": "user-id",
        "username": "username"
      },
      "reason": "..." // Included on failure
    }
    ```
    The connection is only fully established after a successful authentication response.

### 3.2. Client-to-Server Messages

*(All messages should be sent as JSON strings)*

| Message Type       | Description              | Required Fields          | Notes                               |
| :----------------- | :----------------------- | :----------------------- | :---------------------------------- |
| `authenticate`     | Authenticate connection  | `token`                  | Sent immediately after connection |
| `join_channel`     | Join a specific channel  | `channelId`              |                                     |
| `leave_channel`    | Leave a specific channel | `channelId`              |                                     |
| `send_message`     | Send a chat message      | `channelId`, `text`      | `containsPHI` field is optional     |
| `edit_message`     | Edit an existing message | `messageId`, `text`      |                                     |
| `delete_message`   | Delete a message         | `messageId`              |                                     |
| `typing_indicator` | Show user is typing      | `channelId`              |                                     |
| `read_receipt`     | Mark messages as read    | `channelId`, `messageId` |                                     |
| `ping`/`heartbeat` | Keep connection alive    | -                        | Send periodically (e.g., 30s)     |
| `channel_list_request` | Request available channels | -                        | Sent after successful authentication |

### 3.3. Server-to-Client Messages

*(All messages are received as JSON strings)*

| Message Type              | Description                  | Payload Structure (`data` field or root) |
| :------------------------ | :--------------------------- | :--------------------------------------- |
| `authentication_response` | Authentication result        | `success`, `user` (on success)           |
| `new_message`             | New chat message received    | `data`: { `id`, `channelId`, `senderId`, `senderUsername`, `text`, `timestamp`, `containsPHI`, ... } |
| `message_updated`         | Existing message edited      | `data`: { `id`, `channelId`, `text`, `editedAt`, ... } |
| `message_deleted`         | Existing message deleted     | `data`: { `messageId`, `channelId` }     |
| `pong`                    | Response to client ping      | -                                        |
| `system_event`            | General system notification  | `eventType`, `data`                      |
| `notification`            | User-specific notification   | Varies                                   |
| `channel_list_response`   | List of available channels   | `channels`: [ { `id`, `name`, ... }, ... ] |

### 3.4. User/Channel List Handling

*   **Channel List:** The server handles a `channel_list_request` from the client and is expected to respond with a `channel_list_response` message containing an array of channel objects.
*   **User List:** The server **does not** appear to send user lists via WebSocket based on `websocket/handlers.js`. Clients should fetch user lists using the REST API (`GET /api/users`).

## 4. Important Notes

*   **HTTPS/WSS:** Enforcing secure connections via HTTPS and WSS is **mandatory** for production environments, especially for HIPAA compliance. This usually requires configuration outside the application (e.g., a reverse proxy).
*   **JWT Token Expiration:** Tokens expire (default 24h). Clients should handle token expiration and potentially use the refresh token mechanism if implemented (`POST /api/auth/refresh-token`).
*   **Error Handling:** Implement robust error handling for both REST API calls and WebSocket communication failures.