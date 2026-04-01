const dotenv = require("dotenv");
const mongoose = require("mongoose");
dotenv.config({ path: "./config.env" });

const dbConnection = () => {
  console.log("Connecting to MongoDB...");

  mongoose
    .connect(process.env.MONGO_URL, {
      // إجبار الاتصال على استخدام IPv4 لتجنب مشاكل الـ DNS في Node.js 18+
      family: 4,
      // تقليل وقت الانتظار للفشل بدلاً من 30 ثانية (اختياري)
      serverSelectionTimeoutMS: 5000,
    })
    .then(() => {
      console.log("Database is connected successfully ✅");
    })
    .catch((err) => {
      console.error("❌ Error in connection database:");
      console.error(err.message);
    });
};

module.exports = dbConnection;