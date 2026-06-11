import type { MutableDaemonConfigPatch } from "@chisacode/protocol/messages";

export interface AcpProviderCatalogEntry {
  id: string;
  title: string;
  description: string;
  version: string;
  installLink: string;
  command: readonly [string, ...string[]];
  env?: Readonly<Record<string, string>>;
}

export type AcpProviderCatalogItem = AcpProviderCatalogEntry;

export function getAcpProviderCatalog(): AcpProviderCatalogItem[] {
  return [];
}

export function buildAcpProviderConfigPatch(
  entry: AcpProviderCatalogItem,
): MutableDaemonConfigPatch {
  return {
    providers: {
      [entry.id]: {
        extends: "acp",
        label: entry.title,
        description: entry.description,
        command: [...entry.command],
        env: entry.env ? { ...entry.env } : {},
      },
    },
  };
}

export function useAcpProviderCatalog() {
  return {
    entries: [] as AcpProviderCatalogItem[],
    loading: false,
    error: null,
    refetch: async () => [],
  };
}
