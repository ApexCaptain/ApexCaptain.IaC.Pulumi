variable "use_kubeconfig" {
  type        = bool
  description = <<-EOF
  Use host kubeconfig? (true/false)

  Set this to false if the Coder host is itself running as a Pod on the same
  Kubernetes cluster as you are deploying workspaces to.

  Set this to true if the Coder host is running outside the Kubernetes cluster
  for workspaces.  A valid "~/.kube/config" must be present on the Coder host.
  EOF
  default     = false
}

variable "namespace" {
  type        = string
  description = "The Kubernetes namespace to create workspaces in (must exist prior to creating workspaces). If the Coder host is itself running as a Pod on the same Kubernetes cluster as you are deploying workspaces to, set this to the same namespace."
}

variable "runtime_class_name" {
  type        = string
  description = "The runtime class name to use for the workspace (containerd handler must set privileged_without_host_devices)"
  default     = "kata"
}

variable "home_storage_class_name" {
  type        = string
  description = "The storage class name to use for the home storage"
}

variable "docker_storage_class_name" {
  type        = string
  description = "The storage class name to use for the docker storage"
}

variable "data_storage_class_name" {
  type        = string
  description = "The storage class name to use for the data storage"
}

variable "workspace_directory_name" {
  type        = string
  description = "The name of the workspace directory"
}

variable "istio_proxy_image" {
  type        = string
  description = "Istio proxyv2 image for the istio-validation init container override (must match the mesh version)"
}

variable "vault_addr" {
  type        = string
  description = "Public Vault API URL (HTTPS)"
}

variable "vault_jwt_auth_path" {
  type        = string
  description = "Vault JWT auth mount path for Coder workspace login"
}

variable "vault_jwt_role" {
  type        = string
  description = "Vault JWT auth role for Coder workspace login"
}

variable "vault_cli_version" {
  type        = string
  description = "Vault CLI version installed in workspaces (matches the Vault server, from versions.config.ts)"
}