import JSZip from "jszip";

// PptxGenJS numbers tables independently of other shapes. Operate only on its
// generated parts: preserve valid identities and every byte outside a duplicate
// id attribute. This is not an arbitrary/imported OOXML repair API.
export function uniqueShapeIds(xml: string): string {
  const tags = [...xml.matchAll(/<p:cNvPr\b[^>]*>/g)];
  const ids = tags.map(([tag]) => {
    const value = /\bid\s*=\s*(["'])(\d+)\1/.exec(tag)?.[2];
    const id = value === undefined ? NaN : Number(value);
    if (!Number.isInteger(id) || id < 0 || id > 0xffffffff) {
      throw new Error("PPTX shape identity: invalid nonvisual id");
    }
    return id;
  });
  const reserved = new Set(ids);
  if (reserved.size === ids.length) return xml;

  const seen = new Set<number>();
  const duplicates = new Set(ids.filter(id => {
    if (seen.has(id)) return true;
    seen.add(id);
    return false;
  }));
  // Connector ends, animation/build targets and legacy shape references carry
  // shape IDs, unlike relationship r:ids. A duplicate target is ambiguous; no
  // choice of renumbering can recover its intended object from the archive.
  const references = [
    ...xml.matchAll(/\b(?:spid|spId|shapeId)\s*=\s*(["'])(\d+)\1/g),
    ...xml.matchAll(/<a:(?:stCxn|endCxn)\b[^>]*\bid\s*=\s*(["'])(\d+)\1/g),
  ];
  if (references.some(match => duplicates.has(Number(match[2])))) {
    throw new Error("PPTX shape identity: ambiguous duplicate shape reference");
  }

  seen.clear();
  let next = 1;
  let index = 0;
  return xml.replace(/<p:cNvPr\b[^>]*>/g, tag => {
    const id = ids[index++]!;
    if (!seen.has(id)) {
      seen.add(id);
      return tag;
    }
    while (reserved.has(next)) next++;
    if (next > 0xffffffff) throw new Error("PPTX shape identity: no unused id");
    const replacement = next++;
    reserved.add(replacement);
    return tag.replace(/(\bid\s*=\s*)(["'])\d+\2/, `$1$2${replacement}$2`);
  });
}

export async function uniquePptxShapeIds(bytes: Uint8Array): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(bytes);
  let changed = false;
  for (const part of zip.file(/^ppt\/(?:slides|slideLayouts|slideMasters|notesSlides|notesMasters)\/[^/]+\.xml$/)) {
    const xml = await part.async("string");
    const corrected = uniqueShapeIds(xml);
    if (corrected === xml) continue;
    zip.file(part.name, corrected);
    changed = true;
  }
  return changed ? zip.generateAsync({ type: "uint8array" }) : bytes;
}
