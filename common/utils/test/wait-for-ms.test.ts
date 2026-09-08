import { waitForMs } from '../src/functions/wait-for-ms.function';

describe('waitForMs', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('resolves after the fake timer advances', async () => {
    const pending = waitForMs(50);
    jest.advanceTimersByTime(50);
    await expect(pending).resolves.toBeUndefined();
  });
});
