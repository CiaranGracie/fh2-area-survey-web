import JSZip from "jszip";

export async function buildKmzBlob(
  templateKml: string,
  waylinesWpml: string,
): Promise<Blob> {
  const zip = new JSZip();
  zip.file("wpmz/template.kml", templateKml);
  zip.file("wpmz/waylines.wpml", waylinesWpml);
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

