/**
 * `flat@6`는 ESM 전용이라 ts-jest(CJS)에서 require할 수 없다.
 * infra jest `moduleNameMapper`가 `flat`을 이 파일로 돌린다. 사용 중인 `flatten`만 구현.
 */
export function flatten(
  target: unknown,
  option?: { delimiter?: string },
): Record<string, unknown> {
  const delimiter = option?.delimiter ?? '.';
  const result: Record<string, unknown> = {};
  const walk = (value: unknown, prefix: string | undefined) => {
    const isBranch =
      value !== null &&
      typeof value === 'object' &&
      !Buffer.isBuffer(value) &&
      Object.keys(value).length > 0;
    if (prefix !== undefined && !isBranch) {
      result[prefix] = value;
      return;
    }
    for (const [key, child] of Object.entries(value as object)) {
      walk(child, prefix === undefined ? key : `${prefix}${delimiter}${key}`);
    }
  };
  walk(target, undefined);
  return result;
}
