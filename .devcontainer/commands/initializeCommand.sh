#!/usr/bin/env bash

# DevContainer Arguments
localWorkspaceFolder=$1  
containerWorkspaceFolder=$2 
localWorkspaceFolderBasename=$3   
containerWorkspaceFolderBasename=$4   
username=$5

MERGED_ENV_FILE_PATH=.devcontainer/.env

# System Arguments (depend on workstation settings)
SECRETS_DIR_PATH=$HOME/google-drive 
SECRETS_ENV_DIR_PATH=$SECRETS_DIR_PATH/.pulumi/.env
KUBE_CONFIG_DIR_NAME=.kube
KUBE_CONFIG_DIR_PATH=${containerWorkspaceFolder}/${KUBE_CONFIG_DIR_NAME}
KUBE_CONFIG_WORKSTATION_FILE_NAME=ws.yaml
KUBE_CONFIG_WORKSTATION_FILE_PATH=${KUBE_CONFIG_DIR_PATH}/${KUBE_CONFIG_WORKSTATION_FILE_NAME}
KUBE_CONFIG_FILE_PATH=${KUBE_CONFIG_DIR_PATH}/config
SECRETS_DIR_NAME=.secrets
PULUMI_HOME=/home/$username/.pulumi

DIAGNOSIS_DIR_NAME=.diagnosis
DIAGNOSIS_DIR_PATH=${containerWorkspaceFolder}/.diagnosis

NOVA_CONFIG_FILE_NAME=.nova-config.json
NOVA_CONFIG_FILE_PATH=${containerWorkspaceFolder}/${NOVA_CONFIG_FILE_NAME}

VIRTUAL_ENV_DIR_NAME=.venv

KEYS_DIR_NAME=.keys
WORKSTATION_SSH_PRIVATE_KEY_FILE_NAME=workstation.key
WORKSTATION_SSH_PRIVATE_KEY_FILE_ABSOLUTE_PATH=${containerWorkspaceFolder}/${KEYS_DIR_NAME}/${WORKSTATION_SSH_PRIVATE_KEY_FILE_NAME}

# Create docker-compose.dev.yml arg
cat > $MERGED_ENV_FILE_PATH <<EOL
# Original DevContainer Arguments
localWorkspaceFolder=$localWorkspaceFolder
containerWorkspaceFolder=$containerWorkspaceFolder
localWorkspaceFolderBasename=$localWorkspaceFolderBasename
containerWorkspaceFolderBasename=$containerWorkspaceFolderBasename 
username=$username

# Corepack Arguments
COREPACK_ENABLE_DOWNLOAD_PROMPT=0

# Shared Volume Arguments
## Pnpm Store Directory Path
CONTAINER_PNPM_STORE_DIR_PATH=${containerWorkspaceFolder}/.pnpm-store

# Kubernetes Arguments
KUBE_CONFIG_DIR_NAME=$KUBE_CONFIG_DIR_NAME
KUBE_CONFIG_DIR_PATH=$KUBE_CONFIG_DIR_PATH
KUBE_CONFIG_FILE_PATH=$KUBE_CONFIG_FILE_PATH
KUBECONFIG=$KUBE_CONFIG_FILE_PATH
KUBE_CONFIG_WORKSTATION_FILE_NAME=$KUBE_CONFIG_WORKSTATION_FILE_NAME
KUBE_CONFIG_WORKSTATION_FILE_PATH=$KUBE_CONFIG_WORKSTATION_FILE_PATH

# Virtual Environment Arguments
VIRTUAL_ENV_DISABLE_PROMPT=1
VIRTUAL_ENV_DIR_NAME=$VIRTUAL_ENV_DIR_NAME
VIRTUAL_ENV_DIR_PATH=${containerWorkspaceFolder}/${VIRTUAL_ENV_DIR_NAME}

# Diagnosis Arguments
DIAGNOSIS_DIR_NAME=$DIAGNOSIS_DIR_NAME
DIAGNOSIS_DIR_PATH=$DIAGNOSIS_DIR_PATH
DIAGNOSIS_NOVA_FILE_PATH=${DIAGNOSIS_DIR_PATH}/nova.diagnosis.md

# Nova Arguments
NOVA_CONFIG_FILE_NAME=$NOVA_CONFIG_FILE_NAME
NOVA_CONFIG_FILE_PATH=$NOVA_CONFIG_FILE_PATH

# Keys Argument
KEYS_DIR_NAME=$KEYS_DIR_NAME
KEYS_DIR_PATH=${containerWorkspaceFolder}/${KEYS_DIR_NAME}

# Workstation Arguments
WORKSTATION_SSH_PRIVATE_KEY_FILE_NAME=$WORKSTATION_SSH_PRIVATE_KEY_FILE_NAME
WORKSTATION_SSH_PRIVATE_KEY_FILE_ABSOLUTE_PATH=$WORKSTATION_SSH_PRIVATE_KEY_FILE_ABSOLUTE_PATH

# Pulumi Arguments
PULUMI_HOME=$PULUMI_HOME
PULUMI_PLUGIN_DIR=$PULUMI_HOME/plugins
PULUMI_DYNAMIC_TF_PLUGIN_DIR=$PULUMI_HOME/dynamic_tf_plugins
PULUMI_CONTRACT_HASH_DIR_PATH=$containerWorkspaceFolder/${SECRETS_DIR_NAME}/.pulumi/.contract
PULUMI_CONTRACT_KEYS_DIR_PATH=$containerWorkspaceFolder/${SECRETS_DIR_NAME}/.pulumi/.keys
PULUMI_GENERATED_KUBECONFIG_DIR_PATH=$KUBE_CONFIG_DIR_PATH
PULUMI_PORT_FORWARDING_WORKSTATION_VAULT=28200

# Secrets Arguments
HOST_SECRETS_DIR_PATH=$SECRETS_DIR_PATH
SECRETS_DIR_NAME=$SECRETS_DIR_NAME
CONTAINER_SECRETS_DIR_PATH=$containerWorkspaceFolder/${SECRETS_DIR_NAME}


# Merged env
EOL

for file in $SECRETS_ENV_DIR_PATH/*.env;
do
    if [ -f "$file" ]; then
        echo "# ${file##*/}" >> "$MERGED_ENV_FILE_PATH"
        cat "$file" >> "$MERGED_ENV_FILE_PATH"
        echo "" >> "$MERGED_ENV_FILE_PATH"
    fi
done

# Make all derived sh files executable
chmod +x ./.devcontainer/commands/common/*.sh