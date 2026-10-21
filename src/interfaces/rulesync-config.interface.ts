export type RulesyncTarget = 'cursor' | 'claudecode';

export type RulesyncFeature = 'rules' | 'mcp' | 'skills' | 'hooks';

export interface RulesyncConfig {
  targets: { [target in RulesyncTarget]?: RulesyncFeature[] };

  outputRoots: string[];

  delete: boolean;
}
