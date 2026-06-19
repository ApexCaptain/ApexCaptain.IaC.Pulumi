import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';

interface LonghornHelmChartComponentArgsShape {
  helm: {
    longhorn: {
      version: string;
      repositoryUrl: string;
    };
  };
  providers: {
    kubernetes: kubernetes.Provider;
  };
}
export type LonghornHelmChartComponentArgs =
  utils.types.DeepPulumiInput<LonghornHelmChartComponentArgsShape>;

export const LonghornHelmChartComponent = utils.functions.defineComponent(
  'longhornHelmChart',
  (
    args: LonghornHelmChartComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    const namespace = new kubernetes.core.v1.Namespace(
      `${resourceName}-namespace`,
      {
        metadata: {
          name: 'longhorn',
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
      },
    );

    const longhornRelease = new kubernetes.helm.v3.Release(
      `${resourceName}-longhornRelease`,
      {
        name: 'longhorn',
        chart: 'longhorn',
        version: args.helm.longhorn.version,
        namespace: namespace.metadata.name,
        repositoryOpts: {
          repo: args.helm.longhorn.repositoryUrl,
        },
        waitForJobs: true,
        values: {
          ingress: {
            enabled: false, // Ingress 사용 안함, Virtual Service 사용
          },
          defaultSettings: {
            createDefaultDiskLabeledNodes: true, // Labeling 된 Node에만 Default Disk 생성
            defaultReplicaCount: '1', // 기본 레플리카 수
            /**
             * @Note
             *  - true: Allow to delete longhorn chart
             *  - false: Prevent to delete longhorn chart
             */
            deletingConfirmationFlag: true, // 삭제 방지
          },
          persistence: {
            createStorageClass: false, // Helm이 StorageClass를 생성하지 않음
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
        namespace: namespace.metadata.name,
        services: {
          longhornFrontend: {
            name: 'longhorn-frontend',
            port: {
              http: 80,
            },
          },
        },
      }),
      secret: pulumi.secret({}),
    };
  },
);
