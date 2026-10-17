export interface RulesyncStdioMcpServer {
  type: 'stdio';

  command: string;

  args?: string[];

  envFile?: string;

  env?: {
    [key: string]: string;
  };
}

export interface RulesyncMcpServers {
  [serverName: string]: RulesyncStdioMcpServer;
}

export interface RulesyncMcpConfig {
  mcpServers: RulesyncMcpServers;

  cursor?: { mcpServers: RulesyncMcpServers };

  claudecode?: { mcpServers: RulesyncMcpServers };
}
