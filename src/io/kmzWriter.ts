import JSZip from "jszip";

export interface KmzBuildOptions {
  templateKml: string;
  waylinesWpml: string;
  dsmArrayBuffer?: ArrayBuffer;
  dsmFilename?: string;
}

export async function buildKmzBlob(
  templateKml: string,
  waylinesWpml: string,
  options?: { dsmArrayBuffer?: ArrayBuffer; dsmFilename?: string },
): Promise<Blob> {
  const zip = new JSZip();
  zip.file("wpmz/template.kml", templateKml);
  zip.file("wpmz/waylines.wpml", waylinesWpml);
  if (options?.dsmArrayBuffer && options.dsmFilename) {
    zip.file(`wpmz/res/dsm/${options.dsmFilename}`, options.dsmArrayBuffer);
  }
  return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
