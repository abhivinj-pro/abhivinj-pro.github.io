(function () {
  var chips = Array.prototype.slice.call(document.querySelectorAll(".chips a"));
  var bar = document.querySelector(".chips");
  var view = document.getElementById("view");
  var order = document.getElementById("view-order");

  function mark(id) {
    chips.forEach(function (chip) {
      var on = chip.getAttribute("href") === "#" + id;
      chip.setAttribute("aria-current", on ? "true" : "false");
      if (on) bar.scrollTo({ left: chip.offsetLeft - 20, behavior: "smooth" });
    });
  }
  if (chips.length) {
    mark(chips[0].getAttribute("href").slice(1));
    if ("IntersectionObserver" in window) {
      var watch = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) { if (entry.isIntersecting) mark(entry.target.id); });
      }, { rootMargin: "-20% 0px -70% 0px" });
      document.querySelectorAll(".category").forEach(function (s) { watch.observe(s); });
    }
  }

  function show(link) {
    var d = link.dataset;
    document.getElementById("view-photo").src = d.full;
    document.getElementById("view-photo").alt = d.name;
    document.getElementById("view-category").textContent = d.category + (d.sold ? " · Sold out" : "");
    document.getElementById("view-name").textContent = d.name;
    document.getElementById("view-price").textContent = d.price + (d.note ? " " + d.note : "");
    order.style.display = d.wa ? "" : "none";
    order.href = d.wa || "#";
    order.textContent = d.sold ? "Ask about this on WhatsApp" : "Order on WhatsApp";
    if (!view.open) view.showModal();
  }

  // The product is in the address, so a link can be shared and the phone's Back button closes it.
  function route() {
    var slug = location.hash.slice(1);
    var link = slug && document.querySelector('.shot[data-slug="' + CSS.escape(slug) + '"]');
    if (link) show(link);
    else if (view.open) view.close();
  }
  view.addEventListener("close", function () {
    document.getElementById("view-photo").removeAttribute("src");
    if (location.hash.indexOf("#item-") === 0) {
      try { history.replaceState(null, "", location.pathname + location.search); }
      catch (e) { location.hash = ""; }
    }
  });
  document.getElementById("view-close").addEventListener("click", function () { view.close(); });
  view.addEventListener("click", function (event) { if (event.target === view) view.close(); });
  window.addEventListener("hashchange", route);
  route();
})();
