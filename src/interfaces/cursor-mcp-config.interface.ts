export interface CursorMcpConfig {
  mcpServers: {
    [serverName: string]: StdioMcpServer | SseMcpServer;
  };
}

interface BaseMcpServer {
  disabled?: boolean;

  alwaysAllow?: string[];
}

interface StdioMcpServer extends BaseMcpServer {
  command: string;

  args?: string[];

  env?: {
    [key: string]: string;
  };
}

interface SseMcpServer extends BaseMcpServer {
  url: string;

  headers?: {
    [key: string]: string;
  };
}
