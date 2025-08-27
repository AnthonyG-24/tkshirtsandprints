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
let cartItems = new Map();
let cartId = null;
let cachedCart = null;

async function loadConfig() {
  try {
    const res = await fetch("/.netlify/functions/getShopConfig");
    const data = await res.json();

    if (!data.collections) throw new Error("Collections not loaded");

    allCollections = data.collections;
    displayCollections(allCollections);

    const firstTag = document.querySelector(".tag-selector .tag");
    if (firstTag) setTimeout(() => firstTag.click(), 500);
  } catch (err) {
    console.error("Shopify config error:", err);
    showCollectionError("Shopify config not loaded.");
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

//Shopify API code below
// ----- UPLOAD HANDLER -----
document.querySelectorAll(".upload-input").forEach((input) => {
  input.addEventListener("change", async () => {
    const file = input.files[0];
    if (!file) return;
    const url = await uploadToCloudinary(file);
    if (!url) return;

    let preview = input.parentElement.querySelector("img");
    if (!preview) {
      preview = document.createElement("img");
      preview.style.maxWidth = "80px";
      preview.style.marginTop = "5px";
      input.parentElement.appendChild(preview);
    }
    preview.src = url;
  });
});

document.addEventListener("DOMContentLoaded", async () => {
  await init();
  await getOrCreateCheckout();
  await updateCartFromServer();
  updateCartCounter();
  addCheckoutButton();

  const cartLink = document.querySelector(".nav-right a");
  const popup = document.getElementById("cart-popup");
  if (!cartLink || !popup) return;

  cartLink.addEventListener("click", async (e) => {
    e.preventDefault();
    popup.style.display = popup.style.display === "block" ? "none" : "block";
    if (popup.style.display === "block") await showCartPopup();
  });

  document.addEventListener("click", (e) => {
    if (
      popup.style.display === "block" &&
      !popup.contains(e.target) &&
      !cartLink.contains(e.target)
    ) {
      popup.style.display = "none";
    }
  });

  let closeBtn = document.getElementById("cart-close-btn");
  if (!closeBtn) {
    closeBtn = document.createElement("button");
    closeBtn.id = "cart-close-btn";
    closeBtn.textContent = "×";
    Object.assign(closeBtn.style, {
      position: "absolute",
      top: "0.25rem",
      right: "0.25rem",
      background: "transparent",
      border: "none",
      fontSize: "1.2rem",
      cursor: "pointer",
    });
    closeBtn.addEventListener("click", () => (popup.style.display = "none"));
    popup.appendChild(closeBtn);
  }

  const clearBtn = document.getElementById("clear-cart-btn");
  if (clearBtn) {
    clearBtn.addEventListener("click", async () => {
      if (confirm("Are you sure you want to clear your cart?")) {
        await clearCart();
        await createNewCart();
        updateCartCounter();
        updateCheckoutButton();
      }
    });
  }
});

async function uploadToCloudinary(file) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);

  try {
    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/upload`,
      { method: "POST", body: formData }
    );
    if (!res.ok) throw new Error("Upload failed");
    const data = await res.json();
    return data.secure_url;
  } catch (err) {
    console.error("Cloudinary error:", err);
    alert("Failed to upload file");
    return null;
  }
}

async function fetchCollections() {
  const query = `{
    collections(first: 20) {
      edges { node { id title handle description image { url altText } } }
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
      id title
      products(first: 50) {
        edges {
          node {
            id title handle description priceRange { minVariantPrice { amount currencyCode } maxVariantPrice { amount currencyCode } }
            images(first: 3) { edges { node { url altText } } }
            variants(first: 10) { edges { node { id title price { amount currencyCode } compareAtPrice { amount currencyCode } availableForSale selectedOptions { name value } } } }
            tags productType vendor availableForSale
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
  if (!collections.length) {
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
  document.querySelectorAll(".tag-selector .tag").forEach((button) => {
    button.addEventListener("click", async (e) => {
      e.preventDefault();
      if (button.disabled) return;
      document.querySelectorAll(".tag-selector .tag").forEach((btn) => {
        btn.classList.remove("active");
        btn.disabled = false;
      });
      button.classList.add("active");
      button.disabled = true;
      showLoading();
      try {
        if (button.dataset.collection === "all") await loadAllProducts();
        else {
          currentProducts = await fetchCollectionProducts(
            button.dataset.collection
          );
          displayProducts(currentProducts);
        }
      } catch {
        showError("Failed to load collection");
      }
      button.disabled = false;
    });
  });
}

async function loadAllProducts() {
  const allProducts = [];
  for (const collection of allCollections) {
    try {
      allProducts.push(
        ...(await fetchCollectionProducts(collection.node.handle))
      );
    } catch {}
  }
  currentProducts = allProducts;
  displayProducts(allProducts);
}

function displayProducts(products, page = 1) {
  const container = document.getElementById("products-container");
  if (!container) return;
  container.innerHTML = "";
  if (!products.length) {
    container.innerHTML = '<p class="no-products">No products found.</p>';
    return;
  }

  totalPages = Math.ceil(products.length / PRODUCTS_PER_PAGE);
  currentPage = page;
  const productsToShow = products.slice(
    (page - 1) * PRODUCTS_PER_PAGE,
    page * PRODUCTS_PER_PAGE
  );

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

    const isDTF = node.tags.includes("DTF Transfers");
    const gangSheetHtml = isDTF
      ? `
        <div class="gang-sheet-options">
          <label for="gang-size-${node.id}">Choose Gang Sheet Size:</label>
          <select id="gang-size-${node.id}" class="gang-size-selector">
            <option value="22x12|8.00">22x12 - $8.00</option>
            <option value="22x24|16.00">22x24 - $16.00</option>
            <option value="22x36|23.00">22x36 - $23.00</option>
            <option value="22x48|31.00">22x48 - $31.00</option>
            <option value="22x60|38.00">22x60 - $38.00</option>
            <option value="22x80|50.00">22x80 - $50.00</option>
            <option value="22x100|62.00">22x100 - $62.00</option>
            <option value="22x120|74.00">22x120 - $74.00</option>
            <option value="22x140|86.00">22x140 - $86.00</option>
            <option value="22x160|98.00">22x160 - $98.00</option>
            <option value="22x180|110.00">22x180 - $110.00</option>
            <option value="22x200|124.00">22x200 - $124.00</option>
          </select>
        </div>
      `
      : "";

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
            ? `<div class="product-variants">
                 <label for="variants-${node.id}">Options:</label>
                 <select id="variants-${node.id}" class="variant-selector">${options}</select>
               </div>`
            : ""
        }

        <div class="upload-wrapper">
          <label for="upload-${node.id}">Upload your design:</label>
          <input type="file" id="upload-${
            node.id
          }" class="upload-input" accept="image/*,application/pdf" />
        </div>

        ${gangSheetHtml}

        <button class="add-to-cart-btn" ${
          !node.availableForSale ? "disabled" : ""
        }>
          ${node.availableForSale ? "Add to Cart" : "Sold Out"}
        </button>

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
    Object.assign(pagination.style, {
      display: "flex",
      justifyContent: "center",
      gap: "0.5rem",
      marginTop: "2rem",
    });
    document.querySelector(".product-wrapper").appendChild(pagination);
  }
  pagination.innerHTML = "";
  for (let i = 1; i <= totalPages; i++) {
    const btn = document.createElement("button");
    btn.textContent = i;
    Object.assign(btn.style, {
      padding: "0.5rem 1rem",
      border: "1px solid var(--accent)",
      borderRadius: "0.5rem",
      cursor: "pointer",
      background: i === currentPage ? "var(--accent-gradient)" : "white",
      color: i === currentPage ? "white" : "var(--primary)",
    });
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
    const query = `query getCart($cartId: ID!) { 
      cart(id: $cartId) { 
        id checkoutUrl 
        lines(first:1) { edges { node { id } } } 
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
  const mutation = `mutation { 
    cartCreate(input: {}) { 
      cart { id checkoutUrl } 
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

// ----- ADD TO CART (WITH DEBUGGING) -----
async function addToCart(productId) {
  const variantSelect = document.getElementById(`variants-${productId}`);
  const selectedVariantId = variantSelect?.value;
  if (!selectedVariantId) return alert("Please select a variant");

  const fileInput = document.getElementById(`upload-${productId}`);
  let fileUrl = fileInput?.files[0]
    ? await uploadToCloudinary(fileInput.files[0])
    : null;

  const attributes = [];
  if (fileUrl) attributes.push({ key: "Uploaded File", value: fileUrl });

  const gangSizeSelect = document.getElementById(`gang-size-${productId}`);
  if (gangSizeSelect) {
    const [size, price] = gangSizeSelect.value.split("|");
    attributes.push({ key: "Gang Sheet", value: `${size} (${price})` });
  }

  const mutation = `
    mutation addCartLines($cartId: ID!, $lines: [CartLineInput!]!) {
      cartLinesAdd(cartId: $cartId, lines: $lines) {
        cart { id checkoutUrl lines(first:100) { edges { node { id quantity attributes { key value } merchandise { ... on ProductVariant { id title image { url altText } product { id title } } } } } } }
        userErrors { field message }
      }
    }`;

  const variables = {
    cartId: checkoutId,
    lines: [{ merchandiseId: selectedVariantId, quantity: 1, attributes }],
  };

  const res = await fetch(
    `https://${shopDomain}/api/${API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Storefront-Access-Token": token,
      },
      body: JSON.stringify({ query: mutation, variables }),
    }
  );

  const result = await res.json();
  if (result.data.cartLinesAdd.userErrors.length)
    return alert(result.data.cartLinesAdd.userErrors[0].message);

  cartItems.set(productId, {
    fileUrl,
    variantId: selectedVariantId,
    lineId: result.data.cartLinesAdd.cart.lines.edges.slice(-1)[0].node.id,
  });
  disableProductUpload(productId);
  checkoutUrl = result.data.cartLinesAdd.cart.checkoutUrl;
  updateCartCounter();
  updateCheckoutButton();
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

// ----- SHOW CART POPUP (WITH DEBUGGING) -----
async function showCartPopup() {
  await getOrCreateCheckout();

  const query = `
    query getCart($cartId: ID!) {
      cart(id: $cartId) { lines(first:100) { edges { node { id quantity attributes { key value } merchandise { ... on ProductVariant { id title image { url altText } product { id title } } } } } } checkoutUrl }
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
  const data = await res.json();
  const lines = data.data.cart.lines.edges || [];

  const ul = document.getElementById("cart-items");
  ul.innerHTML = lines
    .map((e) => {
      const fileUrl = e.node.attributes.find(
        (a) => a.key === "Uploaded File"
      )?.value;
      const productImageUrl = e.node.merchandise.image?.url || "";
      const productId = e.node.merchandise.product.id;

      const imageHtml = fileUrl
        ? `<div style="display:flex; gap:0.5rem; align-items:center;">
           <img src="${productImageUrl}" style="width:50px;height:50px;object-fit:cover;border-radius:4px;">
           <img src="${fileUrl}" style="width:50px;height:50px;object-fit:cover;border:2px solid #007bff;border-radius:4px;">
         </div>`
        : `<img src="${productImageUrl}" style="width:60px;height:60px;object-fit:cover;border-radius:4px;">`;

      return `<li style="display:flex;align-items:center;gap:0.75rem;">
              ${imageHtml}
              <div style="flex:1;">
                <div>${e.node.merchandise.product.title}</div>
                <div>Qty: ${e.node.quantity}</div>
              </div>
              <button onclick="removeFromCart('${e.node.id}','${productId}')">Remove</button>
            </li>`;
    })
    .join("");

  cartCount = lines.reduce((sum, e) => sum + (e.node.quantity || 0), 0);
  updateCartCounter();
  updateCheckoutButton();
}

// ----- UPDATE CART FROM SERVER (FIXED) -----
async function updateCartFromServer() {
  try {
    await getOrCreateCheckout();

    const query = `
      query getCart($cartId: ID!) {
        cart(id: $cartId) {
          checkoutUrl
          lines(first: 100) {
            edges {
              node {
                id
                quantity
                attributes { key value }
                merchandise {
                  ... on ProductVariant {
                    id
                    title
                    image { url altText }
                    product { 
                      title 
                      id
                    }
                  }
                }
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
    const lines = data.data?.cart?.lines?.edges || [];

    // Sync our local cart state with server
    cartItems.clear();
    lines.forEach((line) => {
      const productId = line.node.merchandise.product.id;
      const uploadedFileAttr = line.node.attributes?.find(
        (a) => a.key === "Uploaded File"
      );

      if (uploadedFileAttr) {
        cartItems.set(productId, {
          fileUrl: uploadedFileAttr.value,
          variantId: line.node.merchandise.id,
          lineId: line.node.id,
        });
        disableProductUpload(productId);
      }
    });

    cartCount = lines.reduce((sum, line) => sum + (line.node.quantity || 0), 0);

    // Update checkout URL if it changed
    if (data.data?.cart?.checkoutUrl) {
      checkoutUrl = data.data.cart.checkoutUrl;
      localStorage.setItem("checkoutUrl", checkoutUrl);
    }

    updateCartCounter();
    updateCheckoutButton();
  } catch (error) {
    console.error("Error updating cart from server:", error);
    cartCount = 0;
    updateCartCounter();
    updateCheckoutButton();
  }
}

function disableProductUpload(productId) {
  const uploadInput = document.getElementById(`upload-${productId}`);
  const addButton = uploadInput
    ?.closest(".product-info")
    .querySelector(".add-to-cart-btn");

  if (uploadInput) {
    uploadInput.disabled = true;
    uploadInput.style.opacity = "0.5";
    uploadInput.style.pointerEvents = "none";
  }

  if (addButton) {
    addButton.disabled = true;
    addButton.textContent = "Added!";
    addButton.style.opacity = "0.7";
    addButton.style.cursor = "not-allowed";
  }
}

// Enhanced clearCart function
async function clearCart() {
  try {
    await getOrCreateCheckout();

    const query = `query getCart($cartId: ID!) {
      cart(id: $cartId) { 
        lines(first: 100) { 
          edges { 
            node { 
              id 
              merchandise {
                ... on ProductVariant {
                  product { id }
                }
              }
            } 
          } 
        } 
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
        body: JSON.stringify({ query, variables: { cartId: checkoutId } }),
      }
    );

    const responseData = await res.json();
    const lines = responseData.data?.cart?.lines?.edges || [];
    const lineIds = lines.map((e) => e.node.id);

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

      // Re-enable all products that were in cart
      lines.forEach((line) => {
        const productId = line.node.merchandise.product.id;
        enableProductUpload(productId);
      });
    }

    // Clear our local tracking
    cartItems.clear();
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

async function removeFromCart(lineId, productId) {
  try {
    const mutation = `
      mutation removeCartLines($cartId: ID!, $lineIds: [ID!]!) {
        cartLinesRemove(cartId: $cartId, lineIds: $lineIds) {
          cart { 
            lines(first: 100) { 
              edges { 
                node { 
                  id 
                  quantity 
                  merchandise {
                    ... on ProductVariant {
                      product { id }
                    }
                  }
                } 
              } 
            } 
          }
          userErrors { field message }
        }
      }
    `;

    const response = await fetch(
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
            lineIds: [lineId],
          },
        }),
      }
    );

    const result = await response.json();

    if (result.data?.cartLinesRemove?.userErrors?.length > 0) {
      throw new Error(result.data.cartLinesRemove.userErrors[0].message);
    }

    // Remove from our tracking and re-enable upload
    cartItems.delete(productId);
    enableProductUpload(productId);

    // Update cart count
    const lines = result.data?.cartLinesRemove?.cart?.lines?.edges || [];
    cartCount = lines.reduce((sum, e) => sum + (e.node.quantity || 0), 0);

    updateCartCounter();
    updateCheckoutButton();

    // Refresh cart popup
    await showCartPopup();
  } catch (err) {
    console.error("Error removing item from cart:", err);
    alert("Error removing item: " + err.message);
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

// New function to re-enable upload when item is removed from cart
function enableProductUpload(productId) {
  const fileInput = document.getElementById(`upload-${productId}`);
  const addButton = document.querySelector(
    `[data-product-id="${productId}"] .add-to-cart-btn`
  );

  if (fileInput) {
    fileInput.disabled = false;
    fileInput.style.opacity = "1";
    fileInput.value = ""; // Clear the file input

    // Remove any preview image
    const preview = fileInput.parentElement.querySelector("img");
    if (preview) preview.remove();

    // Remove notice
    const notice = fileInput.parentElement.querySelector(".cart-notice");
    if (notice) notice.remove();
  }

  if (addButton) {
    addButton.disabled = false;
    addButton.textContent = "Add to Cart";
    addButton.style.opacity = "1";
  }
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

// Login functionality
document.addEventListener("DOMContentLoaded", function () {
  const loginIcon = document.getElementById("login-icon");
  if (loginIcon) {
    loginIcon.addEventListener("click", () => {
      const returnUrl = "/";
      window.location.href = `https://${shopDomain}/account/login?return_url=${returnUrl}`;
    });
  }
});

// Debug function for testing cart
function debugCart() {
  console.log("=== CART DEBUG INFO ===");
  console.log("Shop Domain:", shopDomain);
  console.log("Token:", token ? "Set" : "Not set");
  console.log("Checkout ID:", checkoutId);
  console.log("Checkout URL:", checkoutUrl);
  console.log("Cart Count:", cartCount);
  console.log("LocalStorage checkoutId:", localStorage.getItem("checkoutId"));
  console.log("LocalStorage checkoutUrl:", localStorage.getItem("checkoutUrl"));
}

window.removeFromCart = removeFromCart;

async function fetchCart(cartId) {
  const query = `query getCart($cartId: ID!) {
        cart(id: $cartId) {
            id
            lines(first: 10) {
                edges {
                    node {
                        id
                        quantity
                        attributes { key value }
                        merchandise { ... on ProductVariant { id title image { url } } }
                    }
                }
            }
        }
    }`;

  const res = await fetch("/your-graphql-endpoint", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { cartId } }),
  });

  const data = await res.json();
  return data.data.cart;
}

function renderCart(cart) {
  const popup = document.getElementById("cartPopup");
  popup.innerHTML = ""; // Clear popup

  cart.lines.edges.forEach((edge, index) => {
    const item = edge.node;

    // Create cart item element
    const div = document.createElement("div");
    div.classList.add("cart-item");

    // Use thumbnail for faster load
    const imgUrl = item.attributes.find(
      (attr) => attr.key === "uploaded_file"
    )?.value;
    const thumbUrl = imgUrl
      ? imgUrl.replace("/upload/", "/upload/w_200,h_200,c_fit/")
      : "";

    div.innerHTML = `
            <img src="${thumbUrl}" alt="Item ${index + 1}" />
            <div class="item-info">
                <p>${item.merchandise.title}</p>
                <p>Quantity: ${item.quantity}</p>
            </div>
        `;

    popup.appendChild(div);
  });

  // Update cart count
  const cartCount = cart.lines.edges.length;
  document.getElementById("cartCount").textContent = cartCount;

  popup.style.display = "block"; // Show popup
}

// Optional: clear cache when cart changes
function clearCartCache() {
  cachedCart = null;
}
