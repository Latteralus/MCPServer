const AuditModel = require('../../models/auditModel');

/**
 * Retrieve all audit log entries.
 * Optionally, you could extend this to support filtering or pagination via query parameters.
 */
exports.getAllAuditLogs = async (req, res, next) => {
  try {
    const logs = await AuditModel.getAll();
    res.json(logs);
  } catch (error) {
    next(error);
  }
};

/**
 * Retrieve a single audit log entry by its ID.
 */
exports.getAuditLogById = async (req, res, next) => {
  try {
    const log = await AuditModel.getById(req.params.id);
    if (!log) {
      const err = new Error('Audit log entry not found');
      err.status = 404;
      return next(err);
    }
    res.json(log);
  } catch (error) {
    next(error);
  }
};
