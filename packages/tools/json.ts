export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

// Tool boundaries accept JSON data, never live objects with executable accessors.
export function cloneJson(input: unknown, maxChars = 65536): Json {
  let nodes = 0, chars = 0;
  const seen = new Set<object>();
  function copy(value: unknown, depth: number): Json {
    if (++nodes > 12000 || depth > 20) throw new Error('input budget');
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      chars += value.length;
      if (chars > maxChars) throw new Error('input budget');
      return value;
    }
    if (typeof value !== 'object' || !value || seen.has(value)) throw new Error('non-JSON input');
    const array = Array.isArray(value);
    if (Object.getPrototypeOf(value) !== (array ? Array.prototype : Object.prototype) && Object.getPrototypeOf(value) !== null) throw new Error('non-plain input');
    seen.add(value);
    const result: Json[] | { [key: string]: Json } = array ? [] : Object.create(null);
    for (const key of Reflect.ownKeys(value)) {
      if (array && key === 'length') continue;
      if (typeof key !== 'string' || ['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('unsafe key');
      if (array && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= (value as unknown[]).length)) throw new Error('array property');
      const desc = Object.getOwnPropertyDescriptor(value, key)!;
      if (!desc.enumerable || !('value' in desc)) throw new Error('accessor');
      chars += key.length;
      if (chars > maxChars) throw new Error('input budget');
      (result as { [key: string]: Json })[key] = copy(desc.value, depth + 1);
    }
    if (array && Object.keys(result).length !== (value as unknown[]).length) throw new Error('sparse array');
    seen.delete(value);
    return result;
  }
  const result = copy(input, 0);
  if (JSON.stringify(result).length > maxChars) throw new Error('input budget');
  return result;
}
