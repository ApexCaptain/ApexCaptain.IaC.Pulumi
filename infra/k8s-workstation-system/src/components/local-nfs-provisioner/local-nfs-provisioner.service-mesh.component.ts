import * as customResources from '@common/custom-resources';
import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';

interface LocalNfsProvisionerServiceMeshComponentArgsShape {
  namespace: string;
  directConnection: {
    nfsSftp: {
      serviceName: string;
      gatewayPath: string;
      externalPort: number;
      servicePort: number;
    };
  };
  providers: {
    kubernetes: kubernetes.Provider;
  };
}

export type LocalNfsProvisionerServiceMeshComponentArgs =
  utils.types.DeepPulumiInput<LocalNfsProvisionerServiceMeshComponentArgsShape>;

export const LocalNfsProvisionerServiceMeshComponent =
  utils.functions.defineComponent(
    'localNfsProvisionerServiceMesh',
    (
      args: LocalNfsProvisionerServiceMeshComponentArgs,
      opts: pulumi.ComponentResourceOptions,
      resourceName: string,
    ) => {
      const sftpVirtualService =
        new customResources.resources.k8s.crd.istio.VirtualServiceV1(
          `${resourceName}-sftpVirtualService`,
          {
            metadata: {
              name: 'sftp-server',
              namespace: args.namespace,
            },
            spec: {
              hosts: ['*'],
              gateways: [args.directConnection.nfsSftp.gatewayPath],
              tcp: [
                {
                  match: [
                    {
                      port: args.directConnection.nfsSftp.externalPort,
                    },
                  ],
                  route: [
                    {
                      destination: {
                        host: args.directConnection.nfsSftp.serviceName,
                        port: {
                          number: args.directConnection.nfsSftp.servicePort,
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
          },
        );

      return {
        output: pulumi.output({}),
        secret: pulumi.secret({}),
      };
    },
  );
