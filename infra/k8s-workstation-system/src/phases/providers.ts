import * as nexus from '@common/nexus';
import * as github from '@pulumi/github';
import * as kubernetes from '@pulumi/kubernetes';
import * as oci from '@pulumi/oci';

export const deployProviders = () => {
  const githubEsc = nexus.esc.githubEsc;

  // K8s Provider
  const workstationK8sProvider = new kubernetes.Provider(
    'workstationK8sProvider',
    {
      kubeconfig: nexus.esc.commonEsc.esc.workstationKubeconfig,
    },
  );

  // Github Provider
  const apexCaptainGithubProvider = new github.Provider(
    'apexCaptainGithubProvider',
    {
      token: githubEsc.esc.apexCaptain.token,
    },
  );

  // OCI Provider
  const ociProvider = new oci.Provider('ociProvider', {
    auth: nexus.esc.ociEsc.esc.auth,
    fingerprint: nexus.esc.ociEsc.esc.fingerprint,
    privateKey: nexus.esc.ociEsc.esc.privateKey,
    region: nexus.esc.ociEsc.esc.region,
    tenancyOcid: nexus.esc.ociEsc.esc.tenancyOcid,
    userOcid: nexus.esc.ociEsc.esc.userOcid,
  });

  return { workstationK8sProvider, apexCaptainGithubProvider, ociProvider };
};

export type SystemProviders = ReturnType<typeof deployProviders>;
