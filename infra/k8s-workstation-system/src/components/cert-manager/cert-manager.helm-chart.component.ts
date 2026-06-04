import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';

interface CertManagerHelmChartComponentArgsShape {
  helm: {
    certManager: {
      version: string;
    };
  };
  providers: {
    kubernetes: kubernetes.Provider;
  };
}

export type CertManagerHelmChartComponentArgs =
  utils.types.DeepPulumiInput<CertManagerHelmChartComponentArgsShape>;

export const CertManagerHelmChartComponent = utils.functions.defineComponent(
  'certManagerHelmChart',
  (
    args: CertManagerHelmChartComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    const namespace = new kubernetes.core.v1.Namespace(
      `${resourceName}-namespace`,
      {
        metadata: {
          name: 'cert-manager',
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
      },
    );

    const certManagerRelease = new kubernetes.helm.v3.Release(
      `${resourceName}-certManagerRelease`,
      {
        name: 'cert-manager',
        chart: 'cert-manager',
        version: args.helm.certManager.version,
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
