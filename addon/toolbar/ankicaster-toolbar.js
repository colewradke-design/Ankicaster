/*
 * Ankicaster Style A toolbar. Read-only display: adds a crest + mana block on
 * the left and two queue chips on the right of Anki's own toolbar. Anki's
 * links are never moved or rewired. Any failure leaves the stock toolbar.
 */
(function () {
  "use strict";
  if (window.ankicasterToolbar) return;

  var mounted = false;
  var pendingData = null;
  var nodes = {};

  function make(tag, cls, text) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
  }

  function send(cmd) {
    try {
      if (typeof window.pycmd === "function") {
        window.pycmd(cmd);
        return true;
      }
    } catch (e) {}
    return false;
  }

  function openGame(ev) {
    if (ev) {
      ev.preventDefault();
      ev.stopPropagation();
    }
    send("ankicaster:open");
    return false;
  }

  function chipNode() {
    var chip = make("span", "ac-chip");
    chip.setAttribute("role", "button");
    chip.addEventListener("click", openGame);
    var icon = make("span", "ac-icon");
    var label = make("span", "ac-label");
    var bar = make("span", "ac-bar");
    var fill = make("i");
    bar.appendChild(fill);
    var count = make("span", "ac-count");
    chip.appendChild(icon);
    chip.appendChild(label);
    chip.appendChild(bar);
    chip.appendChild(count);
    return { chip: chip, icon: icon, label: label, bar: bar, fill: fill, count: count };
  }

  function mount() {
    if (mounted) return true;
    var body = document.body;
    if (!body) return false;

    var frame, leftHost, rightHost, before = null;
    var header = document.querySelector("div.header");
    if (header && header.querySelector(".toolbar")) {
      frame = header;
      leftHost = header.querySelector(".left-tray");
      rightHost = header.querySelector(".right-tray");
      if (!leftHost || !rightHost) return false;
      before = leftHost.firstChild;
    } else {
      var td = document.querySelector("#header td.tdcenter") || document.querySelector("#header td");
      if (!td || !td.parentNode) return false;
      frame = document.getElementById("header");
      leftHost = make("td", "ac-legacy-left");
      rightHost = make("td", "ac-legacy-right");
      td.parentNode.insertBefore(leftHost, td);
      td.parentNode.appendChild(rightHost);
    }

    var left = make("div", "ac-left");
    left.setAttribute("role", "button");
    left.title = "Open Ankicaster";
    left.addEventListener("click", openGame);
    var crest = make("span", "ac-crest");
    crest.appendChild(document.createTextNode("🏰 "));
    crest.appendChild(make("span", "ac-crest-name", "Ankicaster"));
    var mana = make("span", "ac-mana");
    mana.appendChild(document.createTextNode("✦ "));
    var manaNum = make("b", null, "");
    mana.appendChild(manaNum);
    mana.appendChild(document.createTextNode(" "));
    var manaWord = make("span", "ac-mana-word", "Mana");
    mana.appendChild(manaWord);
    var pending = make("span", "ac-pending", "");
    mana.appendChild(pending);
    left.appendChild(crest);
    left.appendChild(mana);

    var right = make("div", "ac-right");
    var build = chipNode();
    var service = chipNode();
    right.appendChild(build.chip);
    right.appendChild(service.chip);

    leftHost.insertBefore(left, before);
    rightHost.appendChild(right);
    frame.appendChild(make("span", "ac-orn ac-orn-l", "✦"));
    frame.appendChild(make("span", "ac-orn ac-orn-r", "✦"));
    frame.classList.add("ac-frame");

    nodes = { left: left, mana: mana, manaNum: manaNum, manaWord: manaWord, pending: pending, build: build, service: service };
    mounted = true;
    paint({ mana: null, manaText: "Your Academy awaits", manaTitle: "Open Ankicaster", pending: "",
      build: { icon: "🔨", label: "Idle", muted: true, pct: null, count: "", title: "Nothing building" },
      service: { icon: "🔮", label: "Idle", muted: true, pct: null, count: "", title: "No services queued" } });
    body.classList.add("ankicaster-on");
    return true;
  }

  function paintChip(n, c) {
    c = c || {};
    n.icon.textContent = c.icon || "";
    n.label.textContent = c.label || "";
    n.chip.title = c.title || "";
    n.chip.classList.toggle("ac-muted", !!c.muted);
    var hasBar = typeof c.pct === "number";
    n.bar.style.display = hasBar ? "" : "none";
    n.fill.style.width = (hasBar ? Math.max(0, Math.min(100, c.pct)) : 0) + "%";
    n.count.textContent = c.count || "";
    n.count.style.display = c.count ? "" : "none";
  }

  function paint(d) {
    if (d.mana == null) {
      nodes.manaNum.textContent = "";
      nodes.manaWord.textContent = d.manaText || "";
    } else {
      nodes.manaNum.textContent = d.mana;
      nodes.manaWord.textContent = d.manaText || "Mana";
    }
    nodes.pending.textContent = d.pending || "";
    nodes.mana.title = d.manaTitle || "";
    paintChip(nodes.build, d.build);
    paintChip(nodes.service, d.service);
  }

  function update(d) {
    try {
      if (!d || typeof d !== "object") return;
      if (!mounted && !mount()) {
        pendingData = d;
        return;
      }
      var body = document.body;
      if (d.enabled === false) {
        body.classList.remove("ankicaster-on");
        return;
      }
      body.classList.add("ankicaster-on");
      body.classList.toggle("ac-hide-chips", !!d.hideChips);
      paint(d);
    } catch (e) {
      try { console.log("[Ankicaster] toolbar update failed", e); } catch (e2) {}
    }
  }

  function start() {
    try {
      if (!mount()) return;
      if (pendingData) {
        var d = pendingData;
        pendingData = null;
        update(d);
      }
    } catch (e) {
      try {
        document.body.classList.remove("ankicaster-on");
        console.log("[Ankicaster] toolbar mount failed", e);
      } catch (e2) {}
      return;
    }
    // The bridge is set up asynchronously; ask for numbers once it exists.
    var tries = 0;
    (function ping() {
      if (send("ankicaster:toolbarReady")) return;
      if (++tries < 100) setTimeout(ping, 100);
    })();
  }

  window.ankicasterToolbar = { update: update, mount: mount };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
