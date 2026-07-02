import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';

interface ClusterV1SecretRefShape {
  name: string;
}

interface ClusterV1InitdbBootstrapShape {
  database?: string;
  owner?: string;
  secret?: ClusterV1SecretRefShape;
  encoding?: string;
  locale?: string;
  dataChecksums?: boolean;
  postInitSQL?: string[];
  postInitApplicationSQL?: string[];
}

interface ClusterV1RecoveryBootstrapShape {
  source?: string;
  database?: string;
  owner?: string;
  secret?: ClusterV1SecretRefShape;
  backup?: {
    name: string;
  };
}

interface ClusterV1PgBasebackupBootstrapShape {
  source: string;
  database?: string;
  owner?: string;
  secret?: ClusterV1SecretRefShape;
}

interface ClusterV1StorageShape {
  size: string;
  storageClass?: string;
  resizeInUseVolumes?: boolean;
}

interface ClusterV1PostgresqlShape {
  parameters?: Record<string, string>;
  pg_hba?: string[];
  shared_preload_libraries?: string[];
}

interface ClusterV1ArgsShape {
  metadata: {
    name: string;
    namespace: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
  spec: {
    instances: number;
    imageName?: string;
    bootstrap?: {
      initdb?: ClusterV1InitdbBootstrapShape;
      recovery?: ClusterV1RecoveryBootstrapShape;
      pg_basebackup?: ClusterV1PgBasebackupBootstrapShape;
    };
    storage: ClusterV1StorageShape;
    walStorage?: ClusterV1StorageShape;
    inheritedMetadata?: {
      labels?: Record<string, string>;
      annotations?: Record<string, string>;
    };
    postgresql?: ClusterV1PostgresqlShape;
    resources?: {
      limits?: Record<string, string>;
      requests?: Record<string, string>;
    };
    enableSuperuserAccess?: boolean;
    monitoring?: {
      enablePodMonitor?: boolean;
      disableDefaultQueries?: boolean;
    };
    affinity?: Record<string, unknown>;
    nodeSelector?: Record<string, string>;
    tolerations?: {
      key?: string;
      operator?: string;
      value?: string;
      effect?: string;
      tolerationSeconds?: number;
    }[];
  };
}

export type ClusterV1Args = utils.types.DeepPulumiInput<ClusterV1ArgsShape>;

export class ClusterV1 extends kubernetes.apiextensions.CustomResource {
  constructor(
    name: string,
    args: ClusterV1Args,
    opts?: pulumi.CustomResourceOptions,
  ) {
    super(
      name,
      {
        apiVersion: 'postgresql.cnpg.io/v1',
        kind: 'Cluster',
        ...args,
      },
      opts,
    );
  }
}
