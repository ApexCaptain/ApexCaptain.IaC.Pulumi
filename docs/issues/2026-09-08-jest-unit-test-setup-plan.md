# Jest Spec 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Projen으로 `@common/utils`와 `@common/custom-resources`에만 Jest를 켜고, utils 순수 함수 characterization 테스트와 Pulumi mock 샘플 3개를 초록으로 만든다.

**Architecture:** 루트 `sharedProjectOption.jest`는 `false`로 둔다. `inflateCommonProject({ jest: true })`만 두 패키지에 적용한다. 테스트는 각 패키지 `test/*.test.ts`. Pulumi mock 헬퍼는 `custom-resources/test/pulumi-mocks.ts`에만 둔다. utils는 custom-resources를 import하지 않는다.

**Tech Stack:** Projen `TypeScriptProject` Jest (`jest` + `ts-jest` + `@types/jest`), Pulumi `runtime.setMocks`, pnpm workspace, turbo `test`.

**Spec:** [2026-09-08-jest-unit-test-setup.md](./2026-09-08-jest-unit-test-setup.md)

## Global Constraints

- 프로덕션 `src` 동작 변경 금지. 테스트가 현재 구현과 다르면 테스트를 고친다.
- `jest.config.json` / `package.json` Jest deps는 손으로 쓰지 않는다. `.projenrc.ts` 수정 후 `pnpm exec projen`.
- 테스트 파일은 `test/*.test.ts`만. `src` 옆 `*.test.ts` 금지.
- `testMatch`는 `**/test/**/*.test.ts`만. infra Coder 템플릿 `assets/.../test`를 건드리지 않는다.
- Mocha 금지. GitHub Actions 금지. 라이브 클러스터·Vault·Cloudflare 호출 금지.
- `@common/utils` 테스트는 `@common/custom-resources`를 import하지 않는다.
- 커밋은 사용자가 이 세션에서 요청했을 때만. 요청 없으면 각 Task의 Commit 스텝을 건너뛴다.
- TypeScript는 패키지 `^6`. Projen이 넣는 `ts-jest`가 synth 또는 `pnpm test`에서 버전 에러를 내면 `.projenrc.ts`의 해당 패키지 `devDeps`에 호환 `ts-jest`를 명시한다. src 로직으로 우회하지 않는다.

## File structure

| 경로 | 역할 |
|---|---|
| `.projenrc.ts` | `inflateCommonProject` jest 옵션, utils/custom-resources ON, turbo `test.dependsOn`, 루트 `test:workspaces` |
| `common/utils/test/*.test.ts` | 순수 함수 + `defineComponent` characterization |
| `common/custom-resources/test/pulumi-mocks.ts` | `installPulumiMocks` + `unwrap`. Spec 2 재사용 |
| `common/custom-resources/test/text-file-v1.test.ts` | Command mock inputs (`chmod`) |
| `common/custom-resources/test/private-key-v1.test.ts` | `defineComponent` tls private key |
| `common/custom-resources/test/virtual-service-v1.test.ts` | Istio CRD apiVersion/kind |
| 생성: `common/{utils,custom-resources}/jest.config.json` | Projen. 손 편집 금지 |

---

### Task 1: Projen Jest opt-in

**Files:**
- Modify: `.projenrc.ts` (`inflateCommonProject` option 타입 ~372행, `utilsProject`/`customResourcesProject` 호출, `turbo.json` tasks.test, `rootProject.addScripts`)
- Generated (do not hand-edit): `common/utils/package.json`, `common/custom-resources/package.json`, `common/utils/jest.config.json`, `common/custom-resources/jest.config.json`, `turbo.json`, 루트 `package.json`

**Interfaces:**
- Consumes: 기존 `inflateCommonProject` option
- Produces: `inflateCommonProject({ jest?: boolean })`. `jest: true`인 패키지만 Jest 런타임

- [ ] **Step 1: `inflateCommonProject`에 `jest` 옵션을 넣는다**

`inflateCommonProject` option 타입에 `jest?: boolean`을 추가한다.

`TypeScriptProject` options IIFE 안에, `devDirs`/`tsconfigDev` 근처에 아래를 넣는다. `sharedProjectOption.jest: false`를 덮어쓴다.

```typescript
        eslintOptions: {
          dirs: [src.constants.paths.dirs.srcDir],
          devdirs: option.jest
            ? [src.constants.paths.dirs.scriptDir, 'test']
            : [src.constants.paths.dirs.scriptDir],
          tsconfigPath: './test/tsconfig.json',
          projectService: false,
        },
        ...(option.jest
          ? {
              jest: true,
              jestOptions: {
                jestConfig: {
                  testMatch: ['**/test/**/*.test.ts'],
                  passWithNoTests: true,
                },
              },
            }
          : { jest: false }),
```

- [ ] **Step 2: utils와 custom-resources에 `jest: true`**

```typescript
    const utilsProject = inflateCommonProject({
      projectName: 'utils',
      deps: ['zod'],
      jest: true,
    });

    const customResourcesProject = inflateCommonProject({
      projectName: 'custom-resources',
      commonDeps: [
        utilsProject.project.package.packageName,
        bridgedProviderProject.project.package.packageName,
      ],
      deps: [
        src.constants.pulumiPackages.kubernetes,
        src.constants.pulumiPackages.command,
        src.constants.pulumiPackages.tls,
        src.constants.pulumiPackages.random,
        src.constants.pulumiPackages.vault,
        'axios',
        'flat',
        '@kubernetes/client-node',
      ],
      devDeps: ['@types/ws'],
      jest: true,
    });
```

다른 `inflateCommonProject` 호출(`bridged-provider`, `nexus`)에는 `jest`를 넣지 않는다.

- [ ] **Step 3: turbo `test.dependsOn`과 루트 스크립트**

`turbo.json` 생성 블록:

```typescript
        test: {
          dependsOn: ['^build'],
        },
```

`rootProject.addScripts`에 `build:workspaces` 바로 아래:

```typescript
    'test:workspaces': `turbo run test --filter ${workspacePackageFilters}`,
```

- [ ] **Step 4: synth**

Repo root:

```bash
pnpm exec projen
```

Expected: 성공. `postprojen`이 `pnpm build`를 돌린다. 아직 `*.test.ts`가 없으므로 `passWithNoTests` 때문에 Jest는 통과해야 한다.

실패하고 메시지가 `ts-jest` / TypeScript 6 호환이면, `customResourcesProject`와 `utilsProject`의 `devDeps`에 Projen이 고른 것과 충돌하지 않는 `ts-jest` 버전을 `inflateCommonProject` `devDeps`로 넘긴 뒤 다시 `pnpm exec projen`. src는 건드리지 않는다.

- [ ] **Step 5: 생성 결과 확인**

```bash
rg -n '"jest"' common/utils/package.json common/custom-resources/package.json package.json infra/k8s-workstation-tools/package.json
ls common/utils/jest.config.json common/custom-resources/jest.config.json
rg -n 'testMatch|passWithNoTests' common/utils/jest.config.json
```

Expected:

- `common/utils/package.json`와 `common/custom-resources/package.json`의 `devDependencies`에 `jest`, `ts-jest`, `@types/jest`
- 루트 `package.json`과 `infra/k8s-workstation-tools/package.json`에는 jest 의존성 없음
- 두 패키지에 `jest.config.json` 존재
- `testMatch`가 `**/test/**/*.test.ts`, `passWithNoTests` true

```bash
pnpm --filter @common/utils test
pnpm --filter @common/custom-resources test
pnpm --filter @infra/k8s-workstation-tools test
```

Expected: utils/custom-resources는 Jest(테스트 0개) + eslint. k8s-workstation-tools는 eslint만 (Jest 미실행). Coder `assets/coder/sysbox-ubuntu/test` JS를 Jest가 돌리지 않음.

- [ ] **Step 6: Commit** (사용자 요청 시에만)

```bash
git add .projenrc.ts common/utils/package.json common/custom-resources/package.json common/utils/jest.config.json common/custom-resources/jest.config.json turbo.json package.json pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
test: enable Projen Jest for utils and custom-resources

EOF
)"
```

생성 파일이 더 있으면 status를 보고 같은 커밋에 포함한다. `docs/superpowers`는 add하지 않는다.

---

### Task 2: kebabCase · isValidFileModeString

**Files:**
- Create: `common/utils/test/kebab-case.test.ts`
- Create: `common/utils/test/is-valid-file-mode-string.test.ts`
- Test: 위 두 파일
- Do not modify: `common/utils/src/functions/kebab-case.function.ts`, `is-valid-file-mode-string.function.ts`

**Interfaces:**
- Consumes: `kebabCase(value: string): string`, `isValidFileModeString(fileModeString: string): boolean`
- Produces: 없음

- [ ] **Step 1: kebab-case 테스트 작성**

`common/utils/test/kebab-case.test.ts`:

```typescript
import { kebabCase } from '../src/functions/kebab-case.function';

describe('kebabCase', () => {
  test('preserves k8s token that lodash would split', () => {
    expect(kebabCase('k8s')).toBe('k8s');
    expect(kebabCase('MyK8sCluster')).toBe('my-k8s-cluster');
    expect(kebabCase('k8sWorkstation')).toBe('k8s-workstation');
  });

  test('kebab-cases ordinary PascalCase', () => {
    expect(kebabCase('HelloWorld')).toBe('hello-world');
  });
});
```

- [ ] **Step 2: file mode 테스트 작성**

`common/utils/test/is-valid-file-mode-string.test.ts`:

```typescript
import { isValidFileModeString } from '../src/functions/is-valid-file-mode-string.function';

describe('isValidFileModeString', () => {
  test.each(['600', '0644', '1755', '4755'])(
    'accepts octal %s',
    mode => {
      expect(isValidFileModeString(mode)).toBe(true);
    },
  );

  test.each(['u=rw,go=', 'a+r', 'go-w', 'u+s', 'a+X'])(
    'accepts symbolic %s',
    mode => {
      expect(isValidFileModeString(mode)).toBe(true);
    },
  );

  test('rejects empty and whitespace', () => {
    expect(isValidFileModeString('')).toBe(false);
    expect(isValidFileModeString('   ')).toBe(false);
  });

  test('rejects malformed tokens', () => {
    expect(isValidFileModeString('999')).toBe(false);
    expect(isValidFileModeString('rwxrwxrwx')).toBe(false);
    expect(isValidFileModeString('u+')).toBe(false);
    expect(isValidFileModeString('u=rw,')).toBe(false);
  });
});
```

- [ ] **Step 3: 실행**

```bash
pnpm --filter @common/utils test -- test/kebab-case.test.ts test/is-valid-file-mode-string.test.ts
```

Expected: PASS. FAIL이면 src를 고치지 말고 테스트 expected를 현재 구현에 맞춘다. `999`가 octal regex `^[0-7]{3,4}$`에 안 걸리는 것이 맞다.

- [ ] **Step 4: Commit** (사용자 요청 시에만)

```bash
git add common/utils/test/kebab-case.test.ts common/utils/test/is-valid-file-mode-string.test.ts
git commit -m "$(cat <<'EOF'
test: cover kebabCase and file mode helpers

EOF
)"
```

---

### Task 3: Argo CD · OCI policy 빌더

**Files:**
- Create: `common/utils/test/create-argo-cd-policy-csv.test.ts`
- Create: `common/utils/test/create-oci-policy-statement.test.ts`
- Do not modify: 대응 `src/functions/*.function.ts`

**Interfaces:**
- Consumes: `createArgoCdPolicyPermission`, `createArgoCdPolicyBinding`, `createArgoCdPolicyCsv`, `createOciPolicyStatement`
- Produces: 없음

- [ ] **Step 1: Argo CD 테스트 작성**

`common/utils/test/create-argo-cd-policy-csv.test.ts`:

```typescript
import {
  createArgoCdPolicyBinding,
  createArgoCdPolicyCsv,
  createArgoCdPolicyPermission,
} from '../src/functions/create-argo-cd-policy-csv.function';

describe('createArgoCdPolicyPermission', () => {
  test('formats a Casbin p line with default allow', () => {
    expect(
      createArgoCdPolicyPermission({
        role: 'role:deployer',
        resource: 'applications',
        action: '*',
        object: 'default/my-app',
      }),
    ).toBe('p, role:deployer, applications, *, default/my-app, allow');
  });

  test('throws on empty role', () => {
    expect(() =>
      createArgoCdPolicyPermission({
        role: '',
        resource: 'applications',
        action: 'get',
        object: 'default/app',
      }),
    ).toThrow();
  });
});

describe('createArgoCdPolicyBinding', () => {
  test('formats a Casbin g line', () => {
    expect(
      createArgoCdPolicyBinding({
        subject: 'gitops-default-deployer',
        role: 'role:deployer',
      }),
    ).toBe('g, gitops-default-deployer, role:deployer');
  });
});

describe('createArgoCdPolicyCsv', () => {
  test('joins permissions then bindings', () => {
    expect(
      createArgoCdPolicyCsv({
        permissions: [
          {
            role: 'role:deployer',
            resource: 'applications',
            action: '*',
            object: 'default/my-app',
          },
        ],
        bindings: [
          { subject: 'gitops-default-deployer', role: 'role:deployer' },
        ],
      }),
    ).toBe(
      [
        'p, role:deployer, applications, *, default/my-app, allow',
        'g, gitops-default-deployer, role:deployer',
      ].join('\n'),
    );
  });
});
```

- [ ] **Step 2: OCI 테스트 작성**

`common/utils/test/create-oci-policy-statement.test.ts`:

```typescript
import { createOciPolicyStatement } from '../src/functions/create-oci-policy-statement.function';

describe('createOciPolicyStatement', () => {
  test('formats group + compartment-id + condition', () => {
    expect(
      createOciPolicyStatement({
        subject: { type: 'group', targets: ['vault-kms-unseal'] },
        verb: 'use',
        resourceType: 'keys',
        location: {
          type: 'compartment-id',
          expression: 'ocid1.compartment.example',
        },
        condition: "target.key.id = 'ocid1.key.example'",
      }),
    ).toBe(
      "Allow group vault-kms-unseal to use keys in compartment id ocid1.compartment.example where target.key.id = 'ocid1.key.example'",
    );
  });

  test('formats any-user in tenancy', () => {
    expect(
      createOciPolicyStatement({
        subject: 'any-user',
        verb: 'inspect',
        resourceType: 'all-resources',
        location: 'tenancy',
      }),
    ).toBe('Allow any-user to inspect all-resources in tenancy');
  });

  test('prefixes Identity Domain on group names', () => {
    expect(
      createOciPolicyStatement({
        subject: {
          type: 'group',
          targets: ['vault-kms-unseal'],
          domain: 'Default',
        },
        verb: 'read',
        resourceType: 'vaults',
        location: 'tenancy',
      }),
    ).toBe(
      'Allow group Default/vault-kms-unseal to read vaults in tenancy',
    );
  });

  test('throws on empty resourceType', () => {
    expect(() =>
      createOciPolicyStatement({
        subject: 'any-group',
        verb: 'read',
        resourceType: '',
        location: 'tenancy',
      }),
    ).toThrow();
  });
});
```

- [ ] **Step 3: 실행**

```bash
pnpm --filter @common/utils test -- test/create-argo-cd-policy-csv.test.ts test/create-oci-policy-statement.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit** (사용자 요청 시에만)

```bash
git add common/utils/test/create-argo-cd-policy-csv.test.ts common/utils/test/create-oci-policy-statement.test.ts
git commit -m "$(cat <<'EOF'
test: cover Argo CD and OCI policy string builders

EOF
)"
```

---

### Task 4: mergeCustomizer · toCloudflareRecordFqdn

**Files:**
- Create: `common/utils/test/merge-customizer.test.ts`
- Create: `common/utils/test/to-cloudflare-record-fqdn.test.ts`
- Do not modify: 대응 src

**Interfaces:**
- Consumes: `mergeCustomizer(value: unknown, srcValue: unknown): unknown`, `toCloudflareRecordFqdn`
- Produces: 없음

- [ ] **Step 1: mergeCustomizer 테스트 작성**

`common/utils/test/merge-customizer.test.ts`:

```typescript
import _ from 'lodash';
import { mergeCustomizer } from '../src/functions/merge-customizer.function';

describe('mergeCustomizer', () => {
  test('concats arrays then uniq and sort', () => {
    expect(mergeCustomizer(['b', 'a'], ['a', 'c'])).toEqual(['a', 'b', 'c']);
  });

  test('returns undefined for non-arrays so lodash default merge runs', () => {
    expect(mergeCustomizer({ a: 1 }, { b: 2 })).toBeUndefined();
  });

  test('works as lodash mergeWith customizer', () => {
    expect(
      _.mergeWith({ arr: [2, 1] }, { arr: [1, 3] }, mergeCustomizer),
    ).toEqual({ arr: [1, 2, 3] });
  });
});
```

- [ ] **Step 2: Cloudflare FQDN 테스트 작성**

`common/utils/test/to-cloudflare-record-fqdn.test.ts`:

```typescript
import * as pulumi from '@pulumi/pulumi';
import { toCloudflareRecordFqdn } from '../src/functions/to-cloudflare-record-fqdn.function';

function unwrap<T>(output: pulumi.Output<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    output.apply(value => {
      resolve(value);
      return value;
    });
    // Output errors surface via unhandled apply; keep tests on plain values too.
    void reject;
  });
}

describe('toCloudflareRecordFqdn', () => {
  test('apex aliases', () => {
    expect(toCloudflareRecordFqdn('@', 'example.com')).toBe('example.com');
    expect(toCloudflareRecordFqdn('example.com', 'example.com')).toBe(
      'example.com',
    );
  });

  test('appends zone when given a subdomain label', () => {
    expect(toCloudflareRecordFqdn('www', 'example.com')).toBe(
      'www.example.com',
    );
  });

  test('keeps an already-qualified name', () => {
    expect(toCloudflareRecordFqdn('www.example.com', 'example.com')).toBe(
      'www.example.com',
    );
  });

  test('unwraps pulumi Output inputs', async () => {
    const fqdn = toCloudflareRecordFqdn(
      pulumi.output('www'),
      pulumi.output('example.com'),
    );
    expect(pulumi.Output.isInstance(fqdn)).toBe(true);
    await expect(unwrap(fqdn as pulumi.Output<string>)).resolves.toBe(
      'www.example.com',
    );
  });
});
```

`void reject`가 eslint에 걸리면 `reject`를 쓰지 말고 resolve-only Promise로 둔다:

```typescript
function unwrap<T>(output: pulumi.Output<T>): Promise<T> {
  return new Promise(resolve => {
    output.apply(value => {
      resolve(value);
      return value;
    });
  });
}
```

- [ ] **Step 3: 실행**

```bash
pnpm --filter @common/utils test -- test/merge-customizer.test.ts test/to-cloudflare-record-fqdn.test.ts
```

Expected: PASS. Output 테스트가 Pulumi engine 에러로 죽으면 이 파일 상단에 Task 6과 같은 `pulumi.runtime.setMocks` 4줄(newResource/call identity)을 넣고 다시 실행. src는 변경하지 않는다.

- [ ] **Step 4: Commit** (사용자 요청 시에만)

```bash
git add common/utils/test/merge-customizer.test.ts common/utils/test/to-cloudflare-record-fqdn.test.ts
git commit -m "$(cat <<'EOF'
test: cover mergeCustomizer and Cloudflare FQDN helper

EOF
)"
```

---

### Task 5: 타이머 · stack stage fallback

**Files:**
- Create: `common/utils/test/create-expiration-interval.test.ts`
- Create: `common/utils/test/wait-for-ms.test.ts`
- Create: `common/utils/test/resolve-referenced-stack-stage.test.ts`
- Do not modify: src

**Interfaces:**
- Consumes: `createExpirationInterval`, `waitForMs`, `resolveReferencedStackStage`
- Produces: 없음

- [ ] **Step 1: expiration 테스트 작성**

`common/utils/test/create-expiration-interval.test.ts`:

```typescript
import { createExpirationInterval } from '../src/functions/create-expiration-interval.function';

describe('createExpirationInterval', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: 10_000 });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('empty option uses 1s buckets', () => {
    // all zeros → denominator 1000. floor(10000/1000)*1000 + 1000 = 11000
    expect(createExpirationInterval({}).getTime()).toBe(11_000);
  });

  test('5 second buckets from now=10000', () => {
    // denom 5000. floor(10000/5000)*5000 + 5000 = 15000
    expect(createExpirationInterval({ seconds: 5 }).getTime()).toBe(15_000);
  });

  test('throws on negative unit', () => {
    expect(() => createExpirationInterval({ seconds: -1 })).toThrow();
  });
});
```

- [ ] **Step 2: waitForMs 테스트 작성**

`common/utils/test/wait-for-ms.test.ts`:

```typescript
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
```

- [ ] **Step 3: stack fallback 테스트 작성**

`common/utils/test/resolve-referenced-stack-stage.test.ts`:

```typescript
import fs from 'fs';
import os from 'os';
import path from 'path';
import { resolveReferencedStackStage } from '../src/configs/stack-stage-fallback.config';
import { StackStage } from '../src/enums/stack-stage.enum';

describe('resolveReferencedStackStage', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stack-fallback-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('falls back from dev to prod when only Pulumi.prod.yaml exists', () => {
    fs.writeFileSync(path.join(tmpDir, 'Pulumi.prod.yaml'), '{}');
    expect(
      resolveReferencedStackStage('k8s-workstation-system', 'dev', tmpDir),
    ).toBe(StackStage.PROD);
  });

  test('returns caller stage when that yaml exists', () => {
    fs.writeFileSync(path.join(tmpDir, 'Pulumi.dev.yaml'), '{}');
    fs.writeFileSync(path.join(tmpDir, 'Pulumi.prod.yaml'), '{}');
    expect(
      resolveReferencedStackStage('k8s-workstation-tools', 'dev', tmpDir),
    ).toBe(StackStage.DEV);
  });

  test('throws on unknown stage', () => {
    expect(() =>
      resolveReferencedStackStage('k8s-workstation-system', 'staging', tmpDir),
    ).toThrow(/Unknown stack stage/);
  });

  test('throws when no candidate yaml exists', () => {
    expect(() =>
      resolveReferencedStackStage('k8s-workstation-system', 'dev', tmpDir),
    ).toThrow(/Stack stage fallback not found/);
  });
});
```

- [ ] **Step 4: 실행**

```bash
pnpm --filter @common/utils test -- test/create-expiration-interval.test.ts test/wait-for-ms.test.ts test/resolve-referenced-stack-stage.test.ts
```

Expected: PASS. fake timers API가 Jest 버전에 없으면 `jest.useFakeTimers(); jest.setSystemTime(10_000);`으로 바꾸고 재실행.

- [ ] **Step 5: Commit** (사용자 요청 시에만)

```bash
git add common/utils/test/create-expiration-interval.test.ts common/utils/test/wait-for-ms.test.ts common/utils/test/resolve-referenced-stack-stage.test.ts
git commit -m "$(cat <<'EOF'
test: cover expiration, waitForMs, and stack stage fallback

EOF
)"
```

---

### Task 6: defineComponent (utils, 자체 mocks)

**Files:**
- Create: `common/utils/test/define-component.test.ts`
- Do not modify: `common/utils/src/functions/define-component.function.ts`
- Do not import: `common/custom-resources/**`

**Interfaces:**
- Consumes: `defineComponent(type, inflate)` → constructor `(name, args, opts?)`
- Produces: 없음. `super` 타입이 `Component:${type}` 인 것은 이 테스트로 고정

- [ ] **Step 1: 테스트 작성**

`common/utils/test/define-component.test.ts`:

```typescript
import * as pulumi from '@pulumi/pulumi';

pulumi.runtime.setMocks(
  {
    newResource: (args: pulumi.runtime.MockResourceArgs) => ({
      id: `${args.name}-id`,
      state: args.inputs,
    }),
    call: (args: pulumi.runtime.MockCallArgs) => args.inputs,
  },
  'utils-unit',
  'test',
  false,
);

function unwrap<T>(output: pulumi.Output<T>): Promise<T> {
  return new Promise(resolve => {
    output.apply(value => {
      resolve(value);
      return value;
    });
  });
}

describe('defineComponent', () => {
  test('registers output and secret from inflate', async () => {
    const { defineComponent } = await import(
      '../src/functions/define-component.function'
    );

    const Probe = defineComponent<{ marker: string }, { marker: string }, object>(
      'unit:probe:v1',
      args => ({
        output: pulumi.output({ marker: args.marker }),
        secret: pulumi.output({}),
      }),
    );

    const probe = new Probe('probe', { marker: 'ok' });
    await expect(unwrap(probe.output)).resolves.toEqual({ marker: 'ok' });
    await expect(unwrap(probe.secret)).resolves.toEqual({});
  });
});
```

- [ ] **Step 2: 실행**

```bash
pnpm --filter @common/utils test -- test/define-component.test.ts
```

Expected: PASS.

- [ ] **Step 3: utils 전체**

```bash
pnpm --filter @common/utils test
```

Expected: Task 2–6 파일 전부 PASS + eslint.

- [ ] **Step 4: Commit** (사용자 요청 시에만)

```bash
git add common/utils/test/define-component.test.ts
git commit -m "$(cat <<'EOF'
test: cover defineComponent with Pulumi mocks

EOF
)"
```

---

### Task 7: custom-resources mock harness

**Files:**
- Create: `common/custom-resources/test/pulumi-mocks.ts`

**Interfaces:**
- Consumes: `@pulumi/pulumi` runtime
- Produces:
  - `installPulumiMocks(option?: { onNewResource?: (args: pulumi.runtime.MockResourceArgs) => void }): void`
  - `unwrap<T>(output: pulumi.Output<T>): Promise<T>`
  - Spec 2와 Task 8–10이 이 두 함수만 쓴다

- [ ] **Step 1: 헬퍼 작성**

`common/custom-resources/test/pulumi-mocks.ts`:

```typescript
import * as pulumi from '@pulumi/pulumi';

export function unwrap<T>(output: pulumi.Output<T>): Promise<T> {
  return new Promise(resolve => {
    output.apply(value => {
      resolve(value);
      return value;
    });
  });
}

export function installPulumiMocks(option?: {
  onNewResource?: (args: pulumi.runtime.MockResourceArgs) => void;
}): void {
  pulumi.runtime.setMocks(
    {
      newResource: (args: pulumi.runtime.MockResourceArgs) => {
        option?.onNewResource?.(args);
        return {
          id: `${args.name}-id`,
          state: {
            ...args.inputs,
            privateKeyOpenssh: 'mock-openssh',
            privateKeyPem: 'mock-pem',
            publicKeyOpenssh: 'mock-pub-openssh',
            publicKeyPem: 'mock-pub-pem',
            result: args.inputs.result ?? `${args.name}-id`,
          },
        };
      },
      call: (args: pulumi.runtime.MockCallArgs) => args.inputs,
    },
    'custom-resources-unit',
    'test',
    false,
  );
}
```

이 파일은 `*.test.ts`가 아니라 `testMatch`에 안 잡힌다. 테스트에서만 import한다.

- [ ] **Step 2: custom-resources test 스크립트가 헬퍼만으로 깨지지 않는지**

```bash
pnpm --filter @common/custom-resources test
```

Expected: 테스트 0개 + eslint PASS. `pulumi-mocks.ts`가 eslint `test/tsconfig.json` include에 들어간다 (`**/*.ts`). unused export는 다음 task가 쓰므로 이 시점엔 `noUnusedLocals`가 패키지 tsconfig에서 false다.

- [ ] **Step 3: Commit** (사용자 요청 시에만)

```bash
git add common/custom-resources/test/pulumi-mocks.ts
git commit -m "$(cat <<'EOF'
test: add Pulumi mock harness for custom-resources

EOF
)"
```

---

### Task 8: TextFileV1 mock

**Files:**
- Create: `common/custom-resources/test/text-file-v1.test.ts`
- Do not modify: `common/custom-resources/src/resources/local/textFile.v1.res.ts`

**Interfaces:**
- Consumes: `installPulumiMocks`, `unwrap`, `TextFileV1`
- Produces: 없음

- [ ] **Step 1: 테스트 작성**

`common/custom-resources/test/text-file-v1.test.ts`:

```typescript
import * as pulumi from '@pulumi/pulumi';
import { installPulumiMocks, unwrap } from './pulumi-mocks';

const created: pulumi.runtime.MockResourceArgs[] = [];

installPulumiMocks({
  onNewResource: args => {
    created.push(args);
  },
});

describe('TextFileV1', () => {
  test('includes chmod in create when fileMode is valid', async () => {
    const { TextFileV1 } = await import(
      '../src/resources/local/textFile.v1.res'
    );

    const file = new TextFileV1('unit-text', {
      fileDirPath: '/tmp/apex-unit-textfile',
      fileName: 'a.txt',
      content: 'hello',
      fileMode: '600',
    });

    await unwrap(file.filePath);

    const commandResource = created.find(resource =>
      resource.type.toLowerCase().includes('command'),
    );
    expect(commandResource).toBeDefined();

    const createInput = commandResource!.inputs.create;
    const createCommand =
      typeof createInput === 'string'
        ? createInput
        : await unwrap(createInput as pulumi.Output<string>);

    expect(createCommand).toContain('chmod 600');
    expect(createCommand).toContain('/tmp/apex-unit-textfile/a.txt');
  });
});
```

디스크에 파일을 만들지 않는다. `fileDirPath`는 존재하지 않는 경로로 둔다 (`fileHash`는 content 해시 또는 `initial-deployment`).

- [ ] **Step 2: 실행**

```bash
pnpm --filter @common/custom-resources test -- test/text-file-v1.test.ts
```

Expected: PASS. `created`가 비면 `onNewResource`가 호출되기 전에 assert한 것이다. `unwrap(file.filePath)` 뒤에 `await new Promise(r => setImmediate(r))`를 한 줄 넣고 재시도. src 변경 금지.

- [ ] **Step 3: Commit** (사용자 요청 시에만)

```bash
git add common/custom-resources/test/text-file-v1.test.ts
git commit -m "$(cat <<'EOF'
test: mock TextFileV1 create command includes chmod

EOF
)"
```

---

### Task 9: PrivateKeyV1Component mock

**Files:**
- Create: `common/custom-resources/test/private-key-v1.test.ts`
- Do not modify: `common/custom-resources/src/components/tls/private-key.v1.component.ts`

**Interfaces:**
- Consumes: `installPulumiMocks`, `unwrap`, `PrivateKeyV1Component`
- Produces: 없음

- [ ] **Step 1: 테스트 작성**

`common/custom-resources/test/private-key-v1.test.ts`:

```typescript
import * as pulumi from '@pulumi/pulumi';
import { installPulumiMocks, unwrap } from './pulumi-mocks';

const created: pulumi.runtime.MockResourceArgs[] = [];

installPulumiMocks({
  onNewResource: args => {
    created.push(args);
  },
});

describe('PrivateKeyV1Component', () => {
  test('requests ED25519 and does not write a key file by default', async () => {
    const { PrivateKeyV1Component } = await import(
      '../src/components/tls/private-key.v1.component'
    );

    const key = new PrivateKeyV1Component('unit-key', {
      createKeyFile: false,
    });

    const secret = await unwrap(key.secret);
    expect(secret.privateKey.openssh).toBe('mock-openssh');

    const tlsKey = created.find(
      resource =>
        resource.type.toLowerCase().includes('privatekey') ||
        resource.type.toLowerCase().includes('tls'),
    );
    expect(tlsKey).toBeDefined();
    expect(tlsKey!.inputs.algorithm).toBe('ED25519');

    const textFiles = created.filter(resource =>
      resource.type.toLowerCase().includes('command'),
    );
    expect(textFiles).toHaveLength(0);
  });
});
```

`createKeyFile: false`라 `PULUMI_CONTRACT_KEYS_DIR_PATH` apply 경로를 타지 않아야 한다.

- [ ] **Step 2: 실행**

```bash
pnpm --filter @common/custom-resources test -- test/private-key-v1.test.ts
```

Expected: PASS. `algorithm`이 Input/Output이면 `await unwrap(pulumi.output(tlsKey!.inputs.algorithm))` 후 `'ED25519'` 비교.

- [ ] **Step 3: Commit** (사용자 요청 시에만)

```bash
git add common/custom-resources/test/private-key-v1.test.ts
git commit -m "$(cat <<'EOF'
test: mock PrivateKeyV1Component ED25519 without key file

EOF
)"
```

---

### Task 10: VirtualServiceV1 mock

**Files:**
- Create: `common/custom-resources/test/virtual-service-v1.test.ts`
- Do not modify: `common/custom-resources/src/resources/k8s/crd/istio/virtual-service.v1.res.ts`

**Interfaces:**
- Consumes: `installPulumiMocks`, `unwrap`, `VirtualServiceV1`
- Produces: 없음. Spec 2 CRD 테스트의 패턴

- [ ] **Step 1: 테스트 작성**

`common/custom-resources/test/virtual-service-v1.test.ts`:

```typescript
import * as pulumi from '@pulumi/pulumi';
import { installPulumiMocks, unwrap } from './pulumi-mocks';

const created: pulumi.runtime.MockResourceArgs[] = [];

installPulumiMocks({
  onNewResource: args => {
    created.push(args);
  },
});

describe('VirtualServiceV1', () => {
  test('passes Istio apiVersion and kind into the custom resource', async () => {
    const { VirtualServiceV1 } = await import(
      '../src/resources/k8s/crd/istio/virtual-service.v1.res'
    );

    const vs = new VirtualServiceV1('unit-vs', {
      metadata: { name: 'jellyfin', namespace: 'media' },
      spec: { hosts: ['jellyfin.example.com'] },
    });

    await unwrap(vs.urn);

    const crd = created.find(
      resource =>
        resource.inputs.kind === 'VirtualService' ||
        resource.name === 'unit-vs',
    );
    expect(crd).toBeDefined();
    expect(crd!.inputs.apiVersion).toBe('networking.istio.io/v1beta1');
    expect(crd!.inputs.kind).toBe('VirtualService');
    expect(crd!.inputs.spec).toEqual({ hosts: ['jellyfin.example.com'] });
  });
});
```

- [ ] **Step 2: 실행**

```bash
pnpm --filter @common/custom-resources test -- test/virtual-service-v1.test.ts
```

Expected: PASS.

- [ ] **Step 3: custom-resources 전체**

```bash
pnpm --filter @common/custom-resources test
```

Expected: text-file / private-key / virtual-service + eslint 전부 PASS.

- [ ] **Step 4: Commit** (사용자 요청 시에만)

```bash
git add common/custom-resources/test/virtual-service-v1.test.ts
git commit -m "$(cat <<'EOF'
test: mock VirtualServiceV1 apiVersion and kind

EOF
)"
```

---

### Task 11: 수용 기준 검증

**Files:**
- Modify: `docs/issues/2026-09-08-jest-unit-test-setup.md` 타임라인 append, 수용 기준 체크
- Do not modify: 프로덕션 src

**Interfaces:**
- Consumes: Task 1–10 산출물
- Produces: spec 수용 기준이 증거와 맞음

- [ ] **Step 1: 패키지 경계**

```bash
rg -n '"jest"' package.json infra/*/package.json common/bridged-provider/package.json common/nexus/package.json common/utils/package.json common/custom-resources/package.json
```

Expected: jest 문자열이 있는 package.json은 `common/utils`와 `common/custom-resources`뿐. (스크립트 이름 `"test": "projen test"`는 다른 패키지에도 있다. 찾는 대상은 `devDependencies`의 `"jest"`.)

더 정확:

```bash
rg -l '"jest":' common/*/package.json infra/*/package.json package.json
```

Expected: `common/utils/package.json`, `common/custom-resources/package.json`만. 루트/infra에 `"jest":` 버전 필드 없음.

- [ ] **Step 2: 테스트 실행**

```bash
pnpm --filter @common/utils test
pnpm --filter @common/custom-resources test
pnpm --filter @infra/k8s-workstation-tools test
```

Expected:

- utils: Task 2–6 테스트 PASS
- custom-resources: Task 8–10 PASS
- k8s-workstation-tools: eslint만. Jest가 `assets/coder/sysbox-ubuntu/test`를 실행했다는 출력 없음

- [ ] **Step 3: src diff**

```bash
git diff -- common/utils/src common/custom-resources/src
```

Expected: 빈 diff. 테스트·`.projenrc.ts`·생성 파일만 변경.

- [ ] **Step 4: spec 타임라인**

`docs/issues/2026-09-08-jest-unit-test-setup.md` 수용 기준 체크박스를 채우고, 타임라인 끝에만 행을 추가한다.

```markdown
| 2026-09-08 | Spec 1 구현. utils·custom-resources Jest 초록. Spec 2는 미착수 |
```

상태 문구를 **적용**으로 바꾼다. Spec 2가 남아 있으므로 **해결**로 바꾸거나 `docs/resolved`로 옮기지 않는다.

- [ ] **Step 5: Commit** (사용자 요청 시에만)

```bash
git add docs/issues/2026-09-08-jest-unit-test-setup.md docs/issues/2026-09-08-jest-unit-test-setup-plan.md
git commit -m "$(cat <<'EOF'
docs: record Jest Spec 1 acceptance

EOF
)"
```

---

## Self-review

- Spec 수용 기준 6개 → Task 1 Step 5, Task 11 Step 1–3이 대응.
- Spec 파일 표의 utils 10개 테스트 파일 → Task 2–6.
- Spec custom-resources 4개 파일 → Task 7–10.
- Placeholder (`TBD`, “similar to Task N”) 없음.
- `unwrap` / `installPulumiMocks` 이름은 Task 7에서 정의하고 8–10이 그대로 사용.
- utils는 `pulumi-mocks.ts`를 import하지 않음 (Task 6 자체 `setMocks`).
