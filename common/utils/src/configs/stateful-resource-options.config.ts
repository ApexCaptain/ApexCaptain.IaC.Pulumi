import * as pulumi from '@pulumi/pulumi';

/**
 * 데이터를 품은 리소스(PVC, CNPG Cluster, 그 Namespace, 상태 저장 Helm Release) 전용 opts.
 *
 * - `protect`: delete·replace가 필요한 변경을 preview 단계에서 실패시킨다.
 * - `retainOnDelete`: state에서 빠져도 클러스터 리소스는 남긴다.
 *
 * `retainOnDelete`는 parent에서 상속되지 않으므로 컴포넌트가 아닌 리프 리소스에 붙인다.
 * 의도적 replace 절차: docs/issues/resolved/2026-10-17-stateful-resource-protect.md "의도적 replace".
 */
export const statefulResourceOptions: Readonly<
  Pick<pulumi.CustomResourceOptions, 'protect' | 'retainOnDelete'>
> = Object.freeze({
  protect: true,
  retainOnDelete: true,
});
