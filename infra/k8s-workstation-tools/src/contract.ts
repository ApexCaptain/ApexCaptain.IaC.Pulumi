/**
 * Workstation "도구" 스택 — Coder·Vikunja·qBittorrent·Zero Trust.
 *
 * 각 단계는 `./phases`의 조립 함수다. 아래 호출 순서가 배포 순서이고,
 * 단계 간 의존은 인자로 넘긴 providers(+ 각 컴포넌트의 `dependsOn`)로 드러난다.
 *
 * NordLynx VPN sidecar로 트래픽을 터널 밖으로만 보내는 구조.
 * Web UI는 Longhorn과 같은 Authentik Proxy + OutpostProviderAttachment 패턴.
 *
 * 리소스 이름·parent를 바꾸면 URN이 바뀐다. 단계 이동은 preview diff 0으로 확인한다.
 * output 객체 키 순서는 contract hash에 들어가므로 바꾸지 않는다.
 */
import * as nexus from '@common/nexus';
import * as utils from '@common/utils';
import * as pulumi from '@pulumi/pulumi';
import * as phases from './phases';

export const k8sWorkstationToolsContract = new nexus.classes.Contract(
  __filename,
  async () => {
    const providers = phases.deployProviders();

    // Production Only Tools
    if (pulumi.getStack() === utils.enums.StackStage.PROD) {
      phases.deployCoder({ providers });
      phases.deployVikunja({ providers });
      phases.deployQbittorrent({ providers });
      phases.deployZeroTrust({ providers });
    }

    return {
      output: pulumi.output({}),
      secret: pulumi.secret({}),
    };
  },
);
