import path from 'node:path';
import { coderd } from '@common/bridged-provider';
import * as utils from '@common/utils/src';
import * as pulumi from '@pulumi/pulumi';
import dedent from 'dedent';

interface CoderResourcesComponentArgsShape {
  templateVariables: {
    sysboxUbuntu: {
      namespace: string;
      runtimeClassName: string;
      storageClassNames: {
        home: string;
        docker: string;
        data: string;
      };
      lxcfsHostMountPath: string;
      devicePluginFuseKey: string;
      meshProxy: {
        host: string;
        port: number;
        url: string;
      };
      vault: {
        addr: string;
        jwtAuthPath: string;
        jwtRole: string;
      };
    };
    sysboxUbuntuTest: {
      namespace: string;
      runtimeClassName: string;
      storageClassNames: {
        home: string;
        docker: string;
        data: string;
      };
      lxcfsHostMountPath: string;
      devicePluginFuseKey: string;
      meshProxy: {
        host: string;
        port: number;
        url: string;
      };
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
    const sysboxUbuntuTemplate = new coderd.Template(
      `${resourceName}-sysboxUbuntuTemplate`,
      {
        name: 'sysbox-ubuntu-template',
        displayName: 'Ubuntu on Sysbox',
        description: dedent`
          Sysbox-runc로 동작하는 Ubuntu 워크스페이스 템플릿입니다.
          DevContainer 기능을 사용할 수 있습니다.
        `,
        icon: '/icon/ubuntu.svg',
        versions: [
          {
            directory: path.join(
              process.cwd(),
              '../',
              'assets',
              'coder',
              'sysbox-ubuntu',
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
                value: args.templateVariables.sysboxUbuntu.namespace,
              },
              {
                name: 'runtime_class_name',
                value: args.templateVariables.sysboxUbuntu.runtimeClassName,
              },
              {
                name: 'home_storage_class_name',
                value:
                  args.templateVariables.sysboxUbuntu.storageClassNames.home,
              },
              {
                name: 'docker_storage_class_name',
                value:
                  args.templateVariables.sysboxUbuntu.storageClassNames.docker,
              },
              {
                name: 'data_storage_class_name',
                value:
                  args.templateVariables.sysboxUbuntu.storageClassNames.data,
              },
              {
                name: 'workspace_directory_name',
                value: 'Workspace',
              },
              {
                name: 'lxcfs_host_mount_path',
                value: args.templateVariables.sysboxUbuntu.lxcfsHostMountPath,
              },
              {
                name: 'device_plugin_fuse_key',
                value: args.templateVariables.sysboxUbuntu.devicePluginFuseKey,
              },
              {
                name: 'device_plugin_fuse_count_limit',
                value: '2',
              },
              {
                name: 'mesh_proxy_host',
                value: args.templateVariables.sysboxUbuntu.meshProxy.host,
              },
              {
                name: 'mesh_proxy_port',
                value: pulumi.interpolate`${args.templateVariables.sysboxUbuntu.meshProxy.port}`,
              },
              {
                name: 'mesh_proxy_url',
                value: args.templateVariables.sysboxUbuntu.meshProxy.url,
              },
              {
                name: 'vault_addr',
                value: args.templateVariables.sysboxUbuntu.vault.addr,
              },
              {
                name: 'vault_jwt_auth_path',
                value: args.templateVariables.sysboxUbuntu.vault.jwtAuthPath,
              },
              {
                name: 'vault_jwt_role',
                value: args.templateVariables.sysboxUbuntu.vault.jwtRole,
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

    const sysboxUbuntuTestTemplate = new coderd.Template(
      `${resourceName}-sysboxUbuntuTestTemplate`,
      {
        name: 'sysbox-ubuntu-test-template',
        displayName: 'Ubuntu on Sysbox (Test)',
        description: dedent`
          Sysbox-runc로 동작하는 Ubuntu 워크스페이스 템플릿입니다.
          DevContainer 기능을 사용할 수 있습니다.
        `,
        icon: '/icon/ubuntu.svg',
        versions: [
          {
            directory: path.join(
              process.cwd(),
              '../',
              'assets',
              'coder',
              'sysbox-ubuntu',
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
                value: args.templateVariables.sysboxUbuntuTest.namespace,
              },
              {
                name: 'runtime_class_name',
                value: args.templateVariables.sysboxUbuntuTest.runtimeClassName,
              },
              {
                name: 'home_storage_class_name',
                value:
                  args.templateVariables.sysboxUbuntuTest.storageClassNames
                    .home,
              },
              {
                name: 'docker_storage_class_name',
                value:
                  args.templateVariables.sysboxUbuntuTest.storageClassNames
                    .docker,
              },
              {
                name: 'data_storage_class_name',
                value:
                  args.templateVariables.sysboxUbuntuTest.storageClassNames
                    .data,
              },
              {
                name: 'workspace_directory_name',
                value: 'Workspace',
              },
              {
                name: 'lxcfs_host_mount_path',
                value:
                  args.templateVariables.sysboxUbuntuTest.lxcfsHostMountPath,
              },
              {
                name: 'device_plugin_fuse_key',
                value:
                  args.templateVariables.sysboxUbuntuTest.devicePluginFuseKey,
              },
              {
                name: 'device_plugin_fuse_count_limit',
                value: '2',
              },
              {
                name: 'mesh_proxy_host',
                value: args.templateVariables.sysboxUbuntuTest.meshProxy.host,
              },
              {
                name: 'mesh_proxy_port',
                value: pulumi.interpolate`${args.templateVariables.sysboxUbuntuTest.meshProxy.port}`,
              },
              {
                name: 'mesh_proxy_url',
                value: args.templateVariables.sysboxUbuntuTest.meshProxy.url,
              },
              {
                name: 'vault_addr',
                value: args.templateVariables.sysboxUbuntuTest.vault.addr,
              },
              {
                name: 'vault_jwt_auth_path',
                value:
                  args.templateVariables.sysboxUbuntuTest.vault.jwtAuthPath,
              },
              {
                name: 'vault_jwt_role',
                value: args.templateVariables.sysboxUbuntuTest.vault.jwtRole,
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
        sysboxUbuntuTemplateId: sysboxUbuntuTemplate.id,
        sysboxUbuntuTestTemplateId: sysboxUbuntuTestTemplate.id,
      }),
      secret: pulumi.secret({}),
    };
  },
);
