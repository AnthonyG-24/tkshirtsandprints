export async function handler(event, context) {
  return {
    statusCode: 200,
    body: JSON.stringify({
      shopDomain: process.env.SHOP_DOMAIN,
      token: process.env.SHOP_TOKEN,
    }),
  };
}
