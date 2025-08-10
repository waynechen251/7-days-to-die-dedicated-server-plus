(function (w) {
  const App = (w.App = w.App || {});
  const { appMask } = App.dom;

  function updateMask() {
    const show = !App.state.hasEverConnected || !App.state.current.backendUp;
    appMask?.classList.toggle("hidden", !show);
  }

  App.mask = { updateMask };
})(window);
