import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';

interface VaultStaticSecretV1TemplateShape {
  name?: string;
  text: string;
}

interface VaultStaticSecretV1TransformationRefShape {
  name: string;
  namespace?: string;
  ignoreExcludes?: boolean;
  ignoreIncludes?: boolean;
  templateRefs?: {
    name: string;
    keyOverride?: string;
  }[];
}

interface VaultStaticSecretV1TransformationShape {
  excludeRaw?: boolean;
  excludes?: string[];
  includes?: string[];
  templates?: Record<string, VaultStaticSecretV1TemplateShape>;
  transformationRefs?: VaultStaticSecretV1TransformationRefShape[];
}

interface VaultStaticSecretV1DestinationShape {
  name: string;
  create?: boolean;
  overwrite?: boolean;
  type?: string;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
  transformation?: VaultStaticSecretV1TransformationShape;
}

interface VaultStaticSecretV1RolloutRestartTargetShape {
  kind: 'Deployment' | 'DaemonSet' | 'StatefulSet' | 'argo.Rollout';
  name: string;
}

interface VaultStaticSecretV1ArgsShape {
  metadata: {
    name: string;
    namespace: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
  spec: {
    vaultAuthRef?: string;
    mount: string;
    path: string;
    type: 'kv-v1' | 'kv-v2';
    namespace?: string;
    version?: number;
    refreshAfter?: string;
    hmacSecretData?: boolean;
    destination: VaultStaticSecretV1DestinationShape;
    rolloutRestartTargets?: VaultStaticSecretV1RolloutRestartTargetShape[];
    syncConfig?: {
      instantUpdates?: boolean;
    };
  };
}

export type VaultStaticSecretV1Args =
  utils.types.DeepPulumiInput<VaultStaticSecretV1ArgsShape>;

export class VaultStaticSecretV1 extends kubernetes.apiextensions.CustomResource {
  constructor(
    name: string,
    args: VaultStaticSecretV1Args,
    opts?: pulumi.CustomResourceOptions,
  ) {
    super(
      name,
      {
        apiVersion: 'secrets.hashicorp.com/v1beta1',
        kind: 'VaultStaticSecret',
        ...args,
      },
      opts,
    );
  }
}
