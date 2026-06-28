/**
 * cert-manager Helm — CRD + controller
 *
 * Vault·Istio ingress 등 downstream이 Certificate CR을 쓰므로 mesh보다 먼저 올린다.
 */
import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';

interface CertManagerHelmChartComponentArgsShape {
  helm: {
    certManager: {
      version: string;
      repositoryUrl: string;
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
          repo: args.helm.certManager.repositoryUrl,
        },
        waitForJobs: true,
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
