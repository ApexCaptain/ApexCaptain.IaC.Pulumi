import dedent from 'dedent';

/**
 * KV v2 UI browse ACL — same shape as SecretV1 developer policy.
 * LIST each metadata prefix (and trailing-slash form the UI uses).
 * READ only the leaf secret data+metadata.
 */
export function kvV2UiBrowsePolicy(args: {
  kvMount: string;
  pathSegments: string[];
  readSecretPaths: string[];
}): string {
  const segments = args.pathSegments
    .map(segment => segment.toLocaleLowerCase())
    .filter(Boolean);

  const listRules = [
    dedent`
      path "${args.kvMount}/metadata/" {
        capabilities = ["list"]
      }
    `,
    ...segments.flatMap((_, index) => {
      const prefix = segments.slice(0, index + 1).join('/');
      return [
        dedent`
          path "${args.kvMount}/metadata/${prefix}" {
            capabilities = ["list"]
          }
        `,
        dedent`
          path "${args.kvMount}/metadata/${prefix}/" {
            capabilities = ["list"]
          }
        `,
      ];
    }),
  ].join('\n');

  const readRules = args.readSecretPaths
    .map(
      secretPath => dedent`
        path "${args.kvMount}/data/${secretPath}" {
          capabilities = ["read"]
        }
        path "${args.kvMount}/metadata/${secretPath}" {
          capabilities = ["read"]
        }
      `,
    )
    .join('\n');

  return `${listRules}\n${readRules}`.trim();
}
