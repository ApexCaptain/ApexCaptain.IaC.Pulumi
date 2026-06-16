import * as customResources from '@common/custom-resources';
import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';


interface TestComponentArgsShape {
  providers: {
    kubernetes: kubernetes.Provider;
  };
}

export type TestComponentArgs =
  utils.types.DeepPulumiInput<TestComponentArgsShape>;

export const TestComponent = utils.functions.defineComponent(
  'test',
  (
    args: TestComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    const test1Namespace = new kubernetes.core.v1.Namespace(
      `${resourceName}-test1Namespace`,
      {
        metadata: {
          name: 'test1',
          labels: {
            'istio.io/dataplane-mode': 'ambient',
          },
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
      },
    );

    const test1DefaultPeerAuthentication =
      new customResources.resources.k8s.crd.istio.PeerAuthenticationV1(
        `${resourceName}-test1DefaultPeerAuthentication`,
        {
          metadata: {
            name: 'default',
            namespace: test1Namespace.metadata.name,
          },
          spec: {
            mtls: {
              mode: 'STRICT',
            },
          },
        },
        {
          ...opts,
          provider: args.providers.kubernetes,
        },
      );

    const test2Namespace = new kubernetes.core.v1.Namespace(
      `${resourceName}-test2Namespace`,
      {
        metadata: {
          name: 'test2',
          labels: {
            'istio.io/dataplane-mode': 'ambient',
          },
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
      },
    );
    const test2DefaultPeerAuthentication =
      new customResources.resources.k8s.crd.istio.PeerAuthenticationV1(
        `${resourceName}-test2DefaultPeerAuthentication`,
        {
          metadata: {
            name: 'default',
            namespace: test2Namespace.metadata.name,
          },
          spec: {
            mtls: {
              mode: 'STRICT',
            },
          },
        },
        {
          ...opts,
          provider: args.providers.kubernetes,
        },
      );

    const createTestDeployment = (
      deploymentName: string,
      namespaceName: pulumi.Input<string>,
      appLabelValue: string,
    ) =>
      new kubernetes.apps.v1.Deployment(
        `${resourceName}-${deploymentName}`,
        {
          metadata: {
            name: deploymentName,
            namespace: namespaceName,
          },
          spec: {
            replicas: 1,
            selector: {
              matchLabels: {
                'app.kubernetes.io/name': appLabelValue,
              },
            },
            template: {
              metadata: {
                labels: {
                  'app.kubernetes.io/name': appLabelValue,
                },
              },
              spec: {
                containers: [
                  {
                    name: deploymentName,
                    image: 'nginx:stable',
                    ports: [
                      {
                        containerPort: 80,
                        name: 'http',
                      },
                    ],
                  },
                ],
              },
            },
          },
        },
        {
          ...opts,
          provider: args.providers.kubernetes,
        },
      );

    const createTestService = (
      serviceName: string,
      namespaceName: pulumi.Input<string>,
      appLabelValue: string,
    ) =>
      new kubernetes.core.v1.Service(
        `${resourceName}-${serviceName}Service`,
        {
          metadata: {
            name: serviceName,
            namespace: namespaceName,
          },
          spec: {
            type: 'ClusterIP',
            selector: {
              'app.kubernetes.io/name': appLabelValue,
            },
            ports: [
              {
                name: 'http',
                port: 80,
                targetPort: 80,
                protocol: 'TCP',
              },
            ],
          },
        },
        {
          ...opts,
          provider: args.providers.kubernetes,
        },
      );

    const test1Deployment = createTestDeployment(
      'test1',
      test1Namespace.metadata.name,
      'test1',
    );

    const test2Deployment = createTestDeployment(
      'test2',
      test2Namespace.metadata.name,
      'test2',
    );

    const test1Service = createTestService(
      'test1',
      test1Namespace.metadata.name,
      'test1',
    );

    const test2Service = createTestService(
      'test2',
      test2Namespace.metadata.name,
      'test2',
    );

    return {
      output: pulumi.output({
        namespaces: {
          test1: test1Namespace.metadata.name,
          test2: test2Namespace.metadata.name,
        },
        deployments: {
          test1: test1Deployment.metadata.name,
          test2: test2Deployment.metadata.name,
        },
        services: {
          test1: test1Service.metadata.name,
          test2: test2Service.metadata.name,
        },
      }),
      secret: pulumi.secret({}),
    };
  },
);
