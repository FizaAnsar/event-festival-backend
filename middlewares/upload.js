const multer = require("multer");
const path = require("path");

// Common storage configuration
const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

// Generic middleware (for APIs that need PDFs + images)
const uploadGeneric = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "image/jpeg", "image/png", "image/jpg", 
      "application/pdf", "image/webp"
    ];
    allowedTypes.includes(file.mimetype) 
      ? cb(null, true)
      : cb(new Error("Invalid file type"), false);
  },
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

// Images-only middleware (for festivals)
const uploadFestivalImages = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "image/jpeg", "image/png", 
      "image/jpg", "image/webp"
    ];
    allowedTypes.includes(file.mimetype)
      ? cb(null, true)
      : cb(new Error("Only images are allowed"), false);
  },
  limits: { fileSize: 5 * 1024 * 1024 }
}).array('images', 5); // Max 5 images

module.exports = {
  uploadGeneric,
  uploadFestivalImages
};