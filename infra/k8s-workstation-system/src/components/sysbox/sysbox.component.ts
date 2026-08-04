/**
 * Sysbox RuntimeClass (K8s 쪽 연결)
 *
 * 호스트 Sysbox CE + containerd `sysbox-runc` 핸들러는 Ansible/Kubespray가 설치한다.
 * 이 컴포넌트는 업스트림 install 매니페스트의 RuntimeClass만 선언한다.
 * (`sysbox-deploy-k8s` DaemonSet은 호스트 설치와 중복되므로 쓰지 않음)
 *
 * @see https://github.com/nestybox/sysbox/blob/master/docs/user-guide/install-k8s.md
 * @see https://github.com/nestybox/sysbox/blob/master/sysbox-k8s-manifests/sysbox-install.yaml
 */
import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';

/** containerd runtime handler / RuntimeClass name (upstream) */
const SYSBOX_RUNTIME_CLASS_NAME = 'sysbox-runc';

/**
 * Nodes with Sysbox ready (Ansible `node_labels` / upstream installer label).
 * RuntimeClass scheduling.nodeSelector matches this.
 */
const SYSBOX_RUNTIME_NODE_LABEL_KEY = 'sysbox-runtime';
const SYSBOX_RUNTIME_NODE_LABEL_VALUE = 'running';

interface SysboxComponentArgsShape {
  providers: {
    kubernetes: kubernetes.Provider;
  };
}

export type SysboxComponentArgs =
  utils.types.DeepPulumiInput<SysboxComponentArgsShape>;

export const SysboxComponent = utils.functions.defineComponent(
  'sysbox',
  (
    args: SysboxComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    // Upstream:
    //   apiVersion: node.k8s.io/v1
    //   kind: RuntimeClass
    //   metadata:
    //     name: sysbox-runc
    //   handler: sysbox-runc
    //   scheduling:
    //     nodeSelector:
    //       sysbox-runtime: running
    const runtimeClass = new kubernetes.node.v1.RuntimeClass(
      `${resourceName}-runtimeClass`,
      {
        metadata: {
          name: SYSBOX_RUNTIME_CLASS_NAME,
        },
        handler: SYSBOX_RUNTIME_CLASS_NAME,
        scheduling: {
          nodeSelector: {
            [SYSBOX_RUNTIME_NODE_LABEL_KEY]: SYSBOX_RUNTIME_NODE_LABEL_VALUE,
          },
        },
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
