import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';
import dedent from 'dedent';

interface TestComponentArgsShape {
  namespace: string;
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
    const namespace = new kubernetes.core.v1.Namespace(
      `${resourceName}-namespace`,
      {
        metadata: {
          name: args.namespace,
          labels: {
            'istio-injection': 'enabled',
            // 'istio-injection': 'disabled',
          },
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
      },
    );

    const testLabel = {
      'app.kubernetes.io/name': 'test',
    };

    // k exec -it deployment/test -n test -c test -- /bin/bash
    const testDeployment = new kubernetes.apps.v1.Deployment(
      `${resourceName}-testDeployment`,
      {
        metadata: {
          name: 'test',
          namespace: namespace.metadata.name,
        },
        spec: {
          replicas: 1,
          selector: {
            matchLabels: testLabel,
          },
          template: {
            metadata: {
              labels: testLabel,
            },
            spec: {
              containers: [
                {
                  name: 'test',
                  image: 'ubuntu:latest',
                  command: [
                    '/bin/sh',
                    '-c',
                    dedent`
                      apt update -y
                      apt install -y curl
                      sleep infinity
                    `,
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
        dependsOn: [namespace],
      },
    );

    return {
      output: pulumi.output({}),
      secret: pulumi.secret({}),
    };
  },
);
