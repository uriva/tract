declare module "bidi-js" {
  export interface EmbeddingLevels {
    levels: Uint8Array;
    paragraphs: { start: number; end: number; level: number }[];
  }

  export interface Bidi {
    getEmbeddingLevels(
      text: string,
      baseDirection?: "ltr" | "rtl" | "auto",
    ): EmbeddingLevels;
    getReorderSegments(
      text: string,
      embeddingLevels: EmbeddingLevels,
      start?: number,
      end?: number,
    ): [number, number][];
    getReorderedString(text: string, embeddingLevels: EmbeddingLevels): string;
    getReorderedIndices(
      text: string,
      embeddingLevels: EmbeddingLevels,
    ): number[];
    getMirroredCharactersMap(
      text: string,
      embeddingLevels: EmbeddingLevels,
      start?: number,
      end?: number,
    ): Map<number, string>;
    getMirroredCharacter(char: string): string | null;
  }

  export default function bidiFactory(): Bidi;
}
