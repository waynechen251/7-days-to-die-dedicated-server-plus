(function (w) {
  const App = (w.App = w.App || {});
  const PROMPT_ID = "appPromptMask";
  let maskEl = null;

  function ensureMask() {
    if (maskEl) return maskEl;
    maskEl = document.getElementById(PROMPT_ID);
    if (!maskEl) {
      maskEl = document.createElement("div");
      maskEl.id = PROMPT_ID;
      maskEl.className = "app-mask hidden";
      maskEl.setAttribute("aria-hidden", "true");
      // Add custom styles for prompt inputs if needed, or rely on global forms.css
      document.body.appendChild(maskEl);
    }
    return maskEl;
  }

  function escapeHTML(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function showPrompt(message, defaultValue = "", { type = "text", title = null, placeholder = "" } = {}) {
    return new Promise((resolve) => {
      const m = ensureMask();
      const t = App.i18n ? App.i18n.t : (k) => k;
      
      const finalTitle = title || t("common.confirm");
      const finalMsg = message || "";
      const finalOk = t("common.confirm");
      const finalCancel = t("common.cancel");

      m.innerHTML = `
        <div class="app-mask__panel" role="dialog" aria-modal="true">
          <div style="display:flex;flex-direction:column;gap:12px;min-width:300px;max-width:360px">
            <h3 style="margin:0;font-size:1.1rem;font-weight:600">${escapeHTML(finalTitle)}</h3>
            <div style="font-size:0.9rem;color:var(--c-text-sec)">${escapeHTML(finalMsg)}</div>
            <input type="${type}" class="field__control" value="${escapeHTML(defaultValue)}" placeholder="${escapeHTML(placeholder)}" style="width:100%" />
            <div class="app-mask__actions" style="margin-top:8px">
              <button type="button" class="btn btn--ghost" data-act="cancel">${escapeHTML(finalCancel)}</button>
              <button type="button" class="btn btn--primary" data-act="confirm">${escapeHTML(finalOk)}</button>
            </div>
          </div>
        </div>
      `;
      m.classList.remove("hidden");
      
      const input = m.querySelector("input");
      const confirmBtn = m.querySelector('button[data-act="confirm"]');
      
      // Auto focus input
      setTimeout(() => input.focus(), 50);

      const close = (val) => {
        m.classList.add("hidden");
        m.innerHTML = ""; // cleanup
        resolve(val);
      };

      m.onclick = (e) => {
        const btn = e.target.closest("button[data-act]");
        if (!btn) return;
        if (btn.dataset.act === "confirm") close(input.value);
        else close(null);
      };

      input.onkeydown = (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            close(input.value);
        }
        if (e.key === "Escape") close(null);
      };
    });
  }

  function showAlert(message, { title = null } = {}) {
    return new Promise((resolve) => {
      const m = ensureMask();
      const t = App.i18n ? App.i18n.t : (k) => k;
      
      const finalTitle = title || t("common.close"); // default title fallback
      const finalOk = t("common.close");

      m.innerHTML = `
        <div class="app-mask__panel" role="dialog" aria-modal="true">
          <div style="display:flex;flex-direction:column;align-items:center;gap:12px;min-width:280px;max-width:360px;text-align:center">
            <h3 style="margin:0;font-size:1.1rem;font-weight:600">${escapeHTML(title || "Info")}</h3>
            <div style="font-size:0.95rem;color:var(--c-text)">${escapeHTML(message)}</div>
            <div class="app-mask__actions" style="margin-top:8px">
              <button type="button" class="btn btn--primary" data-act="confirm">${escapeHTML(finalOk)}</button>
            </div>
          </div>
        </div>
      `;
      m.classList.remove("hidden");
      
      const btn = m.querySelector('button[data-act="confirm"]');
      btn.focus();

      const close = () => {
        m.classList.add("hidden");
        m.innerHTML = "";
        resolve();
      };

      m.onclick = (e) => {
        if (e.target.closest("button[data-act]")) close();
      };
      
      // Allow Escape/Enter to close alert
      const onKey = (e) => {
          if (e.key === "Escape" || e.key === "Enter") {
              e.preventDefault();
              document.removeEventListener("keydown", onKey);
              close();
          }
      };
      document.addEventListener("keydown", onKey);
    });
  }

  App.prompt = showPrompt;
  App.alert = showAlert;
})(window);
