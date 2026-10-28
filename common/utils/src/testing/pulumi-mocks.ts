/**
 * Pulumi mocks 테스트 헬퍼 — common·infra 테스트 공용.
 *
 * 런타임 index(`@common/utils/src`)에서 export하지 않는다.
 * 테스트에서 `@common/utils/src/testing`으로 직접 import한다.
 */
import * as pulumi from '@pulumi/pulumi';

const UNWRAP_TIMEOUT_MS = 5000;

export function unwrap<T>(output: pulumi.Output<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(
        new Error(
          `unwrap timed out after ${UNWRAP_TIMEOUT_MS}ms: Output never resolved`,
        ),
      );
    }, UNWRAP_TIMEOUT_MS);

    output.apply(value => {
      clearTimeout(timeout);
      resolve(value);
      return value;
    });
  });
}

export interface InstallPulumiMocksOption {
  project?: string;
  stack?: string;
  organization?: string;
  onNewResource?: (args: pulumi.runtime.MockResourceArgs) => void;
  onCall?: (args: pulumi.runtime.MockCallArgs) => void;
  stateOverrides?: (
    args: pulumi.runtime.MockResourceArgs,
  ) => Record<string, unknown>;
  callResult?: (
    args: pulumi.runtime.MockCallArgs,
  ) => Record<string, unknown> | undefined;
}

export function installPulumiMocks(option?: InstallPulumiMocksOption): void {
  void pulumi.runtime.setMocks(
    {
      newResource: (args: pulumi.runtime.MockResourceArgs) => {
        option?.onNewResource?.(args);
        const overrides = option?.stateOverrides?.(args) ?? {};
        return {
          id: `${args.name}-id`,
          state: {
            ...args.inputs,
            ...overrides,
          },
        };
      },
      call: (args: pulumi.runtime.MockCallArgs) => {
        option?.onCall?.(args);
        return option?.callResult?.(args) ?? args.inputs;
      },
    },
    option?.project ?? 'unit',
    option?.stack ?? 'test',
    false,
    option?.organization,
  );
}

/**
 * mock 입력에서 secret은 `{ [specialSigKey]: specialSecretSig, value }`로 남는다.
 * 하위에 secret이 하나라도 섞이면 상위 객체 전체가 감싸지므로, 값 검증 전에 벗긴다.
 */
export function revealSecrets<T = any>(value: unknown): T {
  if (Array.isArray(value)) {
    return value.map(each => revealSecrets(each)) as T;
  }
  if (value === null || typeof value !== 'object') {
    return value as T;
  }
  const record = value as Record<string, unknown>;
  if (
    record[pulumi.runtime.specialSigKey] === pulumi.runtime.specialSecretSig
  ) {
    return revealSecrets(record.value);
  }
  return Object.fromEntries(
    Object.entries(record).map(([key, child]) => [key, revealSecrets(child)]),
  ) as T;
}

/**
 * mock `newResource`는 리소스 옵션(`protect`, `retainOnDelete` 등)을 받지 않는다.
 * 반환한 `transformation`을 컴포넌트 `opts.transformations`에 넣으면
 * 부모 → 자식으로 상속돼 자식 리소스 옵션을 이름별로 기록한다.
 */
export function createResourceOptionsRecorder(): {
  transformation: pulumi.ResourceTransformation;
  options: Map<string, { type: string; opts: pulumi.ResourceOptions }>;
} {
  const options = new Map<
    string,
    { type: string; opts: pulumi.ResourceOptions }
  >();
  return {
    transformation: args => {
      options.set(args.name, { type: args.type, opts: args.opts });
      return undefined;
    },
    options,
  };
}

/**
 * mock 리소스 등록은 비동기 RPC라 컴포넌트 output이 풀려도 남아 있을 수 있다.
 * `probe()`(예: 기록된 리소스 수)가 연속 `stableTicks`번 같으면 끝난 것으로 본다.
 */
export async function settle(
  probe: () => number,
  option?: { stableTicks?: number; timeoutMs?: number },
): Promise<void> {
  const stableTicks = option?.stableTicks ?? 20;
  const deadline = Date.now() + (option?.timeoutMs ?? UNWRAP_TIMEOUT_MS);
  let last = probe();
  let stable = 0;
  while (stable < stableTicks) {
    if (Date.now() > deadline) {
      throw new Error('settle timed out: resource registrations kept changing');
    }
    await new Promise(resolve => setImmediate(resolve));
    const current = probe();
    stable = current === last ? stable + 1 : 0;
    last = current;
  }
}
