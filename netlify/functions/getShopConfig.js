const API_VERSION = "2025-01";
const cloudinary = require("cloudinary").v2;
const fetch = require("node-fetch");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

module.exports.handler = async function (event, context) {
  const shopDomain = process.env.SHOP_DOMAIN;
  const token = process.env.SHOP_TOKEN;

  if (event.httpMethod === "GET") {
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

      // Only return what the frontend needs
      return {
        statusCode: 200,
        body: JSON.stringify({ collections: data.data.collections.edges }),
      };
    } catch (err) {
      return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
    }
  }

  if (event.httpMethod === "POST") {
    try {
      const body =
        typeof event.body === "string" ? JSON.parse(event.body) : event.body;
      const file = body.file;

      const result = await cloudinary.uploader.upload(file, {
        folder: "uploads",
      });

      return {
        statusCode: 200,
        body: JSON.stringify({ url: result.secure_url }),
      };
    } catch (err) {
      console.error(err);
      return { statusCode: 500, body: "Upload failed" };
    }
  }

  return { statusCode: 405, body: "Method Not Allowed" };
};

if (event.httpMethod === "GET") {
  const handle = event.queryStringParameters?.handle;

  let query;
  if (handle) {
    // fetch products for a specific collection
    query = `{
      collectionByHandle(handle: "${handle}") {
        id title
        products(first: 50) {
          edges {
            node {
              id title handle description
              priceRange { minVariantPrice { amount currencyCode } maxVariantPrice { amount currencyCode } }
              images(first: 3) { edges { node { url altText } } }
              variants(first: 10) { edges { node { id title price { amount currencyCode } availableForSale selectedOptions { name value } } } }
            }
          }
        }
      }
    }`;
  } else {
    // fallback: return collections list
    query = `{
      collections(first: 20) {
        edges { node { id title handle description image { url altText } } }
      }
    }`;
  }

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

    const data = await res.json();
    if (!res.ok || data.errors)
      throw new Error(JSON.stringify(data.errors || data));

    if (handle) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          products: data.data.collectionByHandle?.products.edges || [],
        }),
      };
    } else {
      return {
        statusCode: 200,
        body: JSON.stringify({ collections: data.data.collections.edges }),
      };
    }
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
}
