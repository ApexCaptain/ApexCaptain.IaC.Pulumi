import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';

interface ServiceEntryV1ArgsShape {
  metadata: {
    name: string;
    namespace: string;
  };
  spec: {
    hosts: string[];
    addresses?: string[];
    ports: {
      number: number;
      name: string;
      protocol: string;
      targetPort?: number;
    }[];
    location?: 'MESH_EXTERNAL' | 'MESH_INTERNAL';
    resolution?: 'NONE' | 'STATIC' | 'DNS' | 'DNS_ROUND_ROBIN';
    endpoints?: {
      address?: string;
      ports?: Record<string, number>;
      labels?: Record<string, string>;
      network?: string;
      locality?: string;
      weight?: number;
    }[];
    exportTo?: string[];
    subjectAltNames?: string[];
    workloadSelector?: {
      labels?: Record<string, string>;
    };
  };
}

export type ServiceEntryV1Args =
  utils.types.DeepPulumiInput<ServiceEntryV1ArgsShape>;

export class ServiceEntryV1 extends kubernetes.apiextensions.CustomResource {
  constructor(
    name: string,
    args: ServiceEntryV1Args,
    opts?: pulumi.CustomResourceOptions,
  ) {
    super(
      name,
      {
        apiVersion: 'networking.istio.io/v1beta1',
        kind: 'ServiceEntry',
        ...args,
      },
      opts,
    );
  }
}
