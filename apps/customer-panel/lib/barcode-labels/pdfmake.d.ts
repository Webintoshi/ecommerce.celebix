declare module "pdfmake/build/pdfmake.js" {
  const value: {
    vfs: Record<string, string>;
    addVirtualFileSystem(vfs: Record<string, string>): void;
    fonts: Record<string, unknown>;
    createPdf(definition: unknown): {
      getBuffer(callback: (buffer: Uint8Array) => void): void;
    };
  };
  export default value;
}
declare module "pdfmake/build/vfs_fonts.js" {
  const value: Record<string, string>;
  export default value;
}
