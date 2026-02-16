const express = require('express');
const multer = require('multer');
const uploadController = require('../controllers/uploadController');
const { uploadLimiter } = require('../middlewares/rateLimiter');

const router = express.Router();

// Configure Multer to use memory storage (buffer)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  },
});

router.post('/upload', uploadLimiter, upload.single('file'), uploadController.uploadFile);

module.exports = router;
