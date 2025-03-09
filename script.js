document.addEventListener("DOMContentLoaded", function() {
  // Modal functionality for PDF portfolio
  const modal = document.getElementById("portfolioModal");
  const openBtn = document.getElementById("openPortfolio");
  const closeBtn = document.querySelector(".close");

  openBtn.addEventListener("click", function() {
    modal.style.display = "block";
  });

  closeBtn.addEventListener("click", function() {
    modal.style.display = "none";
  });

  window.addEventListener("click", function(event) {
    if (event.target === modal) {
      modal.style.display = "none";
    }
  });

  // Optional: additional interactive features (e.g., adding nav link active state, animations, etc.)
});
