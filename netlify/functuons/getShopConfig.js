// netlify/functions/getCollections.js

export async function handler() {
  const shopDomain = process.env.SHOP_DOMAIN;
  const token = process.env.SHOP_TOKEN;
  const API_VERSION = "2025-01";

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
    return {
      statusCode: 200,
      body: JSON.stringify(data),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
}
