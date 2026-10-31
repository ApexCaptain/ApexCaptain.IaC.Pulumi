/**
 * Kata Containers RuntimeClass (K8s 쪽 연결, PoC)
 *
 * 호스트 Kata 바이너리는 Kubespray(`kata_containers_enabled`)가, containerd
 * `kata` 핸들러는 group_vars `containerd_extra_args`가 설치한다. 이 컴포넌트는 RuntimeClass만 선언한다.
 * 단일 노드라 scheduling.nodeSelector 없음.
 *
 * @see https://github.com/kata-containers/kata-containers/blob/main/docs/how-to/how-to-use-k8s-with-containerd-and-kata.md
 * @see docs/issues/active/2026-10-24-sysbox-runtime-replacement.md
 */
import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';

const KATA_RUNTIME_CLASS_NAME = 'kata';

/**
 * containerd 핸들러. Kubespray 내장 `kata-qemu`가 아니라 group_vars
 * `containerd_extra_args`로 정의한 `kata` (privileged_without_host_devices)
 */
const KATA_RUNTIME_HANDLER = 'kata';

interface KataComponentArgsShape {
  providers: {
    kubernetes: kubernetes.Provider;
  };
}

export type KataComponentArgs =
  utils.types.DeepPulumiInput<KataComponentArgsShape>;

export const KataComponent = utils.functions.defineComponent(
  'kata',
  (
    args: KataComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    const runtimeClass = new kubernetes.node.v1.RuntimeClass(
      `${resourceName}-runtimeClass`,
      {
        metadata: {
          name: KATA_RUNTIME_CLASS_NAME,
        },
        handler: KATA_RUNTIME_HANDLER,
        // VM은 limit + default_memory(Kubespray kata_containers_qemu_default_memory=1024)까지 쓸 수 있다.
        // 게스트 페이지 캐시가 그만큼 찰 수 있어 memory는 default_memory와 맞춘다 (대기 RSS 실측 약 330Mi)
        overhead: {
          podFixed: {
            cpu: '250m',
            memory: '1Gi',
          },
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
        // handler는 immutable. 이름 고정이라 삭제 후 생성
        replaceOnChanges: ['handler'],
        deleteBeforeReplace: true,
      },
    );

    return {
      output: pulumi.output({
        runtimeClassName: runtimeClass.metadata.name,
        handler: runtimeClass.handler,
      }),
      secret: pulumi.secret({}),
    };
  },
);
