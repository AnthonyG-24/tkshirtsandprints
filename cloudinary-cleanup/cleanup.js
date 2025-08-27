require("dotenv").config();
const cloudinary = require("cloudinary").v2;
console.log("CLOUDINARY_CLOUD_NAME:", process.env.CLOUDINARY_CLOUD_NAME);

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function deleteTestImages() {
  try {
    const { resources } = await cloudinary.search
      .expression("folder:shop_uploads/*")
      .max_results(500)
      .execute();

    for (const image of resources) {
      await cloudinary.uploader.destroy(image.public_id);
      console.log(`Deleted: ${image.public_id}`);
    }

    console.log("Cleanup complete!");
  } catch (err) {
    console.error(err);
  }
}

deleteTestImages();
