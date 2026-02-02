(function (w) {
  const App = (w.App = w.App || {});
  const { fetchJSON } = App.api;

  const t = (key, def, props) => (App.i18n ? App.i18n.t(key, props) : def || key);

  let currentUser = null;

  // ─── 屏幕切換 ────────────────────────────────────
  function showLoginScreen() {
    const screen = document.getElementById("loginScreen");
    // If already visible, do not steal focus again (prevents repeated focusing by polling)
    if (!screen.classList.contains("hidden")) return;

    screen.classList.remove("hidden");
    document.getElementById("setupScreen").classList.add("hidden");
    document.getElementById("authError").classList.remove("visible");
    document.getElementById("authUsername")?.focus();
  }

  function showSetupScreen() {
    document.getElementById("setupScreen").classList.remove("hidden");
    document.getElementById("loginScreen").classList.add("hidden");
    document.getElementById("setupError").classList.remove("visible");
    document.getElementById("setupUsername")?.focus();
  }

  function hideAuthScreens() {
    document.getElementById("loginScreen").classList.add("hidden");
    document.getElementById("setupScreen").classList.add("hidden");
  }

  function showError(elementId, message) {
    const el = document.getElementById(elementId);
    if (el) {
      el.textContent = message;
      el.classList.add("visible");
    }
  }

  function restrictInput(input) {
    if (!input) return;
    input.addEventListener("input", (e) => {
      const val = e.target.value;
      // Allow only ASCII printable characters (32-126)
      const clean = val.replace(/[^\x20-\x7E]/g, "");
      if (clean !== val) {
        e.target.value = clean;
      }
    });
  }

  // ─── UI 更新 ─────────────────────────────────────
  function updateUI() {
    updateTopbar();
    
    // 帳戶管理區塊（仅 admin / operator 可見）
    const usersSection = document.getElementById("accountManagementSection");
    const role = currentUser?.role;
    if (role === "admin" || role === "operator") {
      usersSection?.classList.remove("hidden");
      renderUserList();
    } else {
      usersSection?.classList.add("hidden");
    }

    if (App.status?.applyUIState) {
      App.status.applyUIState(App.state?.current || {});
    }
  }

  // ─── API ─────────────────────────────────────────
  async function checkSetup() {
    try {
      const res = await fetchJSON("/api/auth/setup-required");
      return res?.setupRequired === true;
    } catch {
      return false;
    }
  }

  async function checkAuth() {
    try {
      const res = await fetchJSON("/api/auth/me");
      if (res?.ok && res.user) {
        currentUser = res.user;
        updateUI();
        return true;
      }
    } catch {
      // 401 → 未認證
    }
    return false;
  }

  async function login(username, password) {
    try {
      const res = await fetchJSON("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (res?.ok) {
        currentUser = res.user;
        updateUI();
        return true;
      }
    } catch {
      // 登入失敗
    }
    return false;
  }

  async function logout() {
    try {
      await fetchJSON("/api/auth/logout", { method: "POST" });
    } catch (_) {}
    currentUser = null;
    showLoginScreen();
  }

  async function setup(username, password) {
    try {
      const res = await fetchJSON("/api/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (res?.ok) {
        currentUser = res.user;
        updateTopbar();
        return true;
      }
    } catch {
      // 設定失敗
    }
    return false;
  }

  // ─── Topbar ──────────────────────────────────────
  function updateTopbar() {
    const container = document.getElementById("topbarUser");
    if (!container || !currentUser) return;
    const roleLabel = {
      admin: App.i18n?.t("auth.roleAdmin") || "管理者",
      operator: App.i18n?.t("auth.roleOperator") || "操作員",
      viewer: App.i18n?.t("auth.roleViewer") || "觀察者",
    };
    container.innerHTML =
      `<span class="badge">${roleLabel[currentUser.role] || currentUser.role}</span>` +
      `<span style="font-weight:500">${escapeHtml(currentUser.username)}</span>` +
      `<button id="logoutBtn" class="btn-logout" data-i18n="auth.logout">退出</button>`;
    const logoutBtn = container.querySelector("#logoutBtn");
    if (logoutBtn) logoutBtn.addEventListener("click", () => logout());
  }

  // ─── 新增帳戶模態窗 ──────────────────────────────
  function showAddUserModal() {
    return new Promise((resolve) => {
      // 建立遮罩
      const m = document.createElement("div");
      m.className = "app-mask";
      m.setAttribute("aria-hidden", "false");
      
      m.innerHTML = `
        <div class="auth-panel" style="max-width:360px;position:relative;">
          <h3 style="text-align:center;margin-bottom:1rem;color:var(--c-text);">${App.i18n?.t("auth.addUserTitle") || "新增帳戶"}</h3>
          <div id="modalError" class="auth-error"></div>
          <form id="modalForm" autocomplete="off">
            <div class="field">
              <label class="field__label">${App.i18n?.t("auth.labelUsernameFull") || "帳戶名稱 (2-32 字元)"}</label>
              <input type="text" name="username" class="field__control" required />
            </div>
            <div class="field">
              <label class="field__label">${App.i18n?.t("auth.labelRole") || "角色"}</label>
              <select name="role" class="field__control" style="background:var(--c-surface-alt)">
                <option value="operator">${App.i18n?.t("auth.roleOperator") || "操作員"}</option>
                <option value="viewer">${App.i18n?.t("auth.roleViewer") || "觀察者"}</option>
                <option value="admin">${App.i18n?.t("auth.roleAdmin") || "管理者"}</option>
              </select>
            </div>
            <div class="field">
              <label class="field__label">${App.i18n?.t("auth.labelPasswordFull") || "密碼 (至少 4 字元)"}</label>
              <input type="password" name="password" class="field__control" required />
            </div>
            <div style="display:flex;gap:10px;margin-top:1.5rem">
              <button type="button" class="btn--ghost" id="modalCancel" style="flex:1">${App.i18n?.t("auth.btnCancel") || "取消"}</button>
              <button type="submit" class="btn--primary" style="flex:1;margin-top:0">${App.i18n?.t("auth.btnCreate") || "建立"}</button>
            </div>
          </form>
        </div>
      `;
      
      document.body.appendChild(m);
      const form = m.querySelector("#modalForm");
      const errEl = m.querySelector("#modalError");
      const userIn = form.querySelector("[name=username]");
      const pwdIn = form.querySelector("[name=password]");
      
      restrictInput(pwdIn);

      // Auto focus
      setTimeout(() => userIn.focus(), 50);

      const close = (val) => {
        m.remove();
        resolve(val);
      };

      m.querySelector("#modalCancel").onclick = () => close(null);

      // 鍵盤處理：Escape 關閉，Tab 焦點捕獲
      m.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          close(null);
          return;
        }
        if (e.key === "Tab") {
          const focusable = m.querySelectorAll("input, select, button");
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      });

      form.onsubmit = async (e) => {
        e.preventDefault();
        const username = userIn.value.trim();
        const role = form.querySelector("[name=role]").value;
        const password = pwdIn.value;

        // 即時驗證
        if (username.length < 2) {
          errEl.textContent = App.i18n?.t("auth.errUsernameTooShort") || "帳戶名稱太短";
          errEl.classList.add("visible");
          userIn.focus();
          return;
        }
        if (password.length < 4) {
          errEl.textContent = App.i18n?.t("auth.errPasswordTooShort") || "密碼太短";
          errEl.classList.add("visible");
          pwdIn.focus();
          return;
        }

        try {
          await fetchJSON("/api/auth/users", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password, role }),
          });
          close(true);
        } catch (err) {
          errEl.textContent = err.message;
          errEl.classList.add("visible");
        }
      };
    });
  }

  // ─── 修改密碼模態窗 ──────────────────────────────
  function showPasswordModal() {
    return new Promise((resolve) => {
      const m = document.createElement("div");
      m.className = "app-mask";
      m.setAttribute("aria-hidden", "false");
      m.innerHTML = `
        <div class="auth-panel" style="max-width:320px;position:relative;">
          <h3 style="text-align:center;margin-bottom:1rem;color:var(--c-text);">${App.i18n?.t("auth.changePwdTitle") || "修改密碼"}</h3>
          <div id="pwdModalError" class="auth-error"></div>
          <div class="field">
            <label class="field__label">${App.i18n?.t("auth.labelPasswordFull") || "密碼 (至少 4 字元)"}</label>
            <input type="password" id="pwdModalInput" class="field__control" autocomplete="off" required />
          </div>
          <div style="display:flex;gap:10px;margin-top:1.5rem">
            <button type="button" class="btn--ghost" id="pwdModalCancel" style="flex:1">${App.i18n?.t("auth.btnCancel") || "取消"}</button>
            <button type="button" class="btn--primary" id="pwdModalConfirm" style="flex:1;margin-top:0">${App.i18n?.t("auth.btnConfirm") || "確認"}</button>
          </div>
        </div>
      `;
      document.body.appendChild(m);
      const input = m.querySelector("#pwdModalInput");
      const errEl = m.querySelector("#pwdModalError");
      setTimeout(() => input.focus(), 50);

      const close = (val) => { m.remove(); resolve(val); };
      m.querySelector("#pwdModalCancel").onclick = () => close(null);
      m.querySelector("#pwdModalConfirm").onclick = () => {
        const val = input.value;
        if (!val || val.length < 4) {
          errEl.textContent = App.i18n?.t("auth.errPasswordTooShort") || "密碼太短";
          errEl.classList.add("visible");
          input.focus();
          return;
        }
        close(val);
      };

      m.addEventListener("keydown", (e) => {
        if (e.key === "Escape") { e.preventDefault(); close(null); return; }
        if (e.key === "Tab") {
          const focusable = m.querySelectorAll("input, button");
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault(); last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault(); first.focus();
          }
        }
      });
    });
  }

  // ─── 帳戶管理列表 ─────────────────────────────────
  async function renderUserList() {
    const container = document.getElementById("usersList");
    if (!container || !currentUser) return;
    try {
      const res = await fetchJSON("/api/auth/users");
      const users = res?.users || [];
      const roleLabel = {
        admin: App.i18n?.t("auth.roleAdmin") || "管理者",
        operator: App.i18n?.t("auth.roleOperator") || "操作員",
        viewer: App.i18n?.t("auth.roleViewer") || "觀察者",
      };
      
      const myRole = currentUser.role;
      const myId = currentUser.id;

      container.innerHTML = users
        .map((u) => {
          // 權限判斷邏輯
          const isSelf = u.id === myId;
          let canManage = false;

          if (myRole === 'admin') {
            // Admin 可以管理除了自己以外的所有人 (防止自己刪除自己/改自己角色導致鎖死)
            // 密碼可以改自己的
            canManage = !isSelf; 
          } else if (myRole === 'operator') {
            // Operator 只能管理 Viewer
            canManage = u.role === 'viewer';
          }

          // 針對不同按鈕的細粒度控制
          const canDelete = !isSelf && canManage;
          const canChangeRole = !isSelf && canManage;
          const canChangePwd = isSelf || canManage; // 可以改自己或下級的密碼

          const disabledAttr = (can) => can ? '' : 'disabled style="opacity:0.5;cursor:not-allowed"';

          return `<div class="user-row">` +
            `  <div class="user-row__info">` +
            `    <div class="user-row__name">${escapeHtml(u.username)} ${isSelf ? (App.i18n?.t("auth.selfLabel") || "(你)") : ''}</div>` +
            `    <div class="user-row__meta">${roleLabel[u.role] || u.role} · ${u.createdAt.slice(0, 10)}</div>` +
            `  </div>` +
            `  <div class="user-row__actions">` +
            `    <select class="user-role-select" data-user-id="${u.id}" ${disabledAttr(canChangeRole)}>` +
            `      <option value="admin" ${u.role === "admin" ? "selected" : ""}>${App.i18n?.t("auth.roleAdmin") || "管理者"}</option>` +
            `      <option value="operator" ${u.role === "operator" ? "selected" : ""}>${App.i18n?.t("auth.roleOperator") || "操作員"}</option>` +
            `      <option value="viewer" ${u.role === "viewer" ? "selected" : ""}>${App.i18n?.t("auth.roleViewer") || "觀察者"}</option>` +
            `    </select>` +
            `    <button class="btn--ghost user-pwd-btn" data-user-id="${u.id}" ${disabledAttr(canChangePwd)}>${t("auth.btnPassword", "密碼")}</button>` +
            `    <button class="btn--danger user-del-btn" data-user-id="${u.id}" ${disabledAttr(canDelete)}>${t("auth.btnDelete", "刪除")}</button>` +
            `  </div>` +
            `</div>`;
        })
        .join("");

      // 綁定角色下拉事件
      container.querySelectorAll(".user-role-select").forEach((sel) => {
        if (sel.disabled) return;
        sel.addEventListener("change", async () => {
          try {
            await fetchJSON(`/api/auth/users/${sel.dataset.userId}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ role: sel.value }),
            });
            await renderUserList();
          } catch (err) {
            await App.alert(t("auth.updateFailed", "更新失敗: {error}", { error: err.message }));
            await renderUserList();
          }
        });
      });

      // 綁定密碼按鈕
      container.querySelectorAll(".user-pwd-btn").forEach((btn) => {
        if (btn.disabled) return;
        btn.addEventListener("click", async () => {
          const pwd = await showPasswordModal();
          if (!pwd) return;
          try {
            await fetchJSON(`/api/auth/users/${btn.dataset.userId}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ password: pwd }),
            });
            await App.alert(t("auth.pwdUpdated", "密碼已更新"));
          } catch (err) {
            await App.alert(t("auth.updateFailed", "更新失敗: {error}", { error: err.message }));
          }
        });
      });

      // 綁定刪除按鈕
      container.querySelectorAll(".user-del-btn").forEach((btn) => {
        if (btn.disabled) return;
        btn.addEventListener("click", async () => {
          if (!await App.confirm(t("auth.confirmDeleteUser", "確認刪除此帳戶？"))) return;
          try {
            await fetchJSON(`/api/auth/users/${btn.dataset.userId}`, {
              method: "DELETE",
            });
            await renderUserList();
          } catch (err) {
            await App.alert(t("auth.deleteFailed", "刪除失敗: {error}", { error: err.message }));
          }
        });
      });
    } catch (err) {
      container.innerHTML = `<div style="color:var(--c-danger);font-size:0.8rem">加載失敗: ${escapeHtml(err.message)}</div>`;
    }
  }

  // ─── 事件綁定 ─────────────────────────────────────
  function bindEvents() {
    // 登入表單
    const loginForm = document.getElementById("loginForm");
    if (loginForm && !loginForm.__bound) {
      loginForm.__bound = true;
      loginForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const username = document.getElementById("authUsername").value.trim();
        const password = document.getElementById("authPassword").value;
        if (!username || !password) return;

        const ok = await login(username, password);
        if (ok) {
          hideAuthScreens();
          if (App.bootstrap?.realBoot) App.bootstrap.realBoot();
        } else {
          showError("authError", t("auth.loginFailed", "帳戶名稱或密碼錯誤"));
        }
      });
    }

    // 設定表單
    const setupForm = document.getElementById("setupForm");
    if (setupForm && !setupForm.__bound) {
      setupForm.__bound = true;
      setupForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const username = document.getElementById("setupUsername").value.trim();
        const password = document.getElementById("setupPassword").value;
        const confirmPwd = document.getElementById("setupConfirmPassword").value;

        if (!username || !password) {
          showError("setupError", t("auth.errFillAll", "請填寫所有欄位"));
          return;
        }
        if (username.length < 2) {
          showError("setupError", t("auth.errUsernameTooShort", "帳戶名稱太短"));
          return;
        }
        if (password.length < 4) {
          showError("setupError", t("auth.errPasswordTooShort", "密碼太短"));
          return;
        }
        if (password !== confirmPwd) {
          showError("setupError", t("auth.errPasswordMismatch", "兩次輸入的密碼不一致"));
          return;
        }

        const ok = await setup(username, password);
        if (ok) {
          hideAuthScreens();
          if (App.bootstrap?.realBoot) App.bootstrap.realBoot();
        } else {
          showError("setupError", t("auth.errSetupFailed", "建立帳戶失敗"));
        }
      });
    }

    // 新增帳戶按鈕
    const addUserBtn = document.getElementById("addUserBtn");
    if (addUserBtn && !addUserBtn.__bound) {
      addUserBtn.__bound = true;
      addUserBtn.addEventListener("click", async () => {
        const result = await showAddUserModal();
        if (result) await renderUserList();
      });
    }
  }

  // ─── 工具 ────────────────────────────────────────
  function escapeHtml(str) {
    const d = document.createElement("div");
    d.appendChild(document.createTextNode(String(str)));
    return d.innerHTML;
  }

  // ─── 暴露 ────────────────────────────────────────
  App.auth = {
    get currentUser() { return currentUser; },
    checkAuth,
    checkSetup,
    login,
    logout,
    setup,
    showLoginScreen,
    showSetupScreen,
    hideAuthScreens,
    renderUserList,
    updateUI,
    bindEvents,

    canWrite() {
      const role = currentUser?.role;
      return role === "admin" || role === "operator";
    },

    canClearInit() {
      const role = currentUser?.role;
      return role === "admin";
    },

    isViewer() {
      return currentUser?.role === "viewer";
    },

    isOperator() {
      return currentUser?.role === "operator";
    },

    isAdmin() {
      return currentUser?.role === "admin";
    },
  };
})(window);
