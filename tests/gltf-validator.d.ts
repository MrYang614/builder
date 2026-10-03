declare module 'gltf-validator' {
  export interface Issue {
    code: string;
    message: string;
    severity: number;
    pointer?: string;
  }
  export interface ValidationReport {
    issues: {
      numErrors: number;
      numWarnings: number;
      numInfos: number;
      numHints: number;
      messages: Issue[];
    };
  }
  export function validateBytes(
    bytes: Uint8Array,
    options?: {
      uri?: string;
      maxIssues?: number;
      externalResourceFunction?: (uri: string) => Promise<Uint8Array>;
    },
  ): Promise<ValidationReport>;
}
