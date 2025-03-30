// services/encryptionService.js
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const logger = require('../config/logger'); // Import logger

/**
 * Encryption Service for HIPAA-compliant data security
 * Handles encryption/decryption operations throughout the application
 */
class EncryptionService {
  constructor() {
    // Algorithm selection: AES-256-GCM provides authenticated encryption
    this.algorithm = 'aes-256-gcm';
    
    // Initialization Vector (IV) length in bytes
    this.ivLength = 16;
    
    // Auth Tag length for GCM mode
    this.authTagLength = 16;
    
    // Load encryption keys
    this.loadKeys();
  }

  /**
   * Load encryption keys from environment or key files
   * @private
   */
  loadKeys() {
    try {
      // Primary encryption key - for message content
      this.primaryKey = process.env.ENCRYPTION_KEY || 
        this.loadKeyFromFile('primary_encryption_key');
      
      // Secondary key - for sensitive metadata
      this.metadataKey = process.env.METADATA_KEY || 
        this.loadKeyFromFile('metadata_encryption_key');
      // Validate that keys were loaded successfully
      if (!this.primaryKey || !this.metadataKey) {
        const errorMsg = 'CRITICAL ERROR: Encryption keys (ENCRYPTION_KEY, METADATA_KEY) are missing or invalid. Application cannot start securely.';
        logger.fatal(errorMsg);
        // Throw a fatal error to prevent insecure operation
        throw new Error(errorMsg);
        throw new Error(errorMsg);
      }
      
      // Log success (optional, consider log level)
      logger.info('Encryption keys loaded successfully.');

    } catch (error) {
      logger.fatal({ err: error }, 'CRITICAL ERROR during encryption key loading');
      // Re-throw error to ensure application startup fails
      throw new Error('Failed to load encryption keys: ' + error.message);
    }
  }

  /**
   * Load key from file
   * @private
   * @param {string} keyName - Name of key file
   * @returns {Buffer} Key as buffer
   */
  loadKeyFromFile(keyName) {
    const keyPath = path.join(process.cwd(), 'keys', `${keyName}.key`);
    
    if (fs.existsSync(keyPath)) {
      return fs.readFileSync(keyPath);
    }
    
    return null;
  }

  /**
   * Generate temporary keys for development
   * NOT FOR PRODUCTION USE
   * @private
   */
  generateTemporaryKeys() {
    logger.warn('INSECURE: Using temporary encryption keys. This is not secure for production.');
    this.primaryKey = crypto.randomBytes(32);
    this.metadataKey = crypto.randomBytes(32);
  }

  /**
   * Encrypt data using primary key
   * @param {string|Object} data - Data to encrypt
   * @returns {Object} Encrypted data with IV and auth tag
   */
  encrypt(data) {
    return this.encryptWithKey(data, this.primaryKey);
  }

  /**
   * Decrypt data using primary key
   * @param {Object} encryptedData - Object containing encrypted, iv, and authTag
   * @returns {string|Object} Decrypted data
   */
  decrypt(encryptedData) {
    return this.decryptWithKey(encryptedData, this.primaryKey);
  }

  /**
   * Encrypt sensitive metadata
   * @param {string|Object} data - Metadata to encrypt
   * @returns {Object} Encrypted metadata with IV and auth tag
   */
  encryptMetadata(data) {
    return this.encryptWithKey(data, this.metadataKey);
  }

  /**
   * Decrypt sensitive metadata
   * @param {Object} encryptedData - Object containing encrypted, iv, and authTag
   * @returns {string|Object} Decrypted metadata
   */
  decryptMetadata(encryptedData) {
    return this.decryptWithKey(encryptedData, this.metadataKey);
  }

  /**
   * Encrypt data with specified key
   * @private
   * @param {string|Object} data - Data to encrypt
   * @param {Buffer} key - Encryption key
   * @returns {Object} Encrypted data object
   */
  encryptWithKey(data, key) {
    try {
      // Generate random initialization vector
      const iv = crypto.randomBytes(this.ivLength);
      
      // Create cipher with key, IV, and auth tag length
      const cipher = crypto.createCipheriv(this.algorithm, key, iv, {
        authTagLength: this.authTagLength
      });
      
      // Convert data to string if object
      const dataString = typeof data === 'object' ? JSON.stringify(data) : data;
      
      // Encrypt the data
      let encrypted = cipher.update(dataString, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      // Get authentication tag
      const authTag = cipher.getAuthTag().toString('hex');
      
      // Return encrypted data with IV and auth tag
      return {
        encrypted,
        iv: iv.toString('hex'),
        authTag
      };
    } catch (error) {
      logger.error({ err: error }, 'Encryption error');
      throw new Error('Data encryption failed');
    }
  }

  /**
   * Decrypt data with specified key
   * @private
   * @param {Object} encryptedData - Object containing encrypted, iv, and authTag
   * @param {Buffer} key - Decryption key
   * @returns {string|Object} Decrypted data
   */
  decryptWithKey(encryptedData, key) {
    try {
      const { encrypted, iv, authTag } = encryptedData;
      
      // Create decipher with key and IV
      const decipher = crypto.createDecipheriv(
        this.algorithm,
        key,
        Buffer.from(iv, 'hex')
      );
      
      // Set auth tag for authenticated decryption
      decipher.setAuthTag(Buffer.from(authTag, 'hex'));
      
      // Decrypt the data
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      // Try to parse as JSON if it's a valid JSON string
      try {
        return JSON.parse(decrypted);
      } catch {
        // Return as regular string if not JSON
        return decrypted;
      }
    } catch (error) {
      logger.error({ err: error }, 'Decryption error');
      throw new Error('Data decryption failed');
    }
  }

  /**
   * Hash sensitive data (one-way)
   * @param {string} data - Data to hash
   * @returns {string} Hashed data
   */
  hash(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Generate a secure random token
   * @param {number} length - Length of token in bytes
   * @returns {string} Random token in hex format
   */
  generateToken(length = 32) {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Encrypt a file
   * @param {Buffer} fileBuffer - File data as buffer
   * @returns {Object} Encrypted file data
   */
  encryptFile(fileBuffer) {
    try {
      // Generate random initialization vector
      const iv = crypto.randomBytes(this.ivLength);
      
      // Create cipher
      const cipher = crypto.createCipheriv(this.algorithm, this.primaryKey, iv);
      
      // Encrypt file data
      const encryptedBuffer = Buffer.concat([
        cipher.update(fileBuffer),
        cipher.final()
      ]);
      
      // Get authentication tag
      const authTag = cipher.getAuthTag();
      
      // Return encrypted file data
      return {
        encryptedData: encryptedBuffer,
        iv,
        authTag
      };
    } catch (error) {
      logger.error({ err: error }, 'File encryption error');
      throw new Error('File encryption failed');
    }
  }

  /**
   * Decrypt a file
   * @param {Buffer} encryptedData - Encrypted file data
   * @param {Buffer} iv - Initialization vector
   * @param {Buffer} authTag - Authentication tag
   * @returns {Buffer} Decrypted file data
   */
  decryptFile(encryptedData, iv, authTag) {
    try {
      // Create decipher
      const decipher = crypto.createDecipheriv(this.algorithm, this.primaryKey, iv);
      
      // Set authentication tag
      decipher.setAuthTag(authTag);
      
      // Decrypt file data
      const decryptedBuffer = Buffer.concat([
        decipher.update(encryptedData),
        decipher.final()
      ]);
      
      return decryptedBuffer;
    } catch (error) {
      logger.error({ err: error }, 'File decryption error');
      throw new Error('File decryption failed');
    }
  }

  /**
   * Generate secure password hash with salt (for user passwords)
   * @param {string} password - Plain text password
   * @returns {Object} Hash and salt
   */
  generatePasswordHash(password) {
    // Generate random salt
    const salt = crypto.randomBytes(16).toString('hex');
    
    // Hash password with salt using PBKDF2
    return new Promise((resolve, reject) => {
      crypto.pbkdf2(password, salt, 10000, 64, 'sha512', (err, derivedKey) => {
        if (err) reject(err);
        resolve({
          hash: derivedKey.toString('hex'),
          salt
        });
      });
    });
  }

  /**
   * Verify password against stored hash
   * @param {string} password - Plain text password to verify
   * @param {string} storedHash - Stored password hash
   * @param {string} salt - Salt used for hashing
   * @returns {Promise<boolean>} Whether password matches
   */
  verifyPassword(password, storedHash, salt) {
    return new Promise((resolve, reject) => {
      crypto.pbkdf2(password, salt, 10000, 64, 'sha512', (err, derivedKey) => {
        if (err) reject(err);
        resolve(derivedKey.toString('hex') === storedHash);
      });
    });
  }
}

// Export singleton instance
module.exports = new EncryptionService();