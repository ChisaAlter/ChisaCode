export interface AcpProviderCatalogEntry {
  id: string;
  title: string;
  description: string;
  version: string;
  installLink: string;
  command: readonly [string, ...string[]];
  env?: Readonly<Record<string, string>>;
}

export const ACP_PROVIDER_CATALOG: AcpProviderCatalogEntry[] = [];
