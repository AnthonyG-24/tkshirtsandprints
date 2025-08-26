document.addEventListener("DOMContentLoaded", function () {
  const navbar = document.getElementById("navbar");
  const hamburger = document.getElementById("hamburger");
  const navMiddle = document.getElementById("navMiddle");
  const navLinks = document.querySelectorAll(".nav-middle a");

  function handleScroll() {
    if (window.scrollY > 50) {
      navbar.classList.add("scrolled");
    } else {
      navbar.classList.remove("scrolled");
    }
  }

  window.addEventListener("scroll", handleScroll);

  function toggleMobileMenu() {
    hamburger.classList.toggle("active");
    navMiddle.classList.toggle("active");
    if (navMiddle.classList.contains("active")) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
  }

  hamburger.addEventListener("click", toggleMobileMenu);

  navLinks.forEach((link) => {
    link.addEventListener("click", () => {
      if (window.innerWidth <= 768) {
        hamburger.classList.remove("active");
        navMiddle.classList.remove("active");
        document.body.style.overflow = "";
      }
    });
  });

  document.addEventListener("click", (e) => {
    if (!navbar.contains(e.target) && navMiddle.classList.contains("active")) {
      hamburger.classList.remove("active");
      navMiddle.classList.remove("active");
      document.body.style.overflow = "";
    }
  });

  function updateActiveNav() {
    const sections = document.querySelectorAll("section[id]");
    const scrollPos = window.scrollY + 50;
    let activeSet = false;

    sections.forEach((section) => {
      const sectionTop = section.offsetTop;
      const sectionHeight = section.offsetHeight;
      const sectionId = section.getAttribute("id");
      const correspondingLink = document.querySelector(
        `.nav-middle a[href="#${sectionId}"]`
      );

      if (scrollPos >= sectionTop && scrollPos < sectionTop + sectionHeight) {
        navLinks.forEach((link) => link.classList.remove("active"));
        if (correspondingLink) {
          correspondingLink.classList.add("active");
          activeSet = true;
        }
      }
    });

    if (!activeSet && window.scrollY === 0) {
      navLinks.forEach((link) => link.classList.remove("active"));
      const homeLink = document.querySelector(`.nav-middle a[href="#home"]`);
      if (homeLink) homeLink.classList.add("active");
    }
  }

  window.addEventListener("scroll", updateActiveNav);

  navLinks.forEach((link) => {
    link.addEventListener("click", (e) => {
      const href = link.getAttribute("href");
      if (href.startsWith("#")) {
        e.preventDefault();
        const targetId = href.substring(1);
        const targetElement = document.getElementById(targetId);
        if (targetElement) {
          const offsetTop = targetElement.offsetTop - 80;
          window.scrollTo({
            top: offsetTop,
            behavior: "smooth",
          });
        }
      }
    });
  });

  function handleResize() {
    if (window.innerWidth > 768) {
      hamburger.classList.remove("active");
      navMiddle.classList.remove("active");
      document.body.style.overflow = "";
    }
  }

  window.addEventListener("resize", handleResize);

  navLinks.forEach((link) => {
    link.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        link.click();
      }
    });
  });

  hamburger.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleMobileMenu();
    }
  });

  hamburger.setAttribute("tabindex", "0");
  hamburger.setAttribute("role", "button");
  hamburger.setAttribute("aria-label", "Toggle navigation menu");
});
