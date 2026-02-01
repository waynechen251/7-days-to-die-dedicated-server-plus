module.exports = function registerAuthRoutes(app, ctx) {
  const { http, auth } = ctx;

  // ─── 登入限制 ───────────────────────────────────────
  const loginAttempts = new Map(); // ip → { count, lockedUntil }
  const MAX_ATTEMPTS = 5;
  const LOCKOUT_MS = 60 * 1000; // 鎖定 1 分鐘

  function checkLoginLimit(ip) {
    const record = loginAttempts.get(ip);
    if (!record) return true;
    if (record.lockedUntil && Date.now() < record.lockedUntil) return false;
    return true;
  }

  function recordLoginFail(ip) {
    const record = loginAttempts.get(ip) || { count: 0 };
    record.count++;
    if (record.count >= MAX_ATTEMPTS) {
      record.lockedUntil = Date.now() + LOCKOUT_MS;
      record.count = 0;
    }
    loginAttempts.set(ip, record);
  }

  function clearLoginFail(ip) {
    loginAttempts.delete(ip);
  }

  // ─── 公開路由（不需驗證） ─────────────────────────

  // 檢查是否需要首次設定
  app.get("/api/auth/setup-required", (req, res) => {
    return http.respondJson(res, { ok: true, setupRequired: auth.isSetupRequired() });
  });

  // 首次設定：建立第一個 admin
  app.post("/api/auth/setup", (req, res) => {
    if (!auth.isSetupRequired())
      return http.sendErr(req, res, "已經完成設定", 400);

    const { username, password } = req.body || {};
    if (!username || !password)
      return http.sendErr(req, res, "請填寫帳戶名稱和密碼", 400);
    if (username.length < 2 || username.length > 32)
      return http.sendErr(req, res, "帳戶名稱長度需為 2-32 字元", 400);
    if (password.length < 4)
      return http.sendErr(req, res, "密碼長度至少 4 字元", 400);

    const result = auth.createUser(username, password, "admin");
    if (!result.ok) return http.sendErr(req, res, result.message, 400);

    // 建立後自動登入
    const loginResult = auth.login(username, password);
    res.cookie(auth.SESSION_COOKIE, loginResult.sessionId, {
      httpOnly: true,
      sameSite: "Strict",
      maxAge: 24 * 60 * 60 * 1000,
    });
    return http.respondJson(res, { ok: true, user: loginResult.user });
  });

  // 登入
  app.post("/api/auth/login", (req, res) => {
    const ip = req.ip;
    if (!checkLoginLimit(ip))
      return http.sendErr(req, res, "登入嘗試次數超限，請稍後重試", 429);

    const { username, password } = req.body || {};
    if (!username || !password)
      return http.sendErr(req, res, "請填寫帳戶名稱和密碼", 400);

    const result = auth.login(username, password);
    if (!result) {
      recordLoginFail(ip);
      return http.sendErr(req, res, "帳戶名稱或密碼錯誤", 401);
    }

    clearLoginFail(ip);
    res.cookie(auth.SESSION_COOKIE, result.sessionId, {
      httpOnly: true,
      sameSite: "Strict",
      maxAge: 24 * 60 * 60 * 1000,
    });
    return http.respondJson(res, { ok: true, user: result.user });
  });

  // 退出（不需驗證，只清除 cookie）
  app.post("/api/auth/logout", (req, res) => {
    const sessionId = parseCookie(req.headers.cookie, auth.SESSION_COOKIE);
    if (sessionId) auth.destroySession(sessionId);
    res.clearCookie(auth.SESSION_COOKIE);
    return http.respondJson(res, { ok: true });
  });

  // ─── 需驗證的路由 ─────────────────────────────────

  // 取得當前使用者
  app.get("/api/auth/me", auth.requireAuth, (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    return http.respondJson(res, { ok: true, user: req.authUser });
  });

  // 列出所有帳戶（admin / operator）
  app.get("/api/auth/users", auth.requireAuth, (req, res) => {
    if (!["admin", "operator"].includes(req.authUser.role))
      return http.sendErr(req, res, "許可被拒", 403);
    res.setHeader("Cache-Control", "no-store");
    return http.respondJson(res, { ok: true, users: auth.getUsers() });
  });

  // 新增帳戶（admin / operator）
  app.post("/api/auth/users", auth.requireAuth, (req, res) => {
    const actor = req.authUser;
    if (!["admin", "operator"].includes(actor.role))
      return http.sendErr(req, res, "許可被拒", 403);

    const { username, password, role } = req.body || {};
    if (!username || !password || !role)
      return http.sendErr(req, res, "請填寫帳戶名稱、密碼和角色", 400);
    if (username.length < 2 || username.length > 32)
      return http.sendErr(req, res, "帳戶名稱長度需為 2-32 字元", 400);
    if (password.length < 4)
      return http.sendErr(req, res, "密碼長度至少 4 字元", 400);

    // 權限檢查：Operator 只能建立 Viewer
    if (actor.role === "operator" && role !== "viewer") {
      return http.sendErr(req, res, "操作員只能建立觀察者帳戶", 403);
    }

    const result = auth.createUser(username, password, role);
    if (!result.ok) return http.sendErr(req, res, result.message, 400);
    return http.respondJson(res, { ok: true, user: result.user });
  });

  // 修改帳戶（admin / operator）
  app.put("/api/auth/users/:id", auth.requireAuth, (req, res) => {
    const actor = req.authUser;
    if (!["admin", "operator"].includes(actor.role))
      return http.sendErr(req, res, "許可被拒", 403);

    const targetUser = auth.getUsers().find(u => u.id === req.params.id);
    if (!targetUser) return http.sendErr(req, res, "用戶不存在", 404);

    const isSelf = actor.id === targetUser.id;

    // 權限檢查：非自己操作時需驗證角色位階
    if (!isSelf) {
      if (actor.role === "operator" && targetUser.role !== "viewer") {
        return http.sendErr(req, res, "權限不足", 403);
      }
      // admin 可管理所有非自己帳戶
    }

    // 檢查：Operator 不能把人升級成 Operator/Admin
    if (req.body.role) {
      if (actor.role === "operator" && req.body.role !== "viewer") {
        return http.sendErr(req, res, "權限不足以賦予該角色", 403);
      }
      // 防止自己修改自己的角色 (避免鎖死)
      if (isSelf) {
        return http.sendErr(req, res, "無法修改自身角色", 403);
      }
    }

    const result = auth.updateUser(req.params.id, req.body || {});
    if (!result.ok) return http.sendErr(req, res, result.message, 400);
    return http.respondJson(res, { ok: true, user: result.user });
  });

  // 刪除帳戶（admin / operator）
  app.delete("/api/auth/users/:id", auth.requireAuth, (req, res) => {
    const actor = req.authUser;
    if (!["admin", "operator"].includes(actor.role))
      return http.sendErr(req, res, "許可被拒", 403);

    const targetUser = auth.getUsers().find(u => u.id === req.params.id);
    if (!targetUser) return http.sendErr(req, res, "用戶不存在", 404);

    // 禁止刪除自己
    if (actor.id === targetUser.id) {
      return http.sendErr(req, res, "無法刪除自身帳戶", 403);
    }

    // 權限檢查
    // Operator 只能刪除 Viewer
    if (actor.role === "operator" && targetUser.role !== "viewer") {
      return http.sendErr(req, res, "權限不足", 403);
    }
    // Admin 可以刪除任何人 (除了自己，已在上面擋掉)

    const result = auth.deleteUser(req.params.id);
    if (!result.ok) return http.sendErr(req, res, result.message, 400);
    return http.respondJson(res, { ok: true });
  });

  // ─── 工具函數 ─────────────────────────────────────
  function parseCookie(cookieHeader, name) {
    if (!cookieHeader) return null;
    const cookies = cookieHeader.split(";").map((c) => c.trim());
    for (const cookie of cookies) {
      const [key, ...valParts] = cookie.split("=");
      if (key.trim() === name) return valParts.join("=");
    }
    return null;
  }
};
