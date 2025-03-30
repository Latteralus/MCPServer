const pino = require('pino');

let loggerInstance = null;

/**
 * Initializes the pino logger instance using the main application configuration.
 * This function is called lazily only when the logger is first used.
 * @returns {pino.Logger} The initialized pino logger instance.
 */
function getLogger() {
  // Only initialize once
  if (!loggerInstance) {
    // Require config here, only when first needed, ensuring it's fully loaded.
    const config = require('../config');

    // Determine Pino options based on the loaded configuration
    const pinoOptions = {
      level: config.logLevel || 'info', // Use log level from main config
      timestamp: pino.stdTimeFunctions.isoTime, // ISO timestamps
    };

    // Use pino-pretty for development environments for better readability
    if (process.env.NODE_ENV !== 'production') {
      pinoOptions.transport = {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname', // Optional: simplify logs
        },
      };
    }

    // Create the actual logger instance
    loggerInstance = pino(pinoOptions);

    // Log initialization (only happens once)
    loggerInstance.info(`Logger initialized with level: ${loggerInstance.level}`);
  }
  return loggerInstance;
}

// Create a proxy object that delegates calls to the lazily initialized logger
const loggerProxy = {
  // Define methods that delegate to the actual logger instance via getLogger()
  // Ensure all used pino methods are proxied here.
  info: (...args) => getLogger().info(...args),
  warn: (...args) => getLogger().warn(...args),
  error: (...args) => getLogger().error(...args),
  fatal: (...args) => getLogger().fatal(...args),
  debug: (...args) => getLogger().debug(...args),
  trace: (...args) => getLogger().trace(...args),
  // Add child method if needed, ensuring it also uses the proxy logic or initialized instance
  child: (bindings) => {
      // Ensure the parent logger is initialized before creating a child
      const parentLogger = getLogger();
      // Return a child logger from the actual instance
      return parentLogger.child(bindings);
  },
  // Expose the level property dynamically from the actual instance
  get level() {
    return getLogger().level;
  }
};

module.exports = loggerProxy;