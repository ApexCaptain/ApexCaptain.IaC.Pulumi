import { statefulResourceOptions } from '../src/configs/stateful-resource-options.config';

describe('statefulResourceOptions', () => {
  test('protects and retains on delete', () => {
    expect(statefulResourceOptions).toEqual({
      protect: true,
      retainOnDelete: true,
    });
  });

  test('is frozen', () => {
    expect(Object.isFrozen(statefulResourceOptions)).toBe(true);
  });
});
