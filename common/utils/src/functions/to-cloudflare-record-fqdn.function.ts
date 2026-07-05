import * as pulumi from '@pulumi/pulumi';

/**
 * Cloudflare `DnsRecord.name`을 zone 기준 FQDN으로 정규화한다.
 *
 * provider computed output 특성상 preview(미배포)에서는 서브도메인만,
 * apply 후에는 FQDN이 올 수 있어 동일한 형태로 맞추기 위한 함수.
 */
export function toCloudflareRecordFqdn(
  recordName: string,
  zoneDomain: string,
): string;
export function toCloudflareRecordFqdn(
  recordName: pulumi.Input<string>,
  zoneDomain: pulumi.Input<string>,
): pulumi.Output<string>;
export function toCloudflareRecordFqdn(
  recordName: pulumi.Input<string>,
  zoneDomain: pulumi.Input<string>,
): pulumi.Output<string> | string {
  if (typeof recordName === 'string' && typeof zoneDomain === 'string') {
    return toCloudflareRecordFqdnSync(recordName, zoneDomain);
  }

  return pulumi
    .all([recordName, zoneDomain])
    .apply(([name, zone]) => toCloudflareRecordFqdnSync(name, zone));
}

function toCloudflareRecordFqdnSync(
  recordName: string,
  zoneDomain: string,
): string {
  if (recordName === '@' || recordName === zoneDomain) {
    return zoneDomain;
  }

  if (recordName.endsWith(`.${zoneDomain}`)) {
    return recordName;
  }

  return `${recordName}.${zoneDomain}`;
}
