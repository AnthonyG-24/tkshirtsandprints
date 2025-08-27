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
  const API_VERSION = "2025-01";

  // Determine which action based on HTTP method
  if (event.httpMethod === "GET") {
    // Shopify collections fetch
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
      return { statusCode: 200, body: JSON.stringify(data) };
    } catch (err) {
      return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
    }
  } else if (event.httpMethod === "POST") {
    // Cloudinary image upload
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
  } else {
    return { statusCode: 405, body: "Method Not Allowed" };
  }
};
