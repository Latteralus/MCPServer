// models/roleModel.test.js
const RoleModel = require('./roleModel');
const db = require('../config/database');

// Mock the database module
jest.mock('../config/database', () => ({
  query: jest.fn(),
}));

describe('RoleModel', () => {
  beforeEach(() => {
    // Reset mocks before each test
    db.query.mockReset();
  });

  describe('create', () => {
    it('should create a new role and return its details', async () => {
      const roleData = { name: 'Test Role', description: 'A test role' };
      const expectedRole = { id: 'uuid-1', ...roleData, is_default: false, created_at: new Date() };
      db.query.mockResolvedValue({ rows: [expectedRole] });

      const newRole = await RoleModel.create(roleData);

      expect(db.query).toHaveBeenCalledWith(expect.any(String), [roleData.name, roleData.description, false]);
      expect(newRole).toEqual(expectedRole);
    });

    it('should throw an error if a role with the same name exists', async () => {
      const roleData = { name: 'Existing Role', description: 'An existing role' };
      db.query.mockRejectedValue({ code: '23505' }); // Simulate unique constraint violation

      await expect(RoleModel.create(roleData)).rejects.toThrow('Role with this name already exists');
      expect(db.query).toHaveBeenCalled();
    });
  });

  describe('getById', () => {
    it('should return a role if found', async () => {
      const roleId = 'uuid-1';
      const expectedRole = { id: roleId, name: 'Test Role', description: 'Desc', is_default: false, created_at: new Date() };
      db.query.mockResolvedValue({ rows: [expectedRole] });

      const role = await RoleModel.getById(roleId);

      expect(db.query).toHaveBeenCalledWith(expect.stringContaining('WHERE id = $1'), [roleId]);
      expect(role).toEqual(expectedRole);
    });

    it('should return null if role not found', async () => {
      const roleId = 'uuid-nonexistent';
      db.query.mockResolvedValue({ rows: [] });

      const role = await RoleModel.getById(roleId);

      expect(db.query).toHaveBeenCalledWith(expect.stringContaining('WHERE id = $1'), [roleId]);
      expect(role).toBeNull();
    });
  });

  describe('getByName', () => {
    it('should return a role if found by name', async () => {
      const roleName = 'Admin Role';
      const expectedRole = { id: 'uuid-2', name: roleName, description: 'Admin Desc', is_default: false, created_at: new Date() };
      db.query.mockResolvedValue({ rows: [expectedRole] });

      const role = await RoleModel.getByName(roleName);

      expect(db.query).toHaveBeenCalledWith(expect.stringContaining('WHERE name = $1'), [roleName]);
      expect(role).toEqual(expectedRole);
    });

    it('should return null if role not found by name', async () => {
      const roleName = 'Nonexistent Role';
      db.query.mockResolvedValue({ rows: [] });

      const role = await RoleModel.getByName(roleName);

      expect(db.query).toHaveBeenCalledWith(expect.stringContaining('WHERE name = $1'), [roleName]);
      expect(role).toBeNull();
    });
  });

  // Add more tests for update, delete, addPermissions, removePermissions, getPermissions, list, hasPermission
});