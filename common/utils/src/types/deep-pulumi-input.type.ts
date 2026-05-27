import * as pulumi from '@pulumi/pulumi';

export type DeepPulumiInput<T> = T extends (...args: any[]) => any
  ? T
  : T extends Array<infer U>
    ? pulumi.Input<Array<DeepPulumiInput<U>>>
    : T extends object
      ? { [K in keyof T]: DeepPulumiInput<T[K]> }
      : pulumi.Input<T>;
