declare module "word-extractor" {
    // تعريف مبسّط يكفي لاستخدامنا
    class WordDocument {
      getBody(): string;
    }
  
    class WordExtractor {
      constructor();
      extract(input: Buffer | ArrayBuffer | Uint8Array | string): Promise<WordDocument>;
    }
  
    export = WordExtractor; // المكتبة CommonJS
  }
  