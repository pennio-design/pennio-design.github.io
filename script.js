<i class="fa-solid fa-bars"></i>';
        }
    });
});


document.addEventListener("DOMContentLoaded", function () {
  // Modal functionality for PDF portfolio
  const modal = document.getElementById("portfolioModal");
  const openBtn = document.getElementById("openPortfolio");
  const closeBtn = document.querySelector(".close");

  if (openBtn && modal && closeBtn) {
    openBtn.addEventListener("click", function () {
      modal.style.display = "block";
    });

    closeBtn.addEventListener("click", function () {
      modal.style.display = "none";
    });

    window.addEventListener("click", function (event) {
      if (event.target === modal) {
        modal.style.display = "none";
      }
    });
  }

  // Hamburger menu toggle for responsive header
  const menuToggle = document.getElementById("menu-toggle");
  const navMenu = document.getElementById("nav-menu");

  if (menuToggle && navMenu) {
    menuToggle.addEventListener("click", function () {
      navMenu.classList.toggle("active");

      // Toggle between bars and X icon
      const icon = menuToggle.querySelector("i");
      if (navMenu.classList.contains("active")) {
        icon.classList.replace("fa-bars", "fa-times");
      } else {
        icon.classList.replace("fa-times", "fa-bars");
      }
    });
  }

  // Active navigation link based on scroll position
  const sections = document.querySelectorAll("section");
  const navLinks = document.querySelectorAll("nav ul li a");

  window.addEventListener("scroll", function () {
    let currentSectionId = "";

    sections.forEach((section) => {
      const sectionTop = section.offsetTop - 100; // Adjust for header height
      if (window.pageYOffset >= sectionTop) {
        currentSectionId = section.getAttribute("id");
      }
    });

    navLinks.forEach((link) => {
      link.classList.remove("active");
      if (currentSectionId && link.getAttribute("href").includes(currentSectionId)) {
        link.classList.add("active");
      }
    });
  });

  // Smooth fade-in animation for sections when they enter the viewport
  const observer = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.2 }
  );

  document.querySelectorAll("section").forEach((section) => {
    section.classList.add("hidden");
    observer.observe(section);
  });
});
