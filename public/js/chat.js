const chatWidget = document.getElementById("chatWidget");
let isExpanded = false;

// Enhanced toggle function with accessibility
function toggleChatWidget() {
  isExpanded = !isExpanded;

  if (isExpanded) {
    chatWidget.classList.add("expanded");
    chatWidget.setAttribute("aria-expanded", "true");
    chatWidget.setAttribute("aria-label", "Close chat menu");
    // Focus first menu item for keyboard navigation
    setTimeout(() => {
      const firstButton = chatWidget.querySelector(".chat-button");
      if (firstButton) firstButton.focus();
    }, 100);
  } else {
    chatWidget.classList.remove("expanded");
    chatWidget.setAttribute("aria-expanded", "false");
    chatWidget.setAttribute("aria-label", "Open chat menu");
    chatWidget.focus();
  }
}

function closeChatWidget() {
  if (isExpanded) {
    isExpanded = false;
    chatWidget.classList.remove("expanded");
    chatWidget.setAttribute("aria-expanded", "false");
    chatWidget.setAttribute("aria-label", "Open chat menu");
    chatWidget.focus();
  }
}

// Event listeners
chatWidget.addEventListener("click", function (e) {
  if (e.target.tagName === "BUTTON" || e.target.closest("button")) return;
  toggleChatWidget();
});

// Keyboard accessibility
chatWidget.addEventListener("keydown", function (e) {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    if (!e.target.closest("button")) toggleChatWidget();
  }
});

// Global keyboard shortcuts
document.addEventListener("keydown", function (e) {
  if (e.key === "Escape" && isExpanded) closeChatWidget();
});

// Prevent event bubbling
chatWidget.addEventListener("click", function (e) {
  e.stopPropagation();
});

// Track Order button
function handleTrackOrder() {
  window.location.href = "/pages/order-lookup"; // keeps your current functionality
  closeChatWidget();
}

// Contact button no longer needs a handler (anchor scroll will handle it)

// Initialize accessibility attributes
chatWidget.setAttribute("aria-expanded", "false");
