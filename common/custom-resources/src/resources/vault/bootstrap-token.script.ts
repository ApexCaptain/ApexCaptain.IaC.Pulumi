import { resolveBootstrapTokenV1 } from '../../data/vault/bootstrap-token.logic';

void (async () => {
  const rawArgs = process.env.BOOTSTRAP_ARGS;
  if (!rawArgs) {
    throw new Error('BOOTSTRAP_ARGS environment variable is required');
  }

  const args = JSON.parse(rawArgs);
  const result = await resolveBootstrapTokenV1(args);
  process.stdout.write(JSON.stringify(result));
})().catch(error => {
  console.error(error);
  process.exit(1);
});
