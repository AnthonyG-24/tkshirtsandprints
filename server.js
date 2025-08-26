import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();

const app = express();
app.use(cors()); // allow requests from your frontend
app.use(express.json());

// Shopify GraphQL endpoint
const SHOPIFY_URL = `https://${process.env.SHOP_DOMAIN}/api/2024-01/graphql.json`;
const TOKEN = process.env.STORE_FRONT_TOKEN;

// Endpoint to fetch collections
app.post("/api/collections", async (req, res) => {
  const query = `
    {
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
    }
  `;

  try {
    const response = await fetch(SHOPIFY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Storefront-Access-Token": TOKEN,
      },
      body: JSON.stringify({ query }),
    });

    const data = await response.json();

    if (data.errors) {
      return res.status(500).json({ errors: data.errors });
    }

    res.json(data.data.collections.edges);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch collections" });
  }
});

// Endpoint to fetch products by collection handle
app.post("/api/products", async (req, res) => {
  const { handle } = req.body;

  const query = `
    {
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
              priceRange {
                minVariantPrice { amount currencyCode }
                maxVariantPrice { amount currencyCode }
              }
              images(first: 3) { edges { node { url altText } } }
              variants(first: 10) { edges { node { id title price { amount currencyCode } availableForSale } } }
              tags
              vendor
              availableForSale
            }
          }
        }
      }
    }
  `;

  try {
    const response = await fetch(SHOPIFY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Storefront-Access-Token": TOKEN,
      },
      body: JSON.stringify({ query }),
    });

    const data = await response.json();

    if (data.errors) {
      return res.status(500).json({ errors: data.errors });
    }

    res.json(data.data.collectionByHandle.products.edges);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch products" });
  }
});

// ✅ Endpoint to send Shopify config to frontend
app.get("/config", (req, res) => {
  res.json({
    shopDomain: process.env.SHOP_DOMAIN,
    token: process.env.STORE_FRONT_TOKEN,
    apiVersion: "2024-01",
  });
});

// Serve static frontend files
app.use("/public", express.static("public"));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
