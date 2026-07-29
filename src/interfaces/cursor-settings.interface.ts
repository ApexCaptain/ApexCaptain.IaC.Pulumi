export interface CursorSettings {
  plugins?: {
    [pluginName: string]: CursorPluginSettings;
  };
}

interface CursorPluginSettings {
  enabled?: boolean;
}
