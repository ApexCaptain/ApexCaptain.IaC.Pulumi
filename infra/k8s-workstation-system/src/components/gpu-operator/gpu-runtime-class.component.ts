/**
 * NVIDIA RuntimeClass (K8s 쪽 연결)
 *
 * 호스트 NVIDIA driver + containerd `nvidia` 핸들러는 Ansible postConfigure가 설치한다.
 * GPU Operator는 driver/toolkit을 비활성화하고 device plugin·NFD·DCGM만 배포한다.
 *
 * @see https://docs.nvidia.com/datacenter/cloud-native/gpu-operator/latest/getting-started.html
 */
import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';

/** containerd runtime handler / RuntimeClass name (Ansible `containerd_additional_runtimes`) */
const NVIDIA_RUNTIME_CLASS_NAME = 'nvidia';

interface GpuRuntimeClassComponentArgsShape {
  providers: {
    kubernetes: kubernetes.Provider;
  };
}

export type GpuRuntimeClassComponentArgs =
  utils.types.DeepPulumiInput<GpuRuntimeClassComponentArgsShape>;

export const GpuRuntimeClassComponent = utils.functions.defineComponent(
  'gpuRuntimeClass',
  (
    args: GpuRuntimeClassComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    const runtimeClass = new kubernetes.node.v1.RuntimeClass(
      `${resourceName}-runtimeClass`,
      {
        metadata: {
          name: NVIDIA_RUNTIME_CLASS_NAME,
        },
        handler: NVIDIA_RUNTIME_CLASS_NAME,
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
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
