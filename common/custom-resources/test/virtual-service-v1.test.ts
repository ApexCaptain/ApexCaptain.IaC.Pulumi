import * as pulumi from '@pulumi/pulumi';
import { installPulumiMocks, unwrap } from './pulumi-mocks';

const created: pulumi.runtime.MockResourceArgs[] = [];

installPulumiMocks({
  onNewResource: args => {
    created.push(args);
  },
});

describe('VirtualServiceV1', () => {
  test('passes Istio apiVersion and kind into the custom resource', async () => {
    const { VirtualServiceV1 } = await import(
      '../src/resources/k8s/crd/istio/virtual-service.v1.res'
    );

    const vs = new VirtualServiceV1('unit-vs', {
      metadata: { name: 'jellyfin', namespace: 'media' },
      spec: { hosts: ['jellyfin.example.com'] },
    });

    await unwrap(vs.urn);

    const crd = created.find(
      resource =>
        resource.inputs.kind === 'VirtualService' ||
        resource.name === 'unit-vs',
    );
    expect(crd).toBeDefined();
    expect(crd!.inputs.apiVersion).toBe('networking.istio.io/v1beta1');
    expect(crd!.inputs.kind).toBe('VirtualService');
    expect(crd!.inputs.spec).toEqual({ hosts: ['jellyfin.example.com'] });
  });
});
