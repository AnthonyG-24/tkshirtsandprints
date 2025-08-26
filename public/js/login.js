const shopDomain = window.location.hostname;
const loginIcon = document.querySelector(".nav-right .fa-user");

loginIcon.addEventListener("click", () => {
  window.location.href = `https://${shopDomain}/account/login`;
});
