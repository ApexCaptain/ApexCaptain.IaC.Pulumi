import axios from 'axios';
import chalk from 'chalk';
import semver from 'semver';
import { BridgedProviderSource } from '../enums';

export class BridgedProvider {
  readonly name: string;
  readonly packagesToOverride = new Array<string>();
  constructor(
    private readonly option: {
      name: string;
      source: BridgedProviderSource;
      version?: string;
      parameters?: string[];
      packagesToOverride?: string[];
    },
  ) {
    this.name = option.name;
    if (option.packagesToOverride) {
      this.packagesToOverride.push(...option.packagesToOverride);
    }
  }

  toJson() {
    return {
      source: this.option.source,
      version: this.option.version,
      parameters: this.option.parameters,
    } as const;
  }
}

// curl -s https://registry.terraform.io/v1/providers/hashicorp/local | json_pp | grep '"version"' | head -n 1

export class TerraformBridgedProvider extends BridgedProvider {
  constructor(option: {
    name: string;
    converterVersion?: string;
    providerSource: string;
    providerVersion?: string;
    packagesToOverride?: string[];
  }) {
    const {
      name,
      converterVersion,
      providerSource,
      providerVersion,
      packagesToOverride,
    } = option;
    super({
      name,
      source: BridgedProviderSource.TERRAFORM,
      version: converterVersion,
      parameters: [providerSource, providerVersion].filter(
        each => each !== undefined,
      ),
      packagesToOverride,
    });

    if (providerVersion) {
      axios
        .get(
          `https://registry.terraform.io/v1/providers/${option.providerSource}`,
        )
        .then(response => {
          const latestVersion = response.data.version as string;
          if (semver.gt(latestVersion, providerVersion)) {
            console.warn(
              chalk.yellow(
                `The latest version of ${option.providerSource} is ${latestVersion}, but the current version is ${option.providerVersion}.`,
              ),
            );
          }
        })
        .catch(error => {
          console.error(chalk.red(error));
        });
    }
  }
}
