const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { log, error } = require("./logger");

// ─── 狀態 ────────────────────────────────────────────
const sessions = new Map(); // sessionId → { userId, username, role, createdAt }
let usersData = { users: [] };
let usersJsonPath = "";

const SESSION_COOKIE = "dsp_session";
const SESSION_TTL = 24 * 60 * 60 * 1000; // 24 h

// ─── 初始化 ──────────────────────────────────────────
function initAuth(baseDir) {
  usersJsonPath = path.join(baseDir, "users.json");
  loadUsers();
}

function loadUsers() {
  try {
    if (fs.existsSync(usersJsonPath)) {
      const raw = fs.readFileSync(usersJsonPath, "utf-8").replace(/^\uFEFF/, "");
      usersData = JSON.parse(raw);
      log(`✅ 讀取帳戶資料: ${usersData.users.length} 個帳戶`);
    } else {
      usersData = { users: [] };
      log("ℹ️ 帳戶資料不存在，將在首次設定時建立");
    }
  } catch (e) {
    error(`❌ 讀取帳戶資料失敗: ${e.message}`);
    usersData = { users: [] };
  }
}

function saveUsers() {
  try {
    fs.writeFileSync(usersJsonPath, JSON.stringify(usersData, null, 2), "utf-8");
    return true;
  } catch (e) {
    error(`❌ 寫入帳戶資料失敗: ${e.message}`);
    return false;
  }
}

// ─── 密碼 ────────────────────────────────────────────
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .pbkdf2Sync(password, salt, 100000, 64, "sha512")
    .toString("hex");
  return { hash, salt };
}

function verifyPassword(password, hash, salt) {
  const derived = crypto
    .pbkdf2Sync(password, salt, 100000, 64, "sha512")
    .toString("hex");
  return crypto.timingSafeEqual(Buffer.from(derived), Buffer.from(hash));
}

// ─── 帳戶管理 ────────────────────────────────────────
function generateId() {
  return crypto.randomBytes(16).toString("hex");
}

function sanitizeUser(u) {
  return { id: u.id, username: u.username, role: u.role, createdAt: u.createdAt };
}

function isSetupRequired() {
  return usersData.users.length === 0;
}

function getUsers() {
  return usersData.users.map(sanitizeUser);
}

function createUser(username, password, role) {
  if (usersData.users.find((u) => u.username === username))
    return { ok: false, message: "帳戶名稱已存在" };
  if (!["admin", "operator", "viewer"].includes(role))
    return { ok: false, message: "無效角色" };

  const { hash, salt } = hashPassword(password);
  const user = {
    id: generateId(),
    username,
    passwordHash: hash,
    passwordSalt: salt,
    role,
    createdAt: new Date().toISOString(),
  };
  usersData.users.push(user);
  if (!saveUsers()) return { ok: false, message: "儲存失敗" };
  return { ok: true, user: sanitizeUser(user) };
}

function updateUser(id, updates) {
  const user = usersData.users.find((u) => u.id === id);
  if (!user) return { ok: false, message: "帳戶不存在" };

  // ─── 驗證階段（不修改任何狀態）───
  if (updates.role && updates.role !== user.role) {
    if (!["admin", "operator", "viewer"].includes(updates.role))
      return { ok: false, message: "無效角色" };
    if (user.role === "admin") {
      const adminCount = usersData.users.filter((u) => u.role === "admin").length;
      if (adminCount <= 1)
        return { ok: false, message: "無法修改唯一管理者的角色" };
    }
  }

  if (updates.password) {
    if (updates.password.length < 4)
      return { ok: false, message: "密碼長度至少 4 字元" };
  }

  if (updates.username && updates.username !== user.username) {
    if (usersData.users.find((u) => u.username === updates.username && u.id !== id))
      return { ok: false, message: "帳戶名稱已存在" };
  }

  // ─── 套用階段（驗證已全部通過）───
  if (updates.role && updates.role !== user.role) {
    user.role = updates.role;
  }

  if (updates.password) {
    const { hash, salt } = hashPassword(updates.password);
    user.passwordHash = hash;
    user.passwordSalt = salt;
  }

  if (updates.username && updates.username !== user.username) {
    user.username = updates.username;
  }

  if (!saveUsers()) return { ok: false, message: "儲存失敗" };
  return { ok: true, user: sanitizeUser(user) };
}

function deleteUser(id) {
  const idx = usersData.users.findIndex((u) => u.id === id);
  if (idx === -1) return { ok: false, message: "帳戶不存在" };

  const user = usersData.users[idx];
  if (user.role === "admin") {
    const adminCount = usersData.users.filter((u) => u.role === "admin").length;
    if (adminCount <= 1) return { ok: false, message: "無法刪除唯一管理者帳戶" };
  }

  usersData.users.splice(idx, 1);
  if (!saveUsers()) return { ok: false, message: "儲存失敗" };
  return { ok: true };
}

// ─── 會話 ────────────────────────────────────────────
function createSession(user) {
  const sessionId = crypto.randomBytes(32).toString("hex");
  sessions.set(sessionId, {
    userId: user.id,
    username: user.username,
    role: user.role,
    createdAt: Date.now(),
  });
  return sessionId;
}

function getSession(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return null;
  if (Date.now() - session.createdAt > SESSION_TTL) {
    sessions.delete(sessionId);
    return null;
  }
  return session;
}

function destroySession(sessionId) {
  sessions.delete(sessionId);
}

// ─── 登入 ────────────────────────────────────────────
function login(username, password) {
  const user = usersData.users.find((u) => u.username === username);
  if (!user) return null;
  if (!verifyPassword(password, user.passwordHash, user.passwordSalt)) return null;
  const sessionId = createSession(user);
  return { sessionId, user: sanitizeUser(user) };
}

// ─── Cookie 解析 ─────────────────────────────────────
function parseCookie(cookieHeader, name) {
  if (!cookieHeader) return null;
  const cookies = cookieHeader.split(";").map((c) => c.trim());
  for (const cookie of cookies) {
    const [key, ...valParts] = cookie.split("=");
    if (key.trim() === name) return valParts.join("=");
  }
  return null;
}

// ─── Express 中間件 ──────────────────────────────────
function requireAuth(req, res, next) {
  const sessionId = parseCookie(req.headers.cookie, SESSION_COOKIE);
  if (!sessionId)
    return res.status(401).json({ ok: false, message: "未授權" });
  const session = getSession(sessionId);
  if (!session)
    return res.status(401).json({ ok: false, message: "會話已過期" });

  // 同步使用者最新角色（防止角色變更後緩存過期遲延）
  const liveUser = usersData.users.find((u) => u.id === session.userId);
  if (!liveUser) {
    destroySession(sessionId);
    return res.status(401).json({ ok: false, message: "帳戶已被刪除" });
  }
  session.role = liveUser.role;
  session.username = liveUser.username;

  req.authUser = session;
  next();
}

function checkPermission(req, res, next) {
  const role = req.authUser.role;

  // admin 全開
  if (role === "admin") return next();

  // viewer 僅允許 GET
  if (role === "viewer") {
    if (req.method === "GET") return next();
    return res.status(403).json({ ok: false, message: "許可被拒" });
  }

  // operator：不允許 clear-game-server-init
  if (role === "operator") {
    if (req.path === "/api/clear-game-server-init")
      return res.status(403).json({ ok: false, message: "許可被拒" });
    return next();
  }

  return res.status(403).json({ ok: false, message: "許可被拒" });
}

module.exports = {
  initAuth,
  isSetupRequired,
  createUser,
  updateUser,
  deleteUser,
  getUsers,
  login,
  requireAuth,
  checkPermission,
  createSession,
  destroySession,
  SESSION_COOKIE,
};
