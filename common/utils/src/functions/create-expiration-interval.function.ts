import { z } from 'zod';

const createExpirationIntervalSchema = z.object({
  seconds: z.number().min(0).optional().default(0),
  minutes: z.number().min(0).optional().default(0),
  hours: z.number().min(0).optional().default(0),
  days: z.number().min(0).optional().default(0),
});

export function createExpirationInterval(
  option: z.input<typeof createExpirationIntervalSchema>,
): Date {
  const parseResult = createExpirationIntervalSchema.safeParse(option);
  if (!parseResult.success) {
    throw new Error(parseResult.error.message);
  }
  const { seconds, minutes, hours, days } = parseResult.data;

  const denominator = (() => {
    const result =
      seconds + minutes * 60 + hours * 60 * 60 + days * 24 * 60 * 60;
    return (result ? result : 1) * 1000;
  })();

  return new Date(
    Math.floor(Date.now() / denominator) * denominator + denominator,
  );
}
