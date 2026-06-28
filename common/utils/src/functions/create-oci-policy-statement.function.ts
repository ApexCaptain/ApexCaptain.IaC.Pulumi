import { z } from 'zod';

/**
 * IAM policy principal (subject).
 *
 * - `any-user` / `any-group`: tenancy-wide principals. Prefer `any-group` with a
 *   `where` condition over bare `any-user` when possible.
 * - `group` / `group-id`: typical choice for human or machine users placed in a group.
 * - `domain`: Identity Domains prefix for group names (e.g. `Default/vault-kms-unseal`).
 * - `service`: OCI integrated services (e.g. `objectstorage-us-ashburn-1`).
 *
 * @see https://docs.oracle.com/en-us/iaas/Content/Identity/Concepts/policysyntax.htm#Subject
 */
const ociPolicySubjectSchema = z.union([
  z.literal('any-user'),
  z.literal('any-group'),
  z.object({
    type: z.enum([
      'group',
      'group-id',
      'dynamic-group',
      'dynamic-group-id',
      'user',
      'user-id',
      'service',
    ]),
    targets: z.array(z.string().min(1)).min(1),
    /** Identity Domains name; prepended to each group target as `<domain>/<name>`. */
    domain: z.string().min(1).optional(),
  }),
]);

/**
 * Policy scope. Policies attach to a tenancy or compartment; `expression` may be a
 * name, OCID, or colon-separated compartment path (`parent:child`).
 */
const ociPolicyLocationSchema = z.union([
  z.literal('tenancy'),
  z.object({
    type: z.enum(['compartment', 'compartment-id']),
    expression: z.string().min(1),
  }),
]);

const createOciPolicyStatementSchema = z.object({
  subject: ociPolicySubjectSchema,
  /**
   * Least → most privilege: inspect, read, use, manage.
   * Effective API operations depend on the paired `resourceType`.
   */
  verb: z.enum(['inspect', 'read', 'use', 'manage']),
  /** e.g. `keys`, `vaults`, `all-resources`, `instance-family` */
  resourceType: z.string().min(1),
  location: ociPolicyLocationSchema,
  /**
   * Raw condition body without the leading `where`.
   * e.g. `target.key.id = 'ocid1.key...'`
   */
  condition: z.string().min(1).optional(),
});

export type CreateOciPolicyStatementOption = z.input<
  typeof createOciPolicyStatementSchema
>;

/** Formats multiple OCIDs: `ocid1..., id ocid2...` (OCI repeats `id` after the first). */
const formatOciIdTargets = (ids: string[]): string => {
  return ids
    .map((id, index) => {
      return index === 0 ? id : `id ${id}`;
    })
    .join(', ');
};

const formatOciPolicySubject = (
  subject: z.output<typeof ociPolicySubjectSchema>,
): string => {
  if (subject === 'any-user' || subject === 'any-group') {
    return subject;
  }

  const { type, targets, domain } = subject;

  switch (type) {
    case 'group': {
      const groupNames = targets.map(target => {
        return domain ? `${domain}/${target}` : target;
      });
      return `group ${groupNames.join(', ')}`;
    }
    case 'group-id':
      return `group id ${formatOciIdTargets(targets)}`;
    case 'dynamic-group':
      return `dynamic-group ${targets.join(', ')}`;
    case 'dynamic-group-id':
      return `dynamic-group id ${formatOciIdTargets(targets)}`;
    case 'user':
      return `user ${targets.join(', ')}`;
    case 'user-id':
      return `user id ${formatOciIdTargets(targets)}`;
    case 'service':
      return `service ${targets.join(', ')}`;
  }
};

const formatOciPolicyLocation = (
  location: z.output<typeof ociPolicyLocationSchema>,
): string => {
  if (location === 'tenancy') {
    return 'tenancy';
  }

  if (location.type === 'compartment-id') {
    return `compartment id ${location.expression}`;
  }

  return `compartment ${location.expression}`;
};

/**
 * Builds a single Oracle Cloud Infrastructure IAM policy statement.
 *
 * Syntax: `Allow <subject> to <verb> <resource-type> in <location> [where <conditions>]`
 *
 * Returns a single-line string suitable for `oci.identity.Policy.statements`.
 *
 * @example
 * ```ts
 * createOciPolicyStatement({
 *   subject: { type: 'group', targets: ['vault-kms-unseal'] },
 *   verb: 'use',
 *   resourceType: 'keys',
 *   location: { type: 'compartment-id', expression: compartmentOcid },
 *   condition: `target.key.id = '${keyOcid}'`,
 * });
 * // Allow group vault-kms-unseal to use keys in compartment id ocid1... where target.key.id = 'ocid1...'
 * ```
 *
 * @see https://docs.oracle.com/en-us/iaas/Content/Identity/Concepts/policysyntax.htm
 * @see https://docs.oracle.com/en-us/iaas/Content/Identity/Reference/policyreference.htm#Verbs
 * @see https://docs.oracle.com/en-us/iaas/Content/Identity/policyreference/policyreference_topic-ResourceTypes.htm
 */
export function createOciPolicyStatement(
  option: CreateOciPolicyStatementOption,
): string {
  const parseResult = createOciPolicyStatementSchema.safeParse(option);
  if (!parseResult.success) {
    throw new Error(parseResult.error.message);
  }

  const { subject, verb, resourceType, location, condition } = parseResult.data;
  const statement = [
    'Allow',
    formatOciPolicySubject(subject),
    `to ${verb} ${resourceType}`,
    `in ${formatOciPolicyLocation(location)}`,
  ];

  if (condition) {
    statement.push(`where ${condition}`);
  }

  return statement.join(' ');
}
