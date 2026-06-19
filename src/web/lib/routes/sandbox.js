module.exports = function registerSandboxRoutes(app, ctx) {
  const { http, sandboxCode } = ctx;

  app.get("/api/sandbox/schema", (req, res) => {
    return http.respondJson(
      res,
      {
        ok: true,
        data: sandboxCode.getClientSchema(),
      },
      200
    );
  });

  app.post("/api/sandbox/decode", (req, res) => {
    const code = req.body?.code;
    const includeDefaults = req.body?.includeDefaults !== false;
    const result = sandboxCode.decode(code, { includeDefaults });
    return http.respondJson(
      res,
      {
        ok: result.valid,
        data: result,
        message: result.valid ? undefined : "SandboxCode 無法解析",
      },
      result.valid ? 200 : 400
    );
  });

  app.post("/api/sandbox/encode", (req, res) => {
    const selections = req.body?.selections;
    const includeDefaults = req.body?.includeDefaults === true;
    const result = sandboxCode.encode(selections, { includeDefaults });
    return http.respondJson(
      res,
      {
        ok: result.valid,
        data: result,
        message: result.valid ? undefined : "SandboxCode 無法編碼",
      },
      result.valid ? 200 : 400
    );
  });
};
