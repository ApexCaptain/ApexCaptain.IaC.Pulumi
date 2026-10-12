/**
 * 노드 부팅마다 istio-cni-node를 한 번 재시작해, startup reconcile이
 * netns 생성 전에 포기한 ambient 파드를 다시 등록한다.
 *
 * docs/issues/2026-10-12-ambient-reboot-redirect.md
 */
import * as fs from 'fs';
import * as path from 'path';

import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';

interface IstioCniRebootRepairComponentArgsShape {
  namespace: string;
  providers: {
    kubernetes: kubernetes.Provider;
  };
}

export type IstioCniRebootRepairComponentArgs =
  utils.types.DeepPulumiInput<IstioCniRebootRepairComponentArgsShape>;

const script = fs.readFileSync(
  path.join(__dirname, 'assets', 'istio-cni-reboot-repair.sh'),
  'utf8',
);

export const IstioCniRebootRepairComponent = utils.functions.defineComponent(
  'istioCniRebootRepair',
  (
    args: IstioCniRebootRepairComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    const provider = args.providers.kubernetes;
    const metadata = { namespace: args.namespace };

    const serviceAccount = new kubernetes.core.v1.ServiceAccount(
      `${resourceName}-serviceAccount`,
      {
        metadata: { ...metadata, name: 'istio-cni-reboot-repair' },
      },
      { ...opts, provider },
    );

    const role = new kubernetes.rbac.v1.Role(
      `${resourceName}-role`,
      {
        metadata: { ...metadata, name: 'istio-cni-reboot-repair' },
        rules: [
          {
            apiGroups: [''],
            resources: ['pods'],
            verbs: ['get', 'list', 'delete'],
          },
        ],
      },
      { ...opts, provider },
    );

    const roleBinding = new kubernetes.rbac.v1.RoleBinding(
      `${resourceName}-roleBinding`,
      {
        metadata: { ...metadata, name: 'istio-cni-reboot-repair' },
        roleRef: {
          apiGroup: 'rbac.authorization.k8s.io',
          kind: 'Role',
          name: role.metadata.name,
        },
        subjects: [
          {
            kind: 'ServiceAccount',
            name: serviceAccount.metadata.name,
            namespace: args.namespace,
          },
        ],
      },
      { ...opts, provider },
    );

    const configMap = new kubernetes.core.v1.ConfigMap(
      `${resourceName}-configMap`,
      {
        metadata: { ...metadata, name: 'istio-cni-reboot-repair' },
        data: { 'repair.sh': script },
      },
      { ...opts, provider },
    );

    const daemonSet = new kubernetes.apps.v1.DaemonSet(
      `${resourceName}-daemonSet`,
      {
        metadata: { ...metadata, name: 'istio-cni-reboot-repair' },
        spec: {
          selector: {
            matchLabels: { app: 'istio-cni-reboot-repair' },
          },
          template: {
            metadata: {
              labels: {
                'app': 'istio-cni-reboot-repair',
                'istio.io/dataplane-mode': 'none',
                'sidecar.istio.io/inject': 'false',
              },
            },
            spec: {
              serviceAccountName: serviceAccount.metadata.name,
              terminationGracePeriodSeconds: 5,
              containers: [
                {
                  name: 'repair',
                  image: 'docker.io/rancher/kubectl:v1.35.4',
                  imagePullPolicy: 'IfNotPresent',
                  command: ['sh', '/script/repair.sh'],
                  env: [
                    {
                      name: 'NODE_NAME',
                      valueFrom: { fieldRef: { fieldPath: 'spec.nodeName' } },
                    },
                  ],
                  resources: {
                    requests: { cpu: '10m', memory: '32Mi' },
                    limits: { cpu: '100m', memory: '64Mi' },
                  },
                  volumeMounts: [
                    { name: 'script', mountPath: '/script', readOnly: true },
                    { name: 'host-run', mountPath: '/host-run' },
                  ],
                },
              ],
              volumes: [
                {
                  name: 'script',
                  configMap: {
                    name: configMap.metadata.name,
                    defaultMode: 0o555,
                  },
                },
                {
                  name: 'host-run',
                  hostPath: { path: '/var/run', type: 'Directory' },
                },
              ],
            },
          },
        },
      },
      { ...opts, provider, dependsOn: [roleBinding, configMap] },
    );

    return {
      output: pulumi.output({
        daemonSetName: daemonSet.metadata.name,
      }),
      secret: pulumi.secret({}),
    };
  },
);
