import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';

export interface NodeV1DiskSpecShape {
  diskType?: 'filesystem' | 'block';
  path?: string;
  diskDriver?: '' | 'auto' | 'aio' | 'nvme';
  allowScheduling?: boolean;
  evictionRequested?: boolean;
  storageReserved?: number;
  tags?: string[];
}

interface NodeV1ArgsShape {
  metadata: {
    name: string;
    namespace: string;
    annotations?: Record<string, string>;
  };
  spec?: {
    name?: string;
    disks?: Record<string, NodeV1DiskSpecShape>;
    allowScheduling?: boolean;
    evictionRequested?: boolean;
    tags?: string[];
    instanceManagerCPURequest?: number;
  };
}

export type NodeV1Args = utils.types.DeepPulumiInput<NodeV1ArgsShape>;

export class NodeV1Patch extends kubernetes.apiextensions.CustomResourcePatch {
  constructor(
    name: string,
    args: NodeV1Args,
    opts?: pulumi.CustomResourceOptions,
  ) {
    super(
      name,
      {
        apiVersion: 'longhorn.io/v1beta2',
        kind: 'Node',
        ...args,
      },
      opts,
    );
  }
}
