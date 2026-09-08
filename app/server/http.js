export const ok = (res, data = {}) => res.json({ ok: true, ...data });

export const fail = (res, code, message) =>
  res.status(code).json({ ok: false, error: message });

export const wrap = (fn) => (req, res) =>
  Promise.resolve(fn(req, res)).catch((error) => fail(res, 500, error.message));
