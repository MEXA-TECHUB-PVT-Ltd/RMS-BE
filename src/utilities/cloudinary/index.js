const { cloudinary } = require("../../config/cloudinary/index");

// upload to cloudinary
const uploadToCloudinary = async (path, folder) => {
  try { 

    const uploadResult = await cloudinary.uploader.upload(path, {
      folder: `RMS/${folder}`,
      allowed_formats: [],
      resource_type: "auto",
    });

    return uploadResult;
  } catch (error) {
    throw error;
  }
};

// update  on cloudinary
const updateCloudinaryFile = async (path, public_id) => {
  try {
    const updateResult = await cloudinary.uploader.upload(path, {
      public_id: public_id,
      allowed_formats: [],
      resource_type: "auto",
      overwrite: true,
    });

    return updateResult;
  } catch (error) {
    throw error;
  }
};

// delete from cloudinary
const deleteCloudinaryFile = async (public_id) => {

  console.log("public ID", public_id)
  try {
    const deleteResult = await cloudinary.uploader.destroy(public_id, {
      resource_type: "image",
    });
    return deleteResult;
  } catch (error) {
    throw error;
  }
};

// delete all from cloudinary
const deleteAllCloudinaryFiles = async (public_ids) => {
  try {
    const deleteResult = await cloudinary.api.delete_resources(public_ids);

    return deleteResult;
  } catch (error) {
    throw error;
  }
};

module.exports = {
  uploadToCloudinary,
  updateCloudinaryFile,
  deleteCloudinaryFile,
  deleteAllCloudinaryFiles,
};
