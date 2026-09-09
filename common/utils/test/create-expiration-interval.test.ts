import { createExpirationInterval } from '../src/functions/create-expiration-interval.function';

describe('createExpirationInterval', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: 10_000 });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('empty option uses 1s buckets', () => {
    expect(createExpirationInterval({}).getTime()).toBe(11_000);
  });

  test('5 second buckets from now=10000', () => {
    expect(createExpirationInterval({ seconds: 5 }).getTime()).toBe(15_000);
  });

  test('throws on negative unit', () => {
    expect(() => createExpirationInterval({ seconds: -1 })).toThrow();
  });
});
