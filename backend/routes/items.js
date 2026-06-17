const express = require('express');
const router = express.Router();
const itemsController = require('../controllers/itemsController');
const auth = require('../middleware/auth');
const multer = require('multer');
const path = require('path');

// Multer storage configuration
const storage = multer.diskStorage({
  destination: './uploads',
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// Public endpoints
router.get('/', itemsController.getAllItems);
router.get('/:id', itemsController.getItemById);

// Protected endpoints
router.post('/', auth, upload.single('image'), itemsController.createItem);
router.put('/:id', auth, upload.single('image'), itemsController.updateItem);
router.delete('/:id', auth, itemsController.deleteItem);

module.exports = router;