interface ImportMeta {
  glob<TModule = unknown>(
    pattern: string,
    options?: {
      readonly eager?: false
    },
  ): Record<string, () => Promise<TModule>>

  glob<TModule = unknown>(
    pattern: string,
    options: {
      readonly eager: true
    },
  ): Record<string, TModule>
}
