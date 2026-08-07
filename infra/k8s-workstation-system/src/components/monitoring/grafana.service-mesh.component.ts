/**
 * Grafana UI — Istio VirtualService only (no Authentik Proxy)
 */
import * as customResources from '@common/custom-resources/src';
import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';

interface GrafanaServiceMeshComponentArgsShape {
  namespace: string;
  ingress: {
    grafana: {
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

export type GrafanaServiceMeshComponentArgs =
  utils.types.DeepPulumiInput<GrafanaServiceMeshComponentArgsShape>;

export const GrafanaServiceMeshComponent = utils.functions.defineComponent(
  'grafanaServiceMesh',
  (
    args: GrafanaServiceMeshComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    new customResources.resources.k8s.crd.istio.VirtualServiceV1(
      `${resourceName}-grafanaVirtualService`,
      {
        metadata: {
          name: 'grafana',
          namespace: args.namespace,
        },
        spec: {
          hosts: [args.ingress.grafana.host],
          gateways: [args.ingress.grafana.gatewayPath],
          http: [
            {
              route: [
                {
                  destination: {
                    host: args.ingress.grafana.serviceName,
                    port: {
                      number: args.ingress.grafana.port,
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
