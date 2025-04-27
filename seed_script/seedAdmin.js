// seedAdmin.js
const Admin = require('../models/admin_model');

const seedDummyAdmin = async () => {
  try {
    const existingAdmin = await Admin.findOne({ email: "admin@festival.com" });
    
    if (!existingAdmin) {
        
      const admin = new Admin({
        name: "Super Admin",
        email: "admin@festival.com",
        password: "admin123" 
      });

      await admin.save();
      console.log('🎉 Dummy admin created successfully');
    } else {
      console.log('✅ Dummy admin already exists');
    }
  } catch (error) {
    console.error('❌ Error seeding admin:', error.message);
  }
};

module.exports = seedDummyAdmin;