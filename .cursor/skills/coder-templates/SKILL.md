---
name: coder-templates
description: Creates and updates Coder workspace templates (coder_agent, coder_script, coder_parameter, registry module consumption). Use when editing templates under infra/**/assets/coder, sysbox-ubuntu, or when the user mentions Coder templates, workspace templates, coder_script, or coder_parameter. Do not use for publishing templates to the public Coder Registry.
---

# Coder Templates

Coder workspace templates are Terraform that define a workspace: agent, parameters, scripts, and the Kubernetes (or other) resources it runs on.

This repo does **not** publish templates to the public Coder Registry. Do not scaffold `registry/<namespace>/...`, do not run `coder templates push`, and do not open a PR to `coder/registry`.

Existing templates live under `infra/k8s-workstation-tools/assets/coder/` (for example `sysbox-ubuntu/main` and `sysbox-ubuntu/test`). Edit those directories in place. Match the sibling template's file split (`main.tf`, `agent.tf`, `parameters.tf`, `scripts.tf`, `modules.tf`, `assets/`) rather than collapsing everything into a single `main.tf`.

## Before You Start

Before writing or modifying any code:

1. **Understand the request.** What platform (here: Kubernetes + Sysbox) and what kind of workspace (container with nested Docker/DevContainer, etc.)?
2. **Read the existing template.** When updating, read its current resources, parameters, and module consumption first. Prefer the other variant in the same family (`main` vs `test`) as the pattern reference.
3. **Check provider docs.** Coder provider plus the platform provider (Kubernetes). Use version-specific docs when the template pins a provider version.
4. **Clarify before building.** If platform, parameters, or which variant (`main` / `test`) is unclear, ask rather than guessing.
5. **Plan briefly** when the user describes needs rather than a specific Terraform change (e.g. "Node 20 + Postgres"). List parameters, modules, and infra changes. Skip this when the action is already clear.

If you observe missing metadata, hardcoded values that should be parameters, or inline logic that an existing registry module could replace, note those as improvement opportunities. Do not silently expand scope.

Always prefer the proper implementation over a shortcut that leaves the template incomplete or fragile.

Features marked as "Premium" require a Coder Premium license. If you use one, say so in the response.

## Documentation References

### Coder

- Platform docs (latest): <https://coder.com/docs>
- Version-specific docs: `https://coder.com/docs/@v{MAJOR}.{MINOR}.{PATCH}` (e.g. <https://coder.com/docs/@v2.31.5>)
- Creating templates: <https://coder.com/docs/admin/templates/creating-templates>
- Extending templates: <https://coder.com/docs/admin/templates/extending-templates>
- Template parameters: <https://coder.com/docs/admin/templates/extending-templates/parameters>
- Dynamic parameters: <https://coder.com/docs/admin/templates/extending-templates/dynamic-parameters>
- Workspace presets: <https://coder.com/docs/admin/templates/extending-templates/parameters#workspace-presets>
- Prebuilt workspaces: <https://coder.com/docs/admin/templates/extending-templates/prebuilt-workspaces>
- Tasks: <https://coder.com/docs/ai-coder/tasks>
- Agent Boundaries: <https://coder.com/docs/ai-coder/agent-boundaries>
- Coder Registry (consume modules only): <https://registry.coder.com>

### Coder Terraform provider

- Provider docs (latest): <https://registry.terraform.io/providers/coder/coder/latest/docs>
- Version-specific: replace `latest` with a version (e.g. <https://registry.terraform.io/providers/coder/coder/2.13.1/docs>)

| Resource         | Docs                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------ |
| `coder_agent`    | <https://registry.terraform.io/providers/coder/coder/latest/docs/resources/agent>    |
| `coder_app`      | <https://registry.terraform.io/providers/coder/coder/latest/docs/resources/app>      |
| `coder_script`   | <https://registry.terraform.io/providers/coder/coder/latest/docs/resources/script>   |
| `coder_env`      | <https://registry.terraform.io/providers/coder/coder/latest/docs/resources/env>      |
| `coder_metadata` | <https://registry.terraform.io/providers/coder/coder/latest/docs/resources/metadata> |
| `coder_ai_task`  | <https://registry.terraform.io/providers/coder/coder/latest/docs/resources/ai_task>  |

| Data Source              | Docs                                                                                            |
| ------------------------ | ----------------------------------------------------------------------------------------------- |
| `coder_parameter`        | <https://registry.terraform.io/providers/coder/coder/latest/docs/data-sources/parameter>        |
| `coder_workspace`        | <https://registry.terraform.io/providers/coder/coder/latest/docs/data-sources/workspace>        |
| `coder_workspace_owner`  | <https://registry.terraform.io/providers/coder/coder/latest/docs/data-sources/workspace_owner>  |
| `coder_provisioner`      | <https://registry.terraform.io/providers/coder/coder/latest/docs/data-sources/provisioner>      |
| `coder_workspace_preset` | <https://registry.terraform.io/providers/coder/coder/latest/docs/data-sources/workspace_preset> |
| `coder_task`             | <https://registry.terraform.io/providers/coder/coder/latest/docs/data-sources/task>             |

### Platform providers

Docs: `https://registry.terraform.io/providers/ORG/NAME/latest/docs`

| Provider   | Source                 |
| ---------- | ---------------------- |
| Kubernetes | `hashicorp/kubernetes` |
| Docker     | `kreuzwerker/docker`   |
| AWS        | `hashicorp/aws`        |
| Azure      | `hashicorp/azurerm`    |
| GCP        | `hashicorp/google`     |
| Cloud-Init | `hashicorp/cloudinit`  |

## Key Patterns

- Provider version constraints must match actual needs. Only bump the `coder` provider minimum when the template uses a resource, attribute, or behavior introduced in that version.
- Include `data.coder_workspace.me` and `data.coder_workspace_owner.me`. Include `data.coder_provisioner.me` only when you need `arch` or `os` for `coder_agent`.
- Use `locals {}` for computed values.
- Use `data.coder_workspace.me.start_count` as `count` on ephemeral resources.
- Connect compute to the agent via `coder_agent.main.init_script` and `CODER_AGENT_TOKEN`.
- Add `metadata` blocks for dashboard stats (`coder stat cpu`, `coder stat mem`, etc.).
- Use `coder_metadata` on the primary compute resource to surface key details.
- Optionally use `display_apps` to hide built-in apps.
- Before implementing from scratch, search <https://registry.coder.com> for a module. Consume it rather than reimplementing. Prefer the actively maintained module; do not use deprecated ones.
- Before consuming a module, read its docs for variables, outputs, and runtime prerequisites. Never pass arguments without confirming they exist. If the workspace image lacks a required tool, install it before that module's script runs. `terraform validate` will not catch this.
- Module source URLs: `registry.coder.com/<namespace>/<module>/coder`. Older `registry.coder.com/modules/...` still works; prefer the shorter form for new references.
- Label infrastructure with `coder.owner` and `coder.workspace_id`.
- Use `lifecycle { ignore_changes = all }` on persistent volumes to prevent data loss.
- Comment only non-obvious constraints or workarounds, not narration.

### Additional files

This repo's templates typically include:

- Split `.tf` files instead of one `main.tf`
- `assets/scripts/`: JS or other runtime scripts
- `assets/templates/*.tpl`: `templatefile()` wrappers (shell launchers, cloud-init, etc.)
- `assets/icons/`, `assets/files/`

### Parameters

Use `data "coder_parameter"` for user-facing options.

- Prefer `dynamic "option"` with `for_each` from a `locals` map over long static `option` lists.
- `form_type`: `dropdown`, `multi-select` (for `list(string)`), `slider`, `radio`, `checkbox`, `textarea`.
- Conditional parameters: `count` based on another parameter's value.
- `mutable = false` for infra that cannot change after create (region, disk); `mutable = true` for runtime config.
- `ephemeral = true` for one-shot build options that should not persist between starts.
- `validation {}` with `min`/`max`/`monotonic` or `regex`/`error`.
- Dynamic parameter features require Coder provider `>= 2.4.0`.

### Presets

Bundle common parameter combinations with `data "coder_workspace_preset"`:

```tf
data "coder_workspace_preset" "default" {
  name    = "Standard Dev Environment"
  default = true

  parameters = {
    "cpu"    = "4"
    "memory" = "8"
  }
}
```

- Keys in `parameters` must match `coder_parameter` `name` values in the same template.
- At most one preset may have `default = true`.
- Optional: `description`, `icon`.

### Prebuilds (Premium)

Prebuilds keep a pool of pre-provisioned workspaces for a preset. Nested inside the preset:

```tf
prebuilds {
  instances = 3

  expiration_policy {
    ttl = 86400
  }

  scheduling {
    timezone = "UTC"
    schedule {
      cron      = "* 8-18 * * 1-5"
      instances = 5
    }
  }
}
```

- `scheduling.cron` minute field must always be `*`.
- When a prebuild is claimed, ownership transfers. Use `lifecycle { ignore_changes = [...] }` on resources that reference owner-specific values.

### Task-Oriented Templates

A template becomes task-capable with `coder_ai_task`:

```tf
resource "coder_ai_task" "task" {
  count  = data.coder_workspace.me.start_count
  app_id = module.claude-code[count.index].task_app_id
}

data "coder_task" "me" {}

module "claude-code" {
  count           = data.coder_workspace.me.start_count
  source          = "registry.coder.com/coder/claude-code/coder"
  version         = "~> 4.0"
  agent_id        = coder_agent.main.id
  workdir         = "/home/coder/projects"
  ai_prompt       = data.coder_task.me.prompt
  system_prompt   = data.coder_parameter.system_prompt.value
  model           = "sonnet"
  permission_mode = "plan"
  enable_boundary = true
}
```

- `app_id` must be the agent module's `task_app_id` output.
- Pass `data.coder_task.me.prompt` as `ai_prompt`.
- `enable_boundary = true` enables network filtering. See <https://coder.com/docs/ai-coder/agent-boundaries>.
- A `coder_app` with `slug = "preview"` is special-cased in the Tasks UI.

## README.md

This repo's template READMEs are for workspace users, not the public registry.

- No YAML frontmatter, no registry icon paths, no "do not list parameters" rule.
- Keep the existing style: what the workspace is, parameters the user will see, how to use Vault/Git/lifecycle scripts.
- Update the changelog when behavior changes.

## Final Checks

- Follow the existing template's Terraform file layout and naming.
- Shell/`nvm` wrappers that source `$HOME/.bashrc` or `nvm.sh` must not enable `set -u` before the source.
- Scripts should fail open on missing optional tools (e.g. nvm not ready yet) rather than breaking the workspace.
- Do not add `coder templates push`, Registry README frontmatter, or a contribution PR unless the user explicitly asks to publish.
