import dedent from 'dedent';

/**
 * KV v2 UI 탐색 ACL. SecretV1 개발자 정책과 같은 형태.
 * 각 metadata prefix를 LIST (UI가 쓰는 trailing-slash 형태 포함).
 * leaf secret의 data+metadata만 READ.
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
