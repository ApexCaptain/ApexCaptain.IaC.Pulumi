import * as nexus from '@common/nexus';
import * as utils from '@common/utils/src';
import { cloudflareContract } from '@infra/cloudflare/src/contract';
import * as pulumi from '@pulumi/pulumi';
import * as components from '../components';
import { AuthentikPhase } from './authentik';
import { CertManagerPhase } from './cert-manager';
import { LonghornPhase } from './longhorn';
import { MeshPhase } from './mesh';
import { SystemProviders } from './providers';

/** OTel Operator → VictoriaMetrics·Loki·Tempo(Longhorn SSD) → Grafana(Authentik OIDC) + collector. */
export const deployMonitoring = (deps: {
  providers: SystemProviders;
  certManager: CertManagerPhase;
  mesh: MeshPhase;
  longhorn: LonghornPhase;
  authentik: AuthentikPhase;
}) => {
  const commonEsc = nexus.esc.commonEsc;
  const projectEsc = nexus.esc.k8sWorkstationSystemEsc;
  const { workstationK8sProvider } = deps.providers;
  const { certManagerHelmChart } = deps.certManager;
  const { istioGateway } = deps.mesh;
  const { longhornResources } = deps.longhorn;
  const { authentikResources, authentikProvider } = deps.authentik;

  const otelOperatorHelmChart =
    new components.monitoring.OtelOperatorHelmChartComponent(
      'otelOperatorHelmChart',
      {
        helm: {
          opentelemetryOperator: {
            version: utils.configs.helmChartVersions.opentelemetryOperator,
            repositoryUrl:
              commonEsc.esc.helmRepositoryUrls[
                'open-telemetry.github.io/opentelemetry-helm-charts'
              ],
          },
        },
        providers: { kubernetes: workstationK8sProvider },
      },
      { dependsOn: [certManagerHelmChart] },
    );

  const monitoringNamespace = otelOperatorHelmChart.output.namespace;
  const monitoringStorageClass =
    longhornResources.output.storageClasses.longhornSsd;

  const victoriaMetricsHelmChart =
    new components.monitoring.VictoriaMetricsHelmChartComponent(
      'victoriaMetricsHelmChart',
      {
        namespace: monitoringNamespace,
        storageClassName: monitoringStorageClass,
        helm: {
          victoriaMetrics: {
            version: utils.configs.helmChartVersions.victoriaMetrics,
            repositoryUrl:
              commonEsc.esc.helmRepositoryUrls[
                'victoriametrics.github.io/helm-charts'
              ],
          },
        },
        providers: { kubernetes: workstationK8sProvider },
      },
      { dependsOn: [otelOperatorHelmChart, longhornResources] },
    );

  const lokiHelmChart = new components.monitoring.LokiHelmChartComponent(
    'lokiHelmChart',
    {
      namespace: monitoringNamespace,
      storageClassName: monitoringStorageClass,
      helm: {
        loki: {
          version: utils.configs.helmChartVersions.loki,
          repositoryUrl:
            commonEsc.esc.helmRepositoryUrls[
              'grafana-community.github.io/helm-charts'
            ],
        },
      },
      providers: { kubernetes: workstationK8sProvider },
    },
    { dependsOn: [otelOperatorHelmChart, longhornResources] },
  );

  const tempoHelmChart = new components.monitoring.TempoHelmChartComponent(
    'tempoHelmChart',
    {
      namespace: monitoringNamespace,
      storageClassName: monitoringStorageClass,
      helm: {
        tempo: {
          version: utils.configs.helmChartVersions.tempo,
          repositoryUrl:
            commonEsc.esc.helmRepositoryUrls[
              'grafana-community.github.io/helm-charts'
            ],
        },
      },
      providers: { kubernetes: workstationK8sProvider },
    },
    { dependsOn: [otelOperatorHelmChart, longhornResources] },
  );

  const grafanaHost =
    cloudflareContract.output.zones.ayteneve93com.records.grafana;

  const grafanaAuthentik = new components.monitoring.GrafanaAuthentikComponent(
    'grafanaAuthentik',
    {
      hosts: {
        grafana: grafanaHost,
        authentik: cloudflareContract.output.zones.ayteneve93com.records.auth,
      },
      authentik: {
        allowedGroupId: authentikResources.output.groupIds.systemUserGroup,
        flow: {
          authorizationFlowId:
            authentikResources.output.flow
              .defaultProviderAuthorizationImplicitConsentId,
          invalidationFlowId:
            authentikResources.output.flow.defaultInvalidationFlowId,
        },
      },
      providers: { authentik: authentikProvider },
    },
    { dependsOn: [authentikResources, authentikProvider] },
  );

  const grafanaHelmChart = new components.monitoring.GrafanaHelmChartComponent(
    'grafanaHelmChart',
    {
      namespace: monitoringNamespace,
      host: grafanaHost,
      storageClassName: monitoringStorageClass,
      adminPassword: projectEsc.esc.grafana.adminPassword,
      slackWebhookUrlInfraWarning:
        projectEsc.esc.grafana.slackWebhookUrlInfraWarning,
      oidc: {
        name: grafanaAuthentik.output.oidc.name,
        issuerUrl: grafanaAuthentik.output.oidc.issuerUrl,
        authUrl: grafanaAuthentik.output.oidc.authUrl,
        tokenUrl: grafanaAuthentik.output.oidc.tokenUrl,
        apiUrl: grafanaAuthentik.output.oidc.apiUrl,
        requestedScopes: grafanaAuthentik.output.oidc.requestedScopes,
        roleAttributePath: grafanaAuthentik.output.oidc.roleAttributePath,
        clientId: grafanaAuthentik.secret.oidc.clientId,
        clientSecret: grafanaAuthentik.secret.oidc.clientSecret,
      },
      datasources: {
        victoriaMetrics: {
          url: pulumi.interpolate`http://${victoriaMetricsHelmChart.output.services.victoriaMetrics.name}.${monitoringNamespace}.svc.cluster.local:${victoriaMetricsHelmChart.output.services.victoriaMetrics.port.http}`,
        },
        loki: {
          url: pulumi.interpolate`http://${lokiHelmChart.output.services.loki.name}.${monitoringNamespace}.svc.cluster.local:${lokiHelmChart.output.services.loki.port.http}`,
        },
        tempo: {
          url: pulumi.interpolate`http://${tempoHelmChart.output.services.tempo.name}.${monitoringNamespace}.svc.cluster.local:${tempoHelmChart.output.services.tempo.port.query}`,
        },
      },
      helm: {
        grafana: {
          version: utils.configs.helmChartVersions.grafana,
          repositoryUrl:
            commonEsc.esc.helmRepositoryUrls[
              'grafana-community.github.io/helm-charts'
            ],
        },
      },
      providers: { kubernetes: workstationK8sProvider },
    },
    {
      dependsOn: [
        grafanaAuthentik,
        victoriaMetricsHelmChart,
        lokiHelmChart,
        tempoHelmChart,
      ],
    },
  );

  new components.monitoring.OtelResourcesComponent(
    'otelResources',
    {
      namespace: monitoringNamespace,
      backends: {
        victoriaMetrics: {
          remoteWriteUrl: pulumi.interpolate`http://${victoriaMetricsHelmChart.output.services.victoriaMetrics.name}.${monitoringNamespace}.svc.cluster.local:${victoriaMetricsHelmChart.output.services.victoriaMetrics.port.http}/api/v1/write`,
        },
        loki: {
          otlpHttpUrl: pulumi.interpolate`http://${lokiHelmChart.output.services.loki.name}.${monitoringNamespace}.svc.cluster.local:${lokiHelmChart.output.services.loki.port.http}/otlp`,
        },
        tempo: {
          otlpGrpcEndpoint: pulumi.interpolate`${tempoHelmChart.output.services.tempo.name}.${monitoringNamespace}.svc.cluster.local:${tempoHelmChart.output.services.tempo.port.otlpGrpc}`,
        },
      },
      providers: { kubernetes: workstationK8sProvider },
    },
    {
      dependsOn: [
        otelOperatorHelmChart,
        victoriaMetricsHelmChart,
        lokiHelmChart,
        tempoHelmChart,
      ],
    },
  );

  new components.monitoring.GrafanaServiceMeshComponent(
    'grafanaServiceMesh',
    {
      namespace: monitoringNamespace,
      ingress: {
        grafana: {
          host: grafanaHost,
          serviceName: grafanaHelmChart.output.services.grafana.name,
          gatewayPath: istioGateway.output.istioIngressGatewayPath,
          port: grafanaHelmChart.output.services.grafana.port.http,
        },
      },
      providers: { kubernetes: workstationK8sProvider },
    },
    { dependsOn: [grafanaHelmChart, istioGateway] },
  );
};
