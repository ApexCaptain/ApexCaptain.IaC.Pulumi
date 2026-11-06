import path from 'node:path';
import { coderd } from '@common/bridged-provider';
import * as utils from '@common/utils/src';
import * as pulumi from '@pulumi/pulumi';
import dedent from 'dedent';

interface CoderResourcesComponentArgsShape {
  templateVariables: {
    /** Kata — 전용 네임스페이스, sidecar로 메시 참여 */
    kataUbuntu: {
      namespace: string;
      runtimeClassName: string;
      storageClassNames: {
        home: string;
        docker: string;
        data: string;
      };
      /** 주입 istio-validation 덮어쓰기용 proxyv2 이미지 */
      istioProxyImage: string;
      vault: {
        addr: string;
        jwtAuthPath: string;
        jwtRole: string;
      };
    };
    /** Kata PoC — 전용 네임스페이스, sidecar로 메시 참여 */
    kataUbuntuTest: {
      namespace: string;
      runtimeClassName: string;
      storageClassNames: {
        home: string;
        docker: string;
        data: string;
      };
      /** 주입 istio-validation 덮어쓰기용 proxyv2 이미지 */
      istioProxyImage: string;
      vault: {
        addr: string;
        jwtAuthPath: string;
        jwtRole: string;
      };
    };
  };
  providers: {
    coderd: coderd.Provider;
  };
}

export type CoderResourcesComponentArgs =
  utils.types.DeepPulumiInput<CoderResourcesComponentArgsShape>;

export const CoderResourcesComponent = utils.functions.defineComponent(
  'coder-resources',
  (
    args: CoderResourcesComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    const kataUbuntuTemplate = new coderd.Template(
      `${resourceName}-kataUbuntuTemplate`,
      {
        name: 'kata-ubuntu-template',
        displayName: 'Ubuntu on Kata',
        description: dedent`
          Kata Containers(경량 VM)로 동작하는 Ubuntu 워크스페이스 템플릿입니다.
          DevContainer 기능과 클러스터 내부 Service 접근(Istio sidecar)을 사용할 수 있습니다.
        `,
        icon: '/icon/ubuntu.svg',
        versions: [
          {
            directory: path.join(
              process.cwd(),
              '../',
              'assets',
              'coder',
              'kata-ubuntu',
              'main',
            ),
            active: true,
            tfVars: [
              {
                name: 'use_kubeconfig',
                value: 'false',
              },
              {
                name: 'namespace',
                value: args.templateVariables.kataUbuntu.namespace,
              },
              {
                name: 'runtime_class_name',
                value: args.templateVariables.kataUbuntu.runtimeClassName,
              },
              {
                name: 'home_storage_class_name',
                value: args.templateVariables.kataUbuntu.storageClassNames.home,
              },
              {
                name: 'docker_storage_class_name',
                value:
                  args.templateVariables.kataUbuntu.storageClassNames.docker,
              },
              {
                name: 'data_storage_class_name',
                value: args.templateVariables.kataUbuntu.storageClassNames.data,
              },
              {
                name: 'workspace_directory_name',
                value: 'Workspace',
              },
              {
                name: 'istio_proxy_image',
                value: args.templateVariables.kataUbuntu.istioProxyImage,
              },
              {
                name: 'vault_addr',
                value: args.templateVariables.kataUbuntu.vault.addr,
              },
              {
                name: 'vault_jwt_auth_path',
                value: args.templateVariables.kataUbuntu.vault.jwtAuthPath,
              },
              {
                name: 'vault_jwt_role',
                value: args.templateVariables.kataUbuntu.vault.jwtRole,
              },
              {
                name: 'vault_cli_version',
                value: utils.configs.vaultVersion,
              },
            ],
          },
        ],
      },
      {
        ...opts,
        provider: args.providers.coderd,
      },
    );

    const kataUbuntuTestTemplate = new coderd.Template(
      `${resourceName}-kataUbuntuTestTemplate`,
      {
        name: 'kata-ubuntu-test-template',
        displayName: 'Ubuntu on Kata (Test)',
        description: dedent`
          Kata Containers(경량 VM)로 동작하는 Ubuntu 워크스페이스 템플릿입니다.
          DevContainer 기능과 클러스터 내부 Service 접근(Istio sidecar)을 사용할 수 있습니다.
        `,
        icon: '/icon/ubuntu.svg',
        versions: [
          {
            directory: path.join(
              process.cwd(),
              '../',
              'assets',
              'coder',
              'kata-ubuntu',
              'test',
            ),
            active: true,
            tfVars: [
              {
                name: 'use_kubeconfig',
                value: 'false',
              },
              {
                name: 'namespace',
                value: args.templateVariables.kataUbuntuTest.namespace,
              },
              {
                name: 'runtime_class_name',
                value: args.templateVariables.kataUbuntuTest.runtimeClassName,
              },
              {
                name: 'home_storage_class_name',
                value:
                  args.templateVariables.kataUbuntuTest.storageClassNames.home,
              },
              {
                name: 'docker_storage_class_name',
                value:
                  args.templateVariables.kataUbuntuTest.storageClassNames
                    .docker,
              },
              {
                name: 'data_storage_class_name',
                value:
                  args.templateVariables.kataUbuntuTest.storageClassNames.data,
              },
              {
                name: 'workspace_directory_name',
                value: 'Workspace',
              },
              {
                name: 'istio_proxy_image',
                value: args.templateVariables.kataUbuntuTest.istioProxyImage,
              },
              {
                name: 'vault_addr',
                value: args.templateVariables.kataUbuntuTest.vault.addr,
              },
              {
                name: 'vault_jwt_auth_path',
                value: args.templateVariables.kataUbuntuTest.vault.jwtAuthPath,
              },
              {
                name: 'vault_jwt_role',
                value: args.templateVariables.kataUbuntuTest.vault.jwtRole,
              },
              {
                name: 'vault_cli_version',
                value: utils.configs.vaultVersion,
              },
            ],
          },
        ],
      },
      {
        ...opts,
        provider: args.providers.coderd,
      },
    );

    return {
      output: pulumi.output({
        kataUbuntuTemplateId: kataUbuntuTemplate.id,
        kataUbuntuTestTemplateId: kataUbuntuTestTemplate.id,
      }),
      secret: pulumi.secret({}),
    };
  },
);
