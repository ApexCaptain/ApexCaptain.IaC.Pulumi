import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';
import _ from 'lodash';
import { VirtualServiceV1 } from '../../resources/k8s/crd/istio/virtual-service.v1.res';
import { PrivateKeyV1Component } from '../tls/private-key.v1.component';

interface SftpV1ArgsShape {
  username: string;
  namespace: string;
  targetLabels: { [key: string]: string };
  uid: number;
  gid: number;
  volumeMounts: { pvcVolumeName: string; homeDirName: string }[];
  directGateway: {
    gatewayPath: string;
    port: number;
  };
  providers: {
    kubernetes: kubernetes.Provider;
  };
}

export type SftpV1Args = utils.types.DeepPulumiInput<SftpV1ArgsShape>;

export const SftpV1Component = utils.functions.defineComponent(
  'adapter:sftp:v1',
  (
    args: SftpV1Args,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    const sftpServerHostKey = new PrivateKeyV1Component(
      `${resourceName}-sftpServerHostKey`,
      {
        createKeyFile: false,
      },
      {
        ...opts,
      },
    );

    const sftpServerUserAuthentickationKey = new PrivateKeyV1Component(
      `${resourceName}-sftpServerUserAuthentickationKey`,
      {
        createKeyFile: true,
      },
      {
        ...opts,
      },
    );

    const homeDirNames = pulumi
      .output(args.volumeMounts)
      .apply(resolvedVolumeMounts => {
        return resolvedVolumeMounts
          .map(eachVolumeMount => eachVolumeMount.homeDirName)
          .join(',');
      });

    const sftpConfigMap = new kubernetes.core.v1.ConfigMap(
      `${resourceName}-sftpConfigMap`,
      {
        metadata: {
          name: _.kebabCase(`${resourceName}-sftpConfigMap`),
          namespace: args.namespace,
        },
        data: {
          'users.conf': pulumi
            .all([args.username, args.uid, args.gid, homeDirNames])
            .apply(
              ([
                resolvedUsername,
                resolvedUid,
                resolvedGid,
                resolvedHomeDirNames,
              ]) => {
                return `${resolvedUsername}::${resolvedUid}:${resolvedGid}:${resolvedHomeDirNames}`;
              },
            ),
          'ssh_host_ed25519_key': sftpServerHostKey.secret.privateKey.openssh,
          'user_auth_key':
            sftpServerUserAuthentickationKey.secret.publicKey.openssh,
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
      },
    );

    const sftpService = new kubernetes.core.v1.Service(
      `${resourceName}-sftpService`,
      {
        metadata: {
          name: _.kebabCase(`${resourceName}-sftpService`),
          namespace: args.namespace,
        },
        spec: {
          selector: args.targetLabels,
          ports: [
            {
              port: 22,
              name: 'sftp',
              targetPort: 22,
            },
          ],
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
      },
    );

    const sftpVirtualService = new VirtualServiceV1(
      `${resourceName}-sftpVirtualService`,
      {
        metadata: {
          name: _.kebabCase(`${resourceName}-sftpVirtualService`),
          namespace: args.namespace,
        },
        spec: {
          hosts: ['*'],
          gateways: [args.directGateway.gatewayPath],
          tcp: [
            {
              match: [
                {
                  port: args.directGateway.port,
                },
              ],
              route: [
                {
                  destination: {
                    host: sftpService.metadata.name,
                    port: {
                      number: sftpService.spec.ports[0].port,
                    },
                  },
                },
              ],
            },
          ],
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
        dependsOn: [sftpService],
      },
    );

    const spec = pulumi
      .all([sftpConfigMap.metadata.name, args.username, args.volumeMounts])
      .apply(
        ([
          resolvedSftpConfigMapName,
          resolvedUsername,
          resolvedVolumeMounts,
        ]) => {
          const volumeMounts =
            resolvedVolumeMounts.map<kubernetes.types.input.core.v1.VolumeMount>(
              eachResolvedVolumeMount => {
                return {
                  name: eachResolvedVolumeMount.pvcVolumeName,
                  mountPath: `/home/${resolvedUsername}/${eachResolvedVolumeMount.homeDirName}`,
                };
              },
            );

          volumeMounts.push(
            {
              name: resolvedSftpConfigMapName,
              mountPath: '/etc/sftp/users.conf',
              subPath: 'users.conf',
            },
            {
              name: resolvedSftpConfigMapName,
              mountPath: '/etc/ssh/ssh_host_ed25519_key',
              subPath: 'ssh_host_ed25519_key',
            },
            {
              name: resolvedSftpConfigMapName,
              mountPath: `/home/${resolvedUsername}/.ssh/keys/user_auth_key`,
              subPath: 'user_auth_key',
            },
          );

          const containerSpec: kubernetes.types.input.core.v1.Container = {
            name: 'sftp-sidecar',
            image: 'atmoz/sftp:alpine',
            restartPolicy: 'Always',
            ports: [
              {
                containerPort: 22,
                name: 'sftp',
              },
            ],
            volumeMounts,
            securityContext: {
              capabilities: { add: ['SYS_CHROOT'] },
            },
          };

          const volumeSpec: kubernetes.types.input.core.v1.Volume = {
            name: resolvedSftpConfigMapName,
            configMap: {
              name: resolvedSftpConfigMapName,
            },
          };

          return {
            containerSpec,
            volumeSpec,
          };
        },
      );

    return {
      output: pulumi.output({
        spec,
      }),
      secret: pulumi.secret({}),
    };
  },
);
