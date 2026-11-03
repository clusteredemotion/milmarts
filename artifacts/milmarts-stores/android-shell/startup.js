(() => {
  const siteUrl = "https://milmarts.app/";
  const status = document.getElementById("network-status");
  const detail = document.getElementById("network-detail");

  let attemptId = 0;
  let retryTimer = null;
  let activeRequest = null;
  let isOpeningSite = false;

  function updateState(state) {
    document.body.dataset.state = state;

    if (state === "waiting") {
      status.textContent = "Waiting for Network";
      detail.textContent =
        "Reconnect to Wi-Fi or mobile data. Milmarts will open automatically.";
      return;
    }

    if (state === "opening") {
      status.textContent = "Opening Milmarts";
      detail.textContent = "Your store is ready.";
      return;
    }

    status.textContent = "Loading Milmarts";
    detail.textContent = "Connecting to your store…";
  }

  function clearRetry() {
    if (retryTimer !== null) {
      window.clearTimeout(retryTimer);
      retryTimer = null;
    }
  }

  function retrySoon() {
    if (retryTimer !== null || isOpeningSite) return;

    retryTimer = window.setTimeout(() => {
      retryTimer = null;
      checkConnection();
    }, 2500);
  }

  async function checkConnection() {
    if (isOpeningSite) return;
    clearRetry();

    if (navigator.onLine === false) {
      attemptId += 1;
      activeRequest?.abort();
      activeRequest = null;
      updateState("waiting");
      retrySoon();
      return;
    }

    const thisAttempt = ++attemptId;
    activeRequest?.abort();

    const request = new AbortController();
    activeRequest = request;
    const timeout = window.setTimeout(() => request.abort(), 4500);
    updateState("loading");

    try {
      await fetch(siteUrl, {
        method: "GET",
        mode: "no-cors",
        cache: "no-store",
        credentials: "omit",
        signal: request.signal,
      });

      if (thisAttempt !== attemptId) return;
      if (navigator.onLine === false) {
        updateState("waiting");
        retrySoon();
        return;
      }

      isOpeningSite = true;
      updateState("opening");
      window.location.replace(siteUrl);
    } catch {
      if (thisAttempt !== attemptId) return;
      updateState("waiting");
      retrySoon();
    } finally {
      window.clearTimeout(timeout);
      if (activeRequest === request) activeRequest = null;
    }
  }

  window.addEventListener("online", () => {
    if (isOpeningSite) return;
    clearRetry();
    updateState("loading");
    checkConnection();
  });

  window.addEventListener("offline", () => {
    if (isOpeningSite) return;
    attemptId += 1;
    activeRequest?.abort();
    activeRequest = null;
    updateState("waiting");
    retrySoon();
  });

  document.addEventListener("visibilitychange", () => {
    if (!isOpeningSite && document.visibilityState === "visible") {
      checkConnection();
    }
  });

  updateState(navigator.onLine === false ? "waiting" : "loading");
  checkConnection();
})();
