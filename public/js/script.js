let shopDomain = "";
let token = "";
const API_VERSION = "2025-01";
let allCollections = [];
let currentProducts = [];
const PRODUCTS_PER_PAGE = 8;
let currentPage = 1;
let totalPages = 1;
const placeholderImage = "";
let checkoutId = null;
let checkoutUrl = null;
let cartCount = 0;

async function loadConfig() {
  try {
    const res = await fetch("/config.json");
    const data = await res.json();
    shopDomain = data.shopDomain;
    token = data.token;
  } catch {
    showCollectionError("Shopify config not loaded. Check config.json.");
  }
}

async function init() {
  await loadConfig();
  if (!shopDomain || !token) return;
  allCollections = await fetchCollections();
  displayCollections(allCollections);
  const firstTag = document.querySelector(".tag-selector .tag");
  if (firstTag) setTimeout(() => firstTag.click(), 500);
}

document.addEventListener("DOMContentLoaded", async () => {
  await init();
  await getOrCreateCheckout();
  await updateCartFromServer();
  updateCartCounter();
  addCheckoutButton();

  const cartLink = document.querySelector(".nav-right a");
  const popup = document.getElementById("cart-popup");
  if (!cartLink || !popup) return;

  // Toggle popup when clicking cart icon
  cartLink.addEventListener("click", async (e) => {
    e.preventDefault();
    if (popup.style.display === "block") {
      popup.style.display = "none";
    } else {
      await showCartPopup();
    }
  });

  // Close popup when clicking outside
  document.addEventListener("click", (e) => {
    if (
      popup.style.display === "block" &&
      !popup.contains(e.target) &&
      !cartLink.contains(e.target)
    ) {
      popup.style.display = "none";
    }
  });

  // Optional close button inside popup
  let closeBtn = document.getElementById("cart-close-btn");
  if (!closeBtn) {
    closeBtn = document.createElement("button");
    closeBtn.id = "cart-close-btn";
    closeBtn.textContent = "×";
    closeBtn.style.position = "absolute";
    closeBtn.style.top = "0.25rem";
    closeBtn.style.right = "0.25rem";
    closeBtn.style.background = "transparent";
    closeBtn.style.border = "none";
    closeBtn.style.fontSize = "1.2rem";
    closeBtn.style.cursor = "pointer";
    closeBtn.addEventListener("click", () => {
      popup.style.display = "none";
    });
    popup.appendChild(closeBtn);
  }

  // Clear cart button
  const clearBtn = document.getElementById("clear-cart-btn");
  if (clearBtn) {
    clearBtn.addEventListener("click", async () => {
      if (confirm("Are you sure you want to clear your cart?")) {
        await clearCart(); // remove all lines from the current cart
        await createNewCart(); // start a fresh cart
        updateCartCounter(); // update counter display
        updateCheckoutButton(); // update checkout button
      }
    });
  }
});

async function fetchCollections() {
  const query = `{
    collections(first: 20) {
      edges {
        node {
          id
          title
          handle
          description
          image { url altText }
        }
      }
    }
  }`;
  try {
    const res = await fetch(
      `https://${shopDomain}/api/${API_VERSION}/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Storefront-Access-Token": token,
        },
        body: JSON.stringify({ query }),
      }
    );
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    if (data.errors)
      throw new Error(data.errors[0]?.message || "GraphQL Error");
    return data.data.collections?.edges || [];
  } catch (error) {
    showCollectionError(`Failed to load collections: ${error.message}`);
    return [];
  }
}

async function fetchCollectionProducts(handle) {
  const query = `{
    collectionByHandle(handle: "${handle}") {
      id
      title
      products(first: 50) {
        edges {
          node {
            id
            title
            handle
            description
            priceRange { minVariantPrice { amount currencyCode } maxVariantPrice { amount currencyCode } }
            images(first: 3) { edges { node { url altText } } }
            variants(first: 10) { edges { node { id title price { amount currencyCode } compareAtPrice { amount currencyCode } availableForSale selectedOptions { name value } } } }
            tags
            productType
            vendor
            availableForSale
          }
        }
      }
    }
  }`;
  try {
    const res = await fetch(
      `https://${shopDomain}/api/${API_VERSION}/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Storefront-Access-Token": token,
        },
        body: JSON.stringify({ query }),
      }
    );
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    if (data.errors) throw new Error("GraphQL query failed");
    if (!data.data.collectionByHandle)
      throw new Error(`Collection "${handle}" not found`);
    return data.data.collectionByHandle.products.edges;
  } catch (error) {
    showError(`Failed to load products: ${error.message}`);
    return [];
  }
}

function displayCollections(collections) {
  const container = document.getElementById("collection-tags");
  if (!container) return;
  container.innerHTML = "";
  if (collections.length === 0) {
    container.innerHTML = '<p class="error-message">No collections found</p>';
    return;
  }
  const allButton = document.createElement("button");
  allButton.className = "tag active";
  allButton.textContent = "All";
  allButton.dataset.collection = "all";
  container.appendChild(allButton);
  collections.forEach(({ node }) => {
    const button = document.createElement("button");
    button.className = "tag";
    button.textContent = node.title;
    button.dataset.collection = node.handle;
    button.dataset.collectionId = node.id;
    container.appendChild(button);
  });
  addCollectionListeners();
}

function addCollectionListeners() {
  const buttons = document.querySelectorAll(".tag-selector .tag");
  buttons.forEach((button) => {
    button.addEventListener("click", async (e) => {
      e.preventDefault();
      if (button.disabled) return;
      buttons.forEach((btn) => {
        btn.classList.remove("active");
        btn.disabled = false;
      });
      button.classList.add("active");
      button.disabled = true;
      showLoading();
      const collectionHandle = button.dataset.collection;
      try {
        if (collectionHandle === "all") await loadAllProducts();
        else {
          const products = await fetchCollectionProducts(collectionHandle);
          currentProducts = products;
          displayProducts(products);
        }
      } catch {
        showError("Failed to load collection");
      } finally {
        button.disabled = false;
      }
    });
  });
}

async function loadAllProducts() {
  const allProducts = [];
  for (const collection of allCollections) {
    try {
      const products = await fetchCollectionProducts(collection.node.handle);
      allProducts.push(...products);
    } catch {}
  }
  currentProducts = allProducts;
  displayProducts(allProducts);
}

function displayProducts(products, page = 1) {
  const container = document.getElementById("products-container");
  if (!container) return;
  container.innerHTML = "";
  if (products.length === 0) {
    container.innerHTML = '<p class="no-products">No products found.</p>';
    return;
  }
  totalPages = Math.ceil(products.length / PRODUCTS_PER_PAGE);
  currentPage = page;
  const start = (page - 1) * PRODUCTS_PER_PAGE;
  const end = start + PRODUCTS_PER_PAGE;
  const productsToShow = products.slice(start, end);
  productsToShow.forEach(({ node }) => {
    const imageObj = node.images.edges[0]?.node;
    const imageUrl = imageObj?.url || placeholderImage;
    const imageAlt = imageObj?.altText || node.title || "";
    const options = node.variants.edges
      .map((v) => {
        const variant = v.node;
        const price = parseFloat(variant.price.amount).toFixed(2);
        const comparePrice = variant.compareAtPrice
          ? parseFloat(variant.compareAtPrice.amount).toFixed(2)
          : null;
        const priceDisplay =
          comparePrice && comparePrice !== price
            ? `${variant.price.currencyCode} ${price} (was ${comparePrice})`
            : `${variant.price.currencyCode} ${price}`;
        const availability = variant.availableForSale ? "" : " - SOLD OUT";
        return `<option value="${variant.id}" ${
          !variant.availableForSale ? "disabled" : ""
        }>${variant.title} - ${priceDisplay}${availability}</option>`;
      })
      .join("");
    const productDiv = document.createElement("div");
    productDiv.className = "product";
    productDiv.dataset.productId = node.id;
    productDiv.innerHTML = `
      ${
        imageUrl
          ? `<div class="product-image"><img src="${imageUrl}" alt="${imageAlt}" loading="lazy"></div>`
          : ""
      }
      <div class="product-info">
        <h3 class="product-title">${node.title}</h3>
      <p class="product-price">${
        node.priceRange.minVariantPrice.amount ===
        node.priceRange.maxVariantPrice.amount
          ? `${node.priceRange.minVariantPrice.currencyCode} $${node.priceRange.minVariantPrice.amount}`
          : `${node.priceRange.minVariantPrice.currencyCode} $${node.priceRange.minVariantPrice.amount} - $${node.priceRange.maxVariantPrice.amount}`
      }</p>

        ${
          node.description
            ? `<p class="product-description">${truncateText(
                node.description,
                100
              )}</p>`
            : ""
        }
        ${node.vendor ? `<p class="product-vendor">by ${node.vendor}</p>` : ""}
        ${
          node.variants.edges.length
            ? `<div class="product-variants"><label for="variants-${node.id}">Options:</label><select id="variants-${node.id}" class="variant-selector">${options}</select></div>`
            : ""
        }
        <button class="add-to-cart-btn" ${
          !node.availableForSale ? "disabled" : ""
        }>${node.availableForSale ? "Add to Cart" : "Sold Out"}</button>
        ${
          node.tags.length
            ? `<div class="product-tags">${node.tags
                .map((tag) => `<span class="tag">${tag}</span>`)
                .join("")}</div>`
            : ""
        }
      </div>
    `;
    container.appendChild(productDiv);
    const addButton = productDiv.querySelector(".add-to-cart-btn");
    if (addButton)
      addButton.addEventListener("click", () => addToCart(node.id));
  });
  renderPagination(products);
}

function renderPagination(products) {
  let pagination = document.getElementById("pagination");
  if (!pagination) {
    pagination = document.createElement("div");
    pagination.id = "pagination";
    pagination.style.display = "flex";
    pagination.style.justifyContent = "center";
    pagination.style.gap = "0.5rem";
    pagination.style.marginTop = "2rem";
    document.querySelector(".product-wrapper").appendChild(pagination);
  }
  pagination.innerHTML = "";
  for (let i = 1; i <= totalPages; i++) {
    const btn = document.createElement("button");
    btn.textContent = i;
    btn.style.padding = "0.5rem 1rem";
    btn.style.border = "1px solid var(--accent)";
    btn.style.borderRadius = "0.5rem";
    btn.style.cursor = "pointer";
    btn.style.background =
      i === currentPage ? "var(--accent-gradient)" : "white";
    btn.style.color = i === currentPage ? "white" : "var(--primary)";
    btn.onclick = () => displayProducts(products, i);
    pagination.appendChild(btn);
  }
}

function truncateText(text, maxLength) {
  return text.length <= maxLength
    ? text
    : text.substring(0, maxLength).trim() + "...";
}

function showError(message) {
  const container = document.getElementById("products-container");
  if (container)
    container.innerHTML = `<div class="error-message">${message}</div>`;
}

function showCollectionError(message) {
  const container = document.getElementById("collection-tags");
  if (container)
    container.innerHTML = `<div class="error-message">${message}</div>`;
}

function showLoading() {
  const container = document.getElementById("products-container");
  if (container)
    container.innerHTML = '<div class="loading">Loading products...</div>';
}

// ----- CART INITIALIZATION -----
async function getOrCreateCheckout() {
  // Try existing cart
  if (checkoutId) {
    const valid = await validateCart(checkoutId);
    if (valid) return { checkoutId, checkoutUrl };
    resetCartState();
  }

  // Try saved cart
  const savedId = localStorage.getItem("checkoutId");
  const savedUrl = localStorage.getItem("checkoutUrl");
  if (savedId) {
    const valid = await validateCart(savedId);
    if (valid) {
      checkoutId = savedId;
      checkoutUrl = savedUrl;
      return { checkoutId, checkoutUrl };
    }
    resetCartState();
  }

  // Create new cart
  return await createNewCart();
}

function resetCartState() {
  checkoutId = null;
  checkoutUrl = null;
  localStorage.removeItem("checkoutId");
  localStorage.removeItem("checkoutUrl");
}

async function validateCart(cartId) {
  try {
    const query = `query getCart($cartId: ID!) { cart(id: $cartId) { id checkoutUrl lines(first:1) { edges { node { id } } } } }`;
    const res = await fetch(
      `https://${shopDomain}/api/${API_VERSION}/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Storefront-Access-Token": token,
        },
        body: JSON.stringify({ query, variables: { cartId } }),
      }
    );
    const data = await res.json();
    return data.data?.cart?.id === cartId;
  } catch {
    return false;
  }
}

async function createNewCart() {
  const mutation = `mutation { cartCreate(input: {}) { cart { id checkoutUrl } userErrors { field message } } }`;
  const res = await fetch(
    `https://${shopDomain}/api/${API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Storefront-Access-Token": token,
      },
      body: JSON.stringify({ query: mutation }),
    }
  );
  const data = await res.json();
  const cartData = data.data?.cartCreate?.cart;
  if (!cartData) throw new Error("Failed to create cart");

  checkoutId = cartData.id;
  checkoutUrl = cartData.checkoutUrl;
  localStorage.setItem("checkoutId", checkoutId);
  localStorage.setItem("checkoutUrl", checkoutUrl);
  return { checkoutId, checkoutUrl };
}

// ----- ADD TO CART -----
async function addToCart(productId) {
  const variantSelect = document.getElementById(`variants-${productId}`);
  const selectedVariantId = variantSelect?.value;
  if (!selectedVariantId) return alert("Please select a variant");

  const addButton = variantSelect
    .closest(".product-info")
    .querySelector(".add-to-cart-btn");
  addButton.disabled = true;
  addButton.textContent = "Adding...";

  try {
    await getOrCreateCheckout();

    const mutation = `
      mutation addCartLines($cartId: ID!, $lines: [CartLineInput!]!) {
        cartLinesAdd(cartId: $cartId, lines: $lines) {
          cart { id checkoutUrl lines(first: 100) { edges { node { quantity } } } }
          userErrors { field message }
        }
      }`;
    const res = await fetch(
      `https://${shopDomain}/api/${API_VERSION}/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Storefront-Access-Token": token,
        },
        body: JSON.stringify({
          query: mutation,
          variables: {
            cartId: checkoutId,
            lines: [{ merchandiseId: selectedVariantId, quantity: 1 }],
          },
        }),
      }
    );
    const data = await res.json();
    const cartLinesAdd = data.data?.cartLinesAdd;

    if (cartLinesAdd.userErrors?.length > 0) {
      if (
        cartLinesAdd.userErrors.some((e) =>
          e.message.includes("does not exist")
        )
      ) {
        await createNewCart();
        return addToCart(productId); // retry
      }
      throw new Error(cartLinesAdd.userErrors[0].message);
    }

    checkoutUrl = cartLinesAdd.cart.checkoutUrl;
    localStorage.setItem("checkoutUrl", checkoutUrl);

    cartCount = cartLinesAdd.cart.lines.edges.reduce(
      (sum, e) => sum + e.node.quantity,
      0
    );
    updateCartCounter();
    updateCheckoutButton();

    addButton.textContent = "Added!";
    setTimeout(() => {
      addButton.disabled = false;
      addButton.textContent = "Add to Cart";
    }, 800);
  } catch (err) {
    console.error("Add to cart error:", err);
    alert("Error adding to cart: " + err.message);
    addButton.disabled = false;
    addButton.textContent = "Add to Cart";
  }
}

// ----- CLEAR CART -----
async function clearCart() {
  try {
    await getOrCreateCheckout();

    const query = `query getCart($cartId: ID!) { cart(id: $cartId) { lines(first: 100) { edges { node { id } } } } }`;
    const res = await fetch(
      `https://${shopDomain}/api/${API_VERSION}/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Storefront-Access-Token": token,
        },
        body: JSON.stringify({ query, variables: { cartId: checkoutId } }),
      }
    );
    const lineIds = res.ok
      ? (await res.json()).data?.cart?.lines?.edges?.map((e) => e.node.id) || []
      : [];

    if (lineIds.length > 0) {
      const mutation = `mutation removeCartLines($cartId: ID!, $lineIds: [ID!]!) { cartLinesRemove(cartId: $cartId, lineIds: $lineIds) { cart { lines(first: 100) { edges { node { quantity } } } } userErrors { field message } } }`;
      await fetch(`https://${shopDomain}/api/${API_VERSION}/graphql.json`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Storefront-Access-Token": token,
        },
        body: JSON.stringify({
          query: mutation,
          variables: { cartId: checkoutId, lineIds },
        }),
      });
    }

    cartCount = 0;
    updateCartCounter();
    updateCheckoutButton();
    document.getElementById("cart-items").innerHTML =
      "<li>Your bag is empty.</li>";
  } catch (err) {
    console.error("Error clearing cart:", err);
  }
}

// ----- CART COUNTER -----
function updateCartCounter() {
  const navbar = document.querySelector(".nav-right");
  if (!navbar) return;
  let counter = document.getElementById("cart-counter");
  if (!counter) {
    counter = document.createElement("div");
    counter.id = "cart-counter";
    Object.assign(counter.style, {
      width: "24px",
      height: "24px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      position: "absolute",
      top: "0",
      right: "0",
      background: "red",
      color: "white",
      borderRadius: "50%",
      fontSize: "0.8rem",
    });
    navbar.style.position = "relative";
    navbar.appendChild(counter);
  }
  counter.textContent = cartCount;
  counter.style.display = cartCount > 0 ? "flex" : "none";
}

// ----- CHECKOUT BUTTON -----
function updateCheckoutButton() {
  const btn = document.getElementById("checkout-btn");
  if (!btn) return;

  if (cartCount === 0) {
    btn.href = "#";
    btn.onclick = (e) => {
      e.preventDefault();
      alert("Your bag is empty.");
    };
    btn.style.opacity = "0.6";
    btn.style.pointerEvents = "auto";
  } else {
    btn.href = checkoutUrl || "#";
    btn.target = "_blank";
    btn.onclick = null;
    btn.style.opacity = "1";
  }
}

// ----- SHOW CART POPUP -----
async function showCartPopup() {
  try {
    await getOrCreateCheckout();
    const query = `query getCart($cartId: ID!) { cart(id: $cartId) { lines(first: 100) { edges { node { quantity merchandise { ... on ProductVariant { id title product { title } } } } } } } }`;
    const res = await fetch(
      `https://${shopDomain}/api/${API_VERSION}/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Storefront-Access-Token": token,
        },
        body: JSON.stringify({ query, variables: { cartId: checkoutId } }),
      }
    );
    const data = await res.json();
    const lines = data.data?.cart?.lines?.edges || [];
    const ul = document.getElementById("cart-items");
    ul.innerHTML =
      lines.length === 0
        ? "<li>Your bag is empty.</li>"
        : lines
            .map(
              (e) =>
                `<li>${e.node.merchandise.product.title} - ${e.node.merchandise.title} x ${e.node.quantity}</li>`
            )
            .join("");

    document.getElementById("cart-popup").style.display = "block";
    cartCount = lines.reduce((sum, e) => sum + e.node.quantity, 0);
    updateCartCounter();
    updateCheckoutButton();
  } catch (err) {
    console.error("Error showing cart popup:", err);
  }
}

async function updateCartFromServer() {
  try {
    await getOrCreateCheckout();

    const query = `
      query getCart($cartId: ID!) {
        cart(id: $cartId) {
          lines(first: 100) {
            edges { 
              node { 
                quantity 
              } 
            }
          }
        }
      }
    `;

    const res = await fetch(
      `https://${shopDomain}/api/${API_VERSION}/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Storefront-Access-Token": token,
        },
        body: JSON.stringify({ query, variables: { cartId: checkoutId } }),
      }
    );

    const data = await res.json();

    if (data.data?.cart?.lines) {
      const lines = data.data.cart.lines.edges;
      cartCount = lines.reduce((sum, e) => sum + e.node.quantity, 0);
    } else {
      cartCount = 0;
    }
  } catch (error) {
    console.error("Error updating cart from server:", error);
    cartCount = 0;
  }
}

async function clearCart() {
  try {
    await getOrCreateCheckout();

    // Fetch all line IDs
    const query = `query getCart($cartId: ID!) {
      cart(id: $cartId) { lines(first: 100) { edges { node { id } } } }
    }`;
    const res = await fetch(
      `https://${shopDomain}/api/${API_VERSION}/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Storefront-Access-Token": token,
        },
        body: JSON.stringify({ query, variables: { cartId: checkoutId } }),
      }
    );
    const lineIds = res.ok
      ? (await res.json()).data?.cart?.lines?.edges?.map((e) => e.node.id) || []
      : [];

    // Remove all lines
    if (lineIds.length > 0) {
      const mutation = `mutation removeCartLines($cartId: ID!, $lineIds: [ID!]!) {
        cartLinesRemove(cartId: $cartId, lineIds: $lineIds) {
          cart { lines(first: 100) { edges { node { quantity } } } }
          userErrors { field message }
        }
      }`;
      await fetch(`https://${shopDomain}/api/${API_VERSION}/graphql.json`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Storefront-Access-Token": token,
        },
        body: JSON.stringify({
          query: mutation,
          variables: { cartId: checkoutId, lineIds },
        }),
      });
    }

    // Reset state
    cartCount = 0;
    checkoutUrl = null;
    updateCartCounter();
    updateCheckoutButton();
    document.getElementById("cart-items").innerHTML =
      "<li>Your bag is empty.</li>";
  } catch (err) {
    console.error("Error clearing cart:", err);
  }
}

function addCheckoutButton() {
  const popup = document.getElementById("cart-popup");
  if (!popup) return;

  let btn = document.getElementById("checkout-btn");
  if (!btn) {
    btn = document.createElement("a");
    btn.id = "checkout-btn";
    btn.textContent = "Checkout";
    btn.style.display = "inline-block";
    btn.style.marginTop = "1rem";
    btn.style.padding = "0.5rem 1rem";
    btn.style.background = "var(--accent)";
    btn.style.color = "white";
    btn.style.textDecoration = "none";
    btn.style.borderRadius = "0.5rem";
    popup.appendChild(btn);
  }

  // Check if cart is empty
  if (cartCount === 0) {
    btn.href = "#";
    btn.onclick = (e) => {
      e.preventDefault();
      alert("Your bag is empty.");
    };
    btn.style.opacity = "0.6"; // optional: show disabled look
    btn.style.pointerEvents = "auto"; // keep clickable for alert
  } else {
    btn.href = checkoutUrl || "#";
    btn.target = "_blank";
    btn.onclick = null;
    btn.style.opacity = "1";
  }
}

// Order Tracking - Redirect to Shopify Order Status Page
function handleTrackOrder() {
  // Close the chat widget first
  closeChatWidget();

  // Show the tracking modal
  showTrackingModal();
}

function showTrackingModal() {
  // Create modal if it doesn't exist
  let modal = document.getElementById("tracking-modal");
  if (!modal) {
    modal = createTrackingModal();
    document.body.appendChild(modal);
  }

  // Show the modal
  modal.style.display = "flex";

  // Focus on the first input
  setTimeout(() => {
    const firstInput = modal.querySelector("input");
    if (firstInput) firstInput.focus();
  }, 100);
}

function createTrackingModal() {
  const modal = document.createElement("div");
  modal.id = "tracking-modal";
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
  `;

  modal.innerHTML = `
    <div style="
      background: white;
      border-radius: 12px;
      padding: 30px;
      max-width: 400px;
      width: 90%;
      max-height: 90vh;
      overflow-y: auto;
      position: relative;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
    ">
      <button onclick="closeTrackingModal()" style="
        position: absolute;
        top: 15px;
        right: 15px;
        background: none;
        border: none;
        font-size: 24px;
        cursor: pointer;
        color: #666;
        padding: 5px;
      ">×</button>
      
      <div style="text-align: center; margin-bottom: 25px;">
        <i class="fa-solid fa-truck" style="font-size: 48px; color: #007bff; margin-bottom: 15px;"></i>
        <h2 style="margin: 0; color: #333;">Track Your Order</h2>
      </div>
      
      <form onsubmit="trackOrder(event)" style="display: flex; flex-direction: column; gap: 20px;">
        <div>
          <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #333;">
            Order Number
          </label>
          <input 
            type="text" 
            id="order-number" 
            placeholder="e.g., #1001 or 1001"
            required
            style="
              width: 100%;
              padding: 12px;
              border: 2px solid #ddd;
              border-radius: 8px;
              font-size: 16px;
              box-sizing: border-box;
            "
          >
        </div>
        
        <div>
          <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #333;">
            Email Address
          </label>
          <input 
            type="email" 
            id="email-address" 
            placeholder="Enter your email address"
            required
            style="
              width: 100%;
              padding: 12px;
              border: 2px solid #ddd;
              border-radius: 8px;
              font-size: 16px;
              box-sizing: border-box;
            "
          >
        </div>
        
        <button type="submit" id="track-btn" style="
          background: linear-gradient(135deg, #007bff, #0056b3);
          color: white;
          border: none;
          padding: 14px 20px;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: transform 0.2s;
        " onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='translateY(0)'">
          <i class="fa-solid fa-search"></i> Track Order
        </button>
        
        <div id="tracking-message" style="
          display: none;
          padding: 12px;
          border-radius: 8px;
          text-align: center;
          font-weight: 500;
        "></div>
        
        <div style="
          background: #f8f9fa;
          padding: 15px;
          border-radius: 8px;
          font-size: 14px;
          color: #666;
        ">
          <p style="margin: 0 0 10px 0; font-weight: 600;">💡 Tips:</p>
          <ul style="margin: 0; padding-left: 20px;">
            <li>Find your order number in your confirmation email</li>
            <li>Use the same email used during checkout</li>
            <li>Orders may take 24 hours to show tracking info</li>
          </ul>
        </div>
      </form>
    </div>
  `;

  return modal;
}

function trackOrder(event) {
  event.preventDefault();

  const orderNumber = document.getElementById("order-number").value.trim();
  const email = document.getElementById("email-address").value.trim();
  const messageDiv = document.getElementById("tracking-message");
  const trackBtn = document.getElementById("track-btn");

  // Basic validation
  if (!orderNumber || !email) {
    showMessage("Please fill in all fields", "error");
    return;
  }

  if (!isValidEmail(email)) {
    showMessage("Please enter a valid email address", "error");
    return;
  }

  // Show loading state
  trackBtn.innerHTML =
    '<i class="fa-solid fa-spinner fa-spin"></i> Redirecting...';
  trackBtn.disabled = true;

  // Clean order number (remove # if present)
  const cleanOrderNumber = orderNumber.replace("#", "");

  // Construct Shopify order status URL
  const orderStatusUrl = `https://${shopDomain}/tools/order-status?order_number=${cleanOrderNumber}&email=${encodeURIComponent(
    email
  )}`;

  // Show success message
  showMessage("Taking you to your order status page...", "success");

  // Redirect in the same tab after a short delay
  setTimeout(() => {
    window.location.href = orderStatusUrl;
  }, 1500);
}

function showMessage(message, type) {
  const messageDiv = document.getElementById("tracking-message");
  const isError = type === "error";

  messageDiv.style.cssText = `
    display: block;
    padding: 12px;
    border-radius: 8px;
    text-align: center;
    font-weight: 500;
    background: ${isError ? "#fee" : "#d4edda"};
    color: ${isError ? "#dc3545" : "#155724"};
    border: 1px solid ${isError ? "#fecaca" : "#c3e6cb"};
  `;

  messageDiv.innerHTML = `
    <i class="fa-solid fa-${
      isError ? "exclamation-triangle" : "check-circle"
    }"></i>
    ${message}
  `;
}

function closeTrackingModal() {
  const modal = document.getElementById("tracking-modal");
  if (modal) {
    modal.style.display = "none";

    // Reset form
    const orderInput = document.getElementById("order-number");
    const emailInput = document.getElementById("email-address");
    const messageDiv = document.getElementById("tracking-message");
    const trackBtn = document.getElementById("track-btn");

    if (orderInput) orderInput.value = "";
    if (emailInput) emailInput.value = "";
    if (messageDiv) messageDiv.style.display = "none";
    if (trackBtn) {
      trackBtn.innerHTML = '<i class="fa-solid fa-search"></i> Track Order';
      trackBtn.disabled = false;
    }
  }
}

function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Close modal when clicking outside
document.addEventListener("click", function (event) {
  const modal = document.getElementById("tracking-modal");
  if (modal && event.target === modal) {
    closeTrackingModal();
  }
});

// Handle escape key
document.addEventListener("keydown", function (event) {
  if (event.key === "Escape") {
    closeTrackingModal();
  }
});

/* // Redirect to Shopify login page
document.getElementById("follow-store-btn").addEventListener("click", () => {
  // Replace with your Shopify store URL
  const shopLoginUrl = shopDomain;

  // Optional: Add redirect to a 'thank you' page after login
  const redirectAfterLogin = "?return_to=/pages/thank-you-follow";

  window.location.href = shopLoginUrl + redirectAfterLogin;
}); */

document.getElementById("login-icon").addEventListener("click", () => {
  // Optional: redirect back to a page after login
  const returnUrl = "/"; // homepage or current page
  window.location.href = `${shopDomain}/account/login?return_url=${returnUrl}`;
});
