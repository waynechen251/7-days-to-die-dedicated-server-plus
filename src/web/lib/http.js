const { stamp } = require("./time");

const wantsJson = (req) => {
  const accept = (req.headers.accept || "").toLowerCase();
  return accept.includes("application/json") || req.query.format === "json";
};

const respondJson = (res, payload = {}, status = 200) =>
  res.status(status).json({ serverTime: new Date().toISOString(), ...payload });

const respondText = (res, message = "", status = 200, withStamp = true) => {
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  const body = withStamp ? stamp(message) : message;
  res.status(status).send(body.endsWith("\n") ? body : body + "\n");
};

const sendOk = (req, res, message = "", data = null, status = 200) => {
  if (wantsJson(req))
    return respondJson(
      res,
      { ok: true, message, ...(data ? { data } : {}) },
      status
    );
  return respondText(res, message, status, true);
};

const sendErr = (req, res, message = "", status = 500, data = null) => {
  if (wantsJson(req))
    return respondJson(
      res,
      { ok: false, message, ...(data ? { data } : {}) },
      status
    );
  return respondText(res, message, status, true);
};

const writeStamped = (res, line = "") =>
  res.write(stamp(line.endsWith("\n") ? line : line + "\n"));

module.exports = {
  wantsJson,
  respondJson,
  respondText,
  sendOk,
  sendErr,
  writeStamped,
};
