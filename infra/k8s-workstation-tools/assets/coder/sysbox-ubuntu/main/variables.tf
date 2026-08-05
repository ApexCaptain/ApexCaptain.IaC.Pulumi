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
  description = "The runtime class name to use for the workspace"
  default     = "sysbox-runc"
}

variable "storage_class_name" {
  type        = string
  description = "The storage class name to use for the workspace"
}

variable "workspace_directory_name" {
  type        = string
  description = "The name of the workspace directory"
}

variable "mesh_proxy_host" {
  type        = string
  description = "The namespace-shared SOCKS5 proxy host used to reach mesh services"
}

variable "mesh_proxy_port" {
  type        = number
  description = "The namespace-shared SOCKS5 proxy port used to reach mesh services"
}

variable "mesh_proxy_url" {
  type        = string
  description = "The namespace-shared SOCKS5 proxy URL; applications should resolve destination DNS through the proxy"
}

variable "lxcfs_host_mount_path" {
  type        = string
  description = "The host mount path to use for the LXCFS"
  default     = "/var/lib/lxc/lxcfs"
}

variable "device_plugin_fuse_key" {
  type        = string
  description = "The key to use for the device plugin fuse"
}

variable "device_plugin_fuse_count_limit" {
  type        = number
  description = "The count limit to use for the device plugin fuse per workspace"
  default     = 2
}