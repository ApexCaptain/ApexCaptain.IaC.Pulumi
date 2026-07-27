import { z } from 'zod';

/**
 * Common Argo CD RBAC resources.
 * @see https://argo-cd.readthedocs.io/en/stable/operator-manual/rbac/
 */
const argoCdPolicyResourceSchema = z.union([
  z.enum([
    'applications',
    'applicationsets',
    'applicationprojects',
    'clusters',
    'repositories',
    'accounts',
    'certificates',
    'gpgkeys',
    'logs',
    'exec',
    'extensions',
  ]),
  z.string().min(1),
]);

const argoCdPolicyActionSchema = z.union([
  z.enum([
    'get',
    'create',
    'update',
    'delete',
    'sync',
    'override',
    'action/*',
    '*',
  ]),
  z.string().min(1),
]);

const createArgoCdPolicyPermissionSchema = z.object({
  /** e.g. `role:deployer` */
  role: z.string().min(1),
  resource: argoCdPolicyResourceSchema,
  action: argoCdPolicyActionSchema,
  /**
   * Target scope.
   * - applications: `{project}/{app}` (e.g. `default/my-app`, or all projects/apps via wildcards)
   * - applicationprojects: project name (e.g. `default`)
   */
  object: z.string().min(1),
  effect: z.enum(['allow', 'deny']).default('allow'),
});

const createArgoCdPolicyBindingSchema = z.object({
  /** Local account, OIDC user, or group name */
  subject: z.string().min(1),
  /** e.g. `role:deployer` */
  role: z.string().min(1),
});

const createArgoCdPolicyCsvSchema = z.object({
  permissions: z.array(createArgoCdPolicyPermissionSchema).default([]),
  bindings: z.array(createArgoCdPolicyBindingSchema).default([]),
});

export type CreateArgoCdPolicyPermissionOption = z.input<
  typeof createArgoCdPolicyPermissionSchema
>;

export type CreateArgoCdPolicyBindingOption = z.input<
  typeof createArgoCdPolicyBindingSchema
>;

export type CreateArgoCdPolicyCsvOption = z.input<
  typeof createArgoCdPolicyCsvSchema
>;

/**
 * Builds one Argo CD Casbin `p` (permission) line.
 *
 * Format: `p, <role>, <resource>, <action>, <object>, <effect>`
 *
 * @example
 * ```ts
 * createArgoCdPolicyPermission({
 *   role: 'role:deployer',
 *   resource: 'applications',
 *   action: '*',
 *   object: 'default/my-app',
 * });
 * // p, role:deployer, applications, *, default/my-app, allow
 * ```
 */
export function createArgoCdPolicyPermission(
  option: CreateArgoCdPolicyPermissionOption,
): string {
  const parseResult = createArgoCdPolicyPermissionSchema.safeParse(option);
  if (!parseResult.success) {
    throw new Error(parseResult.error.message);
  }

  const { role, resource, action, object, effect } = parseResult.data;
  return ['p', role, resource, action, object, effect].join(', ');
}

/**
 * Builds one Argo CD Casbin `g` (binding) line.
 *
 * Format: `g, <subject>, <role>`
 *
 * @example
 * ```ts
 * createArgoCdPolicyBinding({
 *   subject: 'gitops-default-deployer',
 *   role: 'role:deployer',
 * });
 * // g, gitops-default-deployer, role:deployer
 * ```
 */
export function createArgoCdPolicyBinding(
  option: CreateArgoCdPolicyBindingOption,
): string {
  const parseResult = createArgoCdPolicyBindingSchema.safeParse(option);
  if (!parseResult.success) {
    throw new Error(parseResult.error.message);
  }

  const { subject, role } = parseResult.data;
  return ['g', subject, role].join(', ');
}

/**
 * Builds a full Argo CD `policy.csv` string (no header).
 *
 * Suitable for Helm `configs.rbac['policy.csv']`.
 *
 * @example
 * ```ts
 * createArgoCdPolicyCsv({
 *   permissions: [
 *     {
 *       role: 'role:deployer',
 *       resource: 'applications',
 *       action: '*',
 *       object: 'default/my-app',
 *     },
 *     {
 *       role: 'role:deployer',
 *       resource: 'applicationprojects',
 *       action: 'get',
 *       object: 'default',
 *     },
 *   ],
 *   bindings: [
 *     { subject: 'gitops-default-deployer', role: 'role:deployer' },
 *   ],
 * });
 * ```
 *
 * @see https://argo-cd.readthedocs.io/en/stable/operator-manual/rbac/
 */
export function createArgoCdPolicyCsv(
  option: CreateArgoCdPolicyCsvOption,
): string {
  const parseResult = createArgoCdPolicyCsvSchema.safeParse(option);
  if (!parseResult.success) {
    throw new Error(parseResult.error.message);
  }

  const { permissions, bindings } = parseResult.data;
  return [
    ...permissions.map(permission => createArgoCdPolicyPermission(permission)),
    ...bindings.map(binding => createArgoCdPolicyBinding(binding)),
  ].join('\n');
}
