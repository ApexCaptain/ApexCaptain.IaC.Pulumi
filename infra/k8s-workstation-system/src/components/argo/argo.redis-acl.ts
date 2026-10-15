import { createHash } from 'node:crypto';

/**
 * Redis ACL 한 줄 (SHA256 해시 비밀번호).
 * OT Operator health probe·복제 masterauth는 default 사용자 비밀번호를 쓴다.
 */
export function buildRedisAclUserLine(
  username: string,
  password: string,
): string {
  const hash = createHash('sha256').update(password).digest('hex');
  return `user ${username} on #${hash} ~* &* +@all`;
}

export function buildRedisDefaultAclUserLine(password: string): string {
  return buildRedisAclUserLine('default', password);
}
