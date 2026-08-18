/**
 * Jellyfin ingress — Istio Gateway VirtualService only.
 *
 * Namespace는 ambient mesh 밖(`istio.io/dataplane-mode: none`).
 * Direct Play 시크 시 Gateway HBONE stream leak(istio/istio#60074) 회피.
 */
import * as customResources from '@common/custom-resources';
import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';

interface JellyfinServiceMeshComponentArgsShape {
  namespace: string;
  ingress: {
    jellyfinWebUi: {
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

export type JellyfinServiceMeshComponentArgs =
  utils.types.DeepPulumiInput<JellyfinServiceMeshComponentArgsShape>;

export const JellyfinServiceMeshComponent = utils.functions.defineComponent(
  'jellyfinServiceMesh',
  (
    args: JellyfinServiceMeshComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    new customResources.resources.k8s.crd.istio.VirtualServiceV1(
      `${resourceName}-jellyfinVirtualService`,
      {
        metadata: {
          name: 'jellyfin',
          namespace: args.namespace,
        },
        spec: {
          hosts: [args.ingress.jellyfinWebUi.host],
          gateways: [args.ingress.jellyfinWebUi.gatewayPath],
          http: [
            {
              route: [
                {
                  destination: {
                    host: args.ingress.jellyfinWebUi.serviceName,
                    port: {
                      number: args.ingress.jellyfinWebUi.port,
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
