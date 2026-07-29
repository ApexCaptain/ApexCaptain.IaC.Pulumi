import { argocd } from '@common/bridged-provider';
import * as customResources from '@common/custom-resources/src';
import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';

interface ArgoServiceMeshComponentArgsShape {
  namespace: string;
  bootstrapPassword: string;
  ingress: {
    argoCd: {
      host: string;
      serviceName: string;
      gatewayPath: string;
      port: number;
    };
  };
  providers: {
    kubernetes: kubernetes.Provider;
  };
}

export type ArgoServiceMeshComponentArgs =
  utils.types.DeepPulumiInput<ArgoServiceMeshComponentArgsShape>;

export const ArgoServiceMeshComponent = utils.functions.defineComponent(
  'argoServiceMesh',
  (
    args: ArgoServiceMeshComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    // const defaultPeerAuthentication =
    //   new customResources.resources.k8s.crd.istio.PeerAuthenticationV1(
    //     `${resourceName}-defaultPeerAuthentication`,
    //     {
    //       metadata: {
    //         name: 'default',
    //         namespace: args.namespace,
    //       },
    //       spec: {
    //         mtls: {
    //           mode: 'STRICT',
    //         },
    //       },
    //     },
    //     {
    //       ...opts,
    //       provider: args.providers.kubernetes,
    //     },
    //   );

    const argoCdVirtualService =
      new customResources.resources.k8s.crd.istio.VirtualServiceV1(
        `${resourceName}-argoCdVirtualService`,
        {
          metadata: {
            name: 'argo-cd',
            namespace: args.namespace,
          },
          spec: {
            hosts: [args.ingress.argoCd.host],
            gateways: [args.ingress.argoCd.gatewayPath],
            http: [
              {
                route: [
                  {
                    destination: {
                      host: args.ingress.argoCd.serviceName,
                      port: {
                        number: args.ingress.argoCd.port,
                      },
                    },
                  },
                ],
              },
            ],
          },
        },
      );

    const argoCdProviderConfig: argocd.ProviderArgs = {
      serverAddr: pulumi.interpolate`${args.ingress.argoCd.host}:443`,
      username: 'admin',
      password: args.bootstrapPassword,
      grpcWeb: true,
      kubernetes: {},
    };

    return {
      output: pulumi.output({}),
      secret: pulumi.secret({
        argoCdProviderConfig,
      }),
    };
  },
);
