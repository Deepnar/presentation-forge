export function singleFlight(fn) {
  const calls = new Map();
  return (key, ...rest) => {
    if (!calls.has(key)) calls.set(key, Promise.resolve().then(() => fn(key, ...rest)));
    return calls.get(key);
  };
}
