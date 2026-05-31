import * as nexus from '@common/nexus/src';
import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';

interface CertManagerChartComponentArgsShape {
  namespace: string;
  version: string;
  providers: {
    kubernetes: kubernetes.Provider;
  };
}

export type CertManagerChartComponentArgs =
  utils.types.DeepPulumiInput<CertManagerChartComponentArgsShape>;

export const CertManagerChartComponent = nexus.function.defineComponent(
  'certManagerChart',
  (
    args: CertManagerChartComponentArgs,
    opts: pulumi.ComponentResourceOptions,
  ) => {
    const namespace = new kubernetes.core.v1.Namespace(
      'namespace',
      {
        metadata: {
          name: args.namespace,
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
      },
    );

    const certManagerRelease = new kubernetes.helm.v3.Release(
      'certManagerRelease',
      {
        name: 'cert-manager',
        chart: 'cert-manager',
        version: args.version,
        namespace: namespace.metadata.name,
        repositoryOpts: {
          repo: 'https://charts.jetstack.io',
        },
        values: {
          crds: {
            enabled: true,
            keep: true,
          },
          enableCertificateOwnerRef: true,
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
      },
    );

    return {
      output: pulumi.output({
        namespace: namespace.metadata.name,
      }),
      secret: pulumi.secret({}),
    };
  },
);
