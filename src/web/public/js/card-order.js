(function (w) {
  const App = (w.App = w.App || {});

  const STORAGE_KEY = "ui.cardOrder";

  function getGrid() {
    return document.querySelector("main.grid");
  }

  function getCards() {
    return Array.from(document.querySelectorAll("main.grid > [data-card-id]"));
  }

  function getCardIds() {
    return getCards()
      .map((el) => el.dataset.cardId)
      .filter(Boolean);
  }

  function getSavedOrder() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  function saveOrder(ids) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
    } catch (_) {}
  }

  function getEffectiveOrder() {
    const current = getCardIds();
    const saved = getSavedOrder();
    if (!saved) return current;

    const merged = [];
    for (const id of saved) {
      if (current.includes(id) && !merged.includes(id)) merged.push(id);
    }
    for (const id of current) {
      if (!merged.includes(id)) merged.push(id);
    }
    return merged;
  }

  function t(key, fallback) {
    return App.i18n?.t ? App.i18n.t(key) : fallback;
  }

  function applyOrder(ids) {
    const grid = getGrid();
    if (!grid) return;

    const byId = new Map(getCards().map((el) => [el.dataset.cardId, el]));
    for (const id of ids) {
      const card = byId.get(id);
      if (card) grid.appendChild(card);
    }
    saveOrder(getCardIds());
    refreshControls();
  }

  function moveCard(cardId, delta) {
    const ids = getCardIds();
    const currentIndex = ids.indexOf(cardId);
    if (currentIndex === -1) return;

    const targetIndex = currentIndex + delta;
    if (targetIndex < 0 || targetIndex >= ids.length) return;

    const next = ids.slice();
    const [moved] = next.splice(currentIndex, 1);
    next.splice(targetIndex, 0, moved);
    applyOrder(next);
  }

  function getOrCreateTools(header) {
    let tools = header.querySelector(".card-header__tools");
    if (!tools) {
      tools = document.createElement("div");
      tools.className = "card-header__tools";
      header.appendChild(tools);
    }
    return tools;
  }

  function updateButtonText(button, direction) {
    const label = direction === "up"
      ? t("cardOrder.moveUp", "上移")
      : t("cardOrder.moveDown", "下移");
    button.title = label;
    button.setAttribute("aria-label", label);
  }

  function ensureControls() {
    for (const card of getCards()) {
      const header = card.querySelector(".card-header");
      if (!header) continue;

      const tools = getOrCreateTools(header);
      let controls = tools.querySelector(".card-order-controls");
      if (!controls) {
        controls = document.createElement("div");
        controls.className = "card-order-controls";
        tools.appendChild(controls);
      }

      for (const direction of ["up", "down"]) {
        let button = controls.querySelector(`[data-card-order="${direction}"]`);
        if (!button) {
          button = document.createElement("button");
          button.type = "button";
          button.className = "btn--ghost card-order-btn";
          button.dataset.cardOrder = direction;
          button.innerHTML = `<span aria-hidden="true">${direction === "up" ? "↑" : "↓"}</span>`;
          button.addEventListener("click", () => {
            moveCard(card.dataset.cardId, direction === "up" ? -1 : 1);
          });
          controls.appendChild(button);
        }
        updateButtonText(button, direction);
      }
    }
  }

  function refreshControls() {
    const ids = getCardIds();
    for (const card of getCards()) {
      const controls = card.querySelector(".card-order-controls");
      if (!controls) continue;
      const up = controls.querySelector('[data-card-order="up"]');
      const down = controls.querySelector('[data-card-order="down"]');
      const index = ids.indexOf(card.dataset.cardId);
      if (up) {
        up.disabled = index <= 0;
        updateButtonText(up, "up");
      }
      if (down) {
        down.disabled = index === -1 || index >= ids.length - 1;
        updateButtonText(down, "down");
      }
    }
  }

  function init() {
    ensureControls();
    applyOrder(getEffectiveOrder());
  }

  App.cardOrder = {
    init,
    refresh: refreshControls,
  };

  const onReady = () => init();
  if (w.__fragmentsReady) onReady();
  else w.addEventListener("fragments:ready", onReady, { once: true });

  w.addEventListener("i18n:changed", refreshControls);
})(window);
