const pool = require("../../config/db");
const { responseSender } = require("../../utilities/responseHandlers");
const upload = require("../../middleware/multer");
const {
    uploadToCloudinary,
    deleteCloudinaryFile,
} = require("../../utilities/cloudinary");

const uploadFile = async (req, res, next) => {
    try {
        // Check if file was uploaded
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }

        // Upload file to Cloudinary
        const result = await uploadToCloudinary(req.file.path, 'Item');

        // Return the Cloudinary upload result
        return res.status(200).json({ success: true, message: 'File uploaded to Cloudinary', data: result });
    } catch (error) {
        next(error);
    }
};

const deleteFile = async (req, res, next) => {

    try {
        const { public_id } = req.query;

        // Check if public_id is provided
        if (!public_id) {
            return res.status(400).json({ success: false, message: 'Public ID is required' });
        }

        // Delete file from Cloudinary
        const deleteResult = await deleteCloudinaryFile(public_id);

        // Return the delete result
        return res.status(200).json({ success: true, message: 'File deleted from Cloudinary', data: deleteResult });
    } catch (error) {
        next(error);
    }

};

module.exports = {
    uploadFile,
    deleteFile
};