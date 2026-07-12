(function () {
  "use strict";

  var STORAGE_KEY = "tej_prep_progress";

  var tabBts = document.getElementById("tab-bts");
  var tabBillboards = document.getElementById("tab-billboards");
  var panelBts = document.getElementById("panel-bts");
  var panelBillboards = document.getElementById("panel-billboards");
  var progressFill = document.getElementById("progress-fill");
  var progressLabel = document.getElementById("progress-label");
  var progressBar = document.getElementById("progressbar");
  var resetLink = document.getElementById("reset-progress");

  // --- Tabs ---
  function tabFromHash() {
    return window.location.hash.replace("#", "") === "billboards" ? "billboards" : "bts";
  }

  function activateTab(name, opts) {
    var isBts = name !== "billboards";
    tabBts.setAttribute("aria-selected", String(isBts));
    tabBillboards.setAttribute("aria-selected", String(!isBts));
    tabBts.tabIndex = isBts ? 0 : -1;
    tabBillboards.tabIndex = isBts ? -1 : 0;
    panelBts.hidden = !isBts;
    panelBillboards.hidden = isBts;
    if (opts && opts.focus) {
      (isBts ? tabBts : tabBillboards).focus();
    }
  }

  tabBts.addEventListener("click", function () {
    window.location.hash = "bts";
  });
  tabBillboards.addEventListener("click", function () {
    window.location.hash = "billboards";
  });

  [tabBts, tabBillboards].forEach(function (tab, i, tabs) {
    tab.addEventListener("keydown", function (e) {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      var next = tabs[i === 0 ? 1 : 0];
      window.location.hash = next === tabBts ? "bts" : "billboards";
      activateTab(tabFromHash(), { focus: true });
    });
  });

  window.addEventListener("hashchange", function () {
    activateTab(tabFromHash());
  });

  activateTab(tabFromHash());

  // --- Progress checkboxes ---
  var checkboxes = Array.prototype.slice.call(
    document.querySelectorAll('input[type="checkbox"][data-key]')
  );

  function loadProgress() {
    try {
      return JSON.parse(window.localStorage.getItem(STORAGE_KEY)) || {};
    } catch (e) {
      return {};
    }
  }

  function saveProgress(state) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      /* localStorage unavailable; progress simply won't persist */
    }
  }

  function updateProgressBar() {
    var total = checkboxes.length;
    var checked = checkboxes.filter(function (b) { return b.checked; }).length;
    var pct = total ? Math.round((checked / total) * 100) : 0;
    progressFill.style.width = pct + "%";
    progressBar.setAttribute("aria-valuenow", String(pct));
    progressLabel.textContent = pct + "% complete";
  }

  var savedState = loadProgress();
  checkboxes.forEach(function (box) {
    box.checked = !!savedState[box.dataset.key];
    box.addEventListener("change", function () {
      var state = loadProgress();
      state[box.dataset.key] = box.checked;
      saveProgress(state);
      updateProgressBar();
    });
  });
  updateProgressBar();

  resetLink.addEventListener("click", function (e) {
    e.preventDefault();
    if (!window.confirm("Reset all progress?")) return;
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch (err) {
      /* ignore */
    }
    checkboxes.forEach(function (box) { box.checked = false; });
    updateProgressBar();
  });

  // --- Print: expand tabs and solutions, restore after ---
  var printState = { openDetails: [], hiddenPanels: [] };

  function beforePrint() {
    var details = document.querySelectorAll("details.solution");
    printState.openDetails = Array.prototype.map.call(details, function (d) {
      return d.open;
    });
    details.forEach(function (d) { d.open = true; });

    var panels = [panelBts, panelBillboards];
    printState.hiddenPanels = panels.map(function (p) { return p.hidden; });
    panels.forEach(function (p) { p.hidden = false; });
  }

  function afterPrint() {
    var details = document.querySelectorAll("details.solution");
    details.forEach(function (d, i) { d.open = printState.openDetails[i]; });

    var panels = [panelBts, panelBillboards];
    panels.forEach(function (p, i) { p.hidden = printState.hiddenPanels[i]; });
  }

  window.addEventListener("beforeprint", beforePrint);
  window.addEventListener("afterprint", afterPrint);
})();
