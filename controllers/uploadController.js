const supabase = require('../utils/supabase');
const { v4: uuidv4 } = require('uuid');

const uploadFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const file = req.file;
    const fileExt = file.originalname.split('.').pop();
    const fileName = `${uuidv4()}.${fileExt}`;
    // Store in a 'menu-items' folder within the 'images' bucket
    const filePath = `menu-items/${fileName}`; 

    // Upload to Supabase Storage
    const { data, error } = await supabase
      .storage
      .from('images') // Ensure this bucket exists in your Supabase
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
        upsert: false
      });

    if (error) throw error;

    // Get Public URL
    const { data: publicUrlData } = supabase
      .storage
      .from('images')
      .getPublicUrl(filePath);

    res.json({ url: publicUrlData.publicUrl });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ message: 'Upload failed', error: error.message });
  }
};

module.exports = {
    uploadFile
};
