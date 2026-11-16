import { can } from '../src/lib/permissions';

describe('role permissions', () => {
  it('allows viewers to read but not change resources', () => {
    expect(can(['viewer'], 'resource:read')).toBe(true);
    expect(can(['viewer'], 'resource:create')).toBe(false);
    expect(can(['viewer'], 'resource:update')).toBe(false);
    expect(can(['viewer'], 'resource:delete')).toBe(false);
  });

  it('allows operators to change but not delete resources', () => {
    expect(can(['operator'], 'resource:create')).toBe(true);
    expect(can(['operator'], 'resource:update')).toBe(true);
    expect(can(['operator'], 'resource:delete')).toBe(false);
  });

  it('allows admins to delete resources', () => {
    expect(can(['admin'], 'resource:delete')).toBe(true);
  });
});
