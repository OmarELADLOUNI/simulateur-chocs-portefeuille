(() => {
  const root = document.documentElement;
  const themeButton = document.querySelector(".theme-toggle");
  if (themeButton) {
    try {
      const savedTheme = localStorage.getItem("omar-site-theme");
      if (savedTheme === "light" || savedTheme === "dark") root.dataset.theme = savedTheme;
    } catch (_) { /* Le thème sombre reste le thème par défaut. */ }

    const updateThemeButton = () => {
      const next = root.dataset.theme === "dark" ? "clair" : "sombre";
      themeButton.setAttribute("aria-label", `Passer au thème ${next}`);
      themeButton.setAttribute("title", `Passer au thème ${next}`);
      const icon = themeButton.querySelector(".theme-icon");
      if (icon) icon.textContent = root.dataset.theme === "dark" ? "☼" : "◐";
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.content = root.dataset.theme === "dark" ? "#101311" : "#f2f1eb";
    };

    updateThemeButton();
    themeButton.addEventListener("click", () => {
      root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark";
      try { localStorage.setItem("omar-site-theme", root.dataset.theme); } catch (_) { /* Préférence facultative. */ }
      updateThemeButton();
    });
  }

  const menuButton = document.querySelector(".site-menu-toggle");
  const nav = document.querySelector(".main-nav");
  if (menuButton && nav) {
    menuButton.addEventListener("click", () => {
      const isOpen = menuButton.getAttribute("aria-expanded") === "true";
      menuButton.setAttribute("aria-expanded", String(!isOpen));
      nav.classList.toggle("is-open", !isOpen);
    });
    nav.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => {
      menuButton.setAttribute("aria-expanded", "false");
      nav.classList.remove("is-open");
    }));
  }
})();
