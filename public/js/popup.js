const popup = document.getElementById("popup-modal");
const popupTitle = document.getElementById("popup-title");
const popupText = document.getElementById("popup-text");
const closeBtn = document.querySelector(".close-popup");

document.querySelectorAll(".extra-links a").forEach((link) => {
  link.addEventListener("click", (e) => {
    e.preventDefault();
    const contentId = link.dataset.contentId;
    popupTitle.textContent = link.dataset.popup;
    popupText.innerHTML = document.getElementById(contentId).innerHTML;
    popup.style.display = "block";
  });
});

closeBtn.addEventListener("click", () => (popup.style.display = "none"));
window.addEventListener("click", (e) => {
  if (e.target === popup) popup.style.display = "none";
});
