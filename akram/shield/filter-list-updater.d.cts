export interface AkramFilterTransportResponse {
  response: {
    status: number;
    headers?: Headers | Record<string, string>;
    body: ReadableStream<Uint8Array> | AsyncIterable<Uint8Array> | Uint8Array | Buffer | string | null;
  };
  /** Final URL after the transport has validated every redirect hop. */
  finalUrl: string;
}

export interface AkramFilterListMetadata {
  readonly id: string;
  readonly url: string;
  readonly sha256: string;
  readonly byteLength: number;
  readonly lineCount: number;
  readonly networkRuleCount: number;
  readonly cosmeticRuleCount: number;
  readonly unsupportedLineCount: number;
  readonly enabled: boolean;
  readonly etag: string | null;
  readonly lastModified: string | null;
  readonly updatedAt: string;
}

export declare class AkramFilterListUpdater {
  constructor(options: {
    manager: {
      addFilterList(input: { id: string; source: string; content: string; enabled?: boolean }): {
        networkRuleCount: number; cosmeticRuleCount: number; unsupportedLineCount: number; enabled: boolean;
      };
      updateFilterList(input: { id: string; source: string; content: string }): {
        networkRuleCount: number; cosmeticRuleCount: number; unsupportedLineCount: number; enabled: boolean;
      };
      listFilterLists(): Array<{ id: string }>;
    };
    /** Must enforce DNS/IP SSRF checks and validate every redirect hop. */
    fetcher: (url: string, init: {
      method: 'GET';
      headers: Record<string, string>;
      signal?: AbortSignal;
      timeoutMs: number;
      maxRedirects: number;
      maxBytes: number;
    }) => Promise<AkramFilterTransportResponse>;
    allowedHosts: string[];
    limits?: { maxBytes?: number; maxLines?: number; maxRedirects?: number; timeoutMs?: number };
  });
  registerSource(input: { id: string; url: string; enabled?: boolean }): Readonly<{ id: string; url: string; enabled: boolean; metadata: AkramFilterListMetadata | null }>;
  getSource(id: string): Readonly<{ id: string; url: string; enabled: boolean; metadata: AkramFilterListMetadata | null }> | null;
  listSources(): Array<ReturnType<AkramFilterListUpdater['getSource']>>;
  update(id: string, options?: { signal?: AbortSignal }): Promise<
    | Readonly<{ status: 'not-modified'; id: string; metadata: AkramFilterListMetadata }>
    | Readonly<{ status: 'updated'; id: string; metadata: AkramFilterListMetadata }>
  >;
}

export declare function validateFilterText(text: string, limits: { maxBytes: number; maxLines: number }): {
  lineCount: number; networkRuleCount: number; cosmeticRuleCount: number;
};
