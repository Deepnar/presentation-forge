const LIMIT = 8192;

export function scalarText(value) {
  if (typeof value !== 'string') return false;
  for (let i = 0; i < value.length; i++) {
    const unit = value.charCodeAt(i);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return false;
  }
  return true;
}

export function validSnippetLocator(value) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === 4 && ['kind','startByte','endByte','quote'].every(k => Object.hasOwn(value,k)) &&
    value.kind === 'snippet-utf8-v1' && Number.isSafeInteger(value.startByte) && Number.isSafeInteger(value.endByte) &&
    value.startByte >= 0 && value.startByte < value.endByte && value.endByte <= LIMIT &&
    scalarText(value.quote) && value.quote.length > 0 && Buffer.byteLength(value.quote) <= LIMIT;
}

// A retained JSON string can contain lone surrogates; UTF-8 encoding would repair them.
export function snippetRangeStatus(locator, excerpt) {
  if (locator === undefined) return 'not-requested';
  if (excerpt === undefined) return 'unavailable';
  if (!scalarText(excerpt)) return 'unsupported-excerpt';
  const bytes = Buffer.from(excerpt);
  const boundary = at => at === bytes.length || (bytes[at] & 0xc0) !== 0x80;
  if (locator.endByte > bytes.length || !boundary(locator.startByte) || !boundary(locator.endByte)) return 'invalid';
  return 'range-valid';
}

export function snippetLocatorStatus(locator, excerpt) {
  const range = snippetRangeStatus(locator,excerpt);
  if (range !== 'range-valid') return range;
  return Buffer.from(excerpt).subarray(locator.startByte,locator.endByte).equals(Buffer.from(locator.quote)) ? 'matched' : 'mismatch';
}
