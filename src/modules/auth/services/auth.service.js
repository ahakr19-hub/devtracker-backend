const ApiError = require("../../../utils/apiErrors");
const dotenv = require("dotenv");
const { OAuth2Client } = require('google-auth-library');
const axios = require("axios");
dotenv.config({ path: "./config.env" });
const Developer = require("../schemas/developer.schema");

const {
  isExists,
  createDev,
  findUserByEmail,
} = require("../repositories/auth.repository");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const sendMail = require("../../../utils/sendmailer");
const { hashOtp, generateOTP, compareOtp } = require("../../../utils/otp");
const tempUsers = [];

const registerdev = async (name, email, password) => {
  if (!email || !name || !password)
    throw new ApiError(400, "all fields are requierd");
  const exists = await isExists(email);
  if (exists) throw new ApiError(400, "Email already exists");

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  const otp = generateOTP();
  const resetOTP = await hashOtp(otp);
  const expiresInMin = Number(process.env.OTP_EXPIRES_MIN || 15);
  const resetOTPExpires = new Date(Date.now() + expiresInMin * 60 * 1000);
  const token = jwt.sign(
    { name, email, hashedPassword, resetOTP },
    process.env.JWT_SECRET,
    { expiresIn: "10m" },
  );

  tempUsers.push({
    name,
    email,
    password: hashedPassword,
    otp,
    createdAt: Date.now(),
    resetOTP,
    resetOTPExpires,
  });
  const html = `
      <p>Hi ${name},</p>
      <p>Your verifcation code is:</p>
      <h2>${otp}</h2>
      <p>This code will expire in ${expiresInMin} minutes.</p>
      <p>If you didn't request this, ignore this email.</p>
    `;

  await sendMail(email, "verify Email Code", html);
  console.log(hashOtp);
  console.log(expiresInMin);

  return token;
};

const otpToCreatAcc = async (otp, token) => {
  try {
    if (!otp) throw new ApiError(400, "OTP is required");

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const isMatchedOtp = await compareOtp(otp, decoded.resetOTP);
    if (!isMatchedOtp) throw new ApiError(401, "Invalid OTP");

    if (decoded.resetOTP < new Date()) throw new ApiError(400, "OTP expired");

    const developer = await Developer.create({
      name: decoded.name,
      email: decoded.email,
      password: decoded.hashedPassword,
      subscription: {}
    });

    return developer;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(401, "Your session has expired. Please register again.");
  }
};




// ... الأكواد القديمة ...



// --- Google Login Service ---
const googleLoginDev = async (idToken) => {
  try {
    const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const { email, name, picture } = ticket.getPayload();

    let developer = await findUserByEmail(email);

    if (!developer) {
      // إذا كان مستخدم جديد، ننشئ حساب بكلمة سر عشوائية
      const randomPassword = Math.random().toString(36).slice(-10);
      const hashedPassword = await bcrypt.hash(randomPassword, 10);

      developer = await Developer.create({
        name,
        email,
        password: hashedPassword,
        isVerified: true,
        subscription: {}
      });
    }

    const token = jwt.sign(
      { id: developer._id, email: developer.email, role: developer.role },
      process.env.JWT_SECRET,
      { expiresIn: "24h" }
    );

    return { developer, token };
  } catch (error) {
    throw new ApiError(401, "فشل التحقق من حساب جوجل");
  }
};

const githubLoginDev = async (code) => {
  try {
    // 1. تبديل الـ Code بـ Access Token
    const tokenResponse = await axios.post(
      "https://github.com/login/oauth/access_token",
      {
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code: code,
      },
      { headers: { Accept: "application/json" } }
    );

    const accessToken = tokenResponse.data.access_token;
    if (!accessToken) throw new ApiError(401, "Invalid GitHub code or expired");

    // 2. جلب بيانات البروفايل
    const userResponse = await axios.get("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${accessToken}`, "User-Agent": "DevTracker-API" },
    });

    const { name, login, id } = userResponse.data;
    let userEmail = userResponse.data.email;

    // 🔥 حل مشكلة الـ Private Email: لو رجع null، اطلبه من الـ emails endpoint بالتحديد
    if (!userEmail) {
      try {
        const emailsResponse = await axios.get("https://api.github.com/user/emails", {
          headers: { Authorization: `Bearer ${accessToken}`, "User-Agent": "DevTracker-API" },
        });
        // هات الإيميل الـ primary والـ verified
        const primaryEmailObj = emailsResponse.data.find(e => e.primary && e.verified);
        userEmail = primaryEmailObj ? primaryEmailObj.email : emailsResponse.data[0]?.email;
      } catch (e) {
        console.error("Failed to fetch GitHub private emails:", e.message);
      }
    }

    // fallback أخير لو مقفولة خالص
    if (!userEmail) {
      userEmail = `${login}@github.com`;
    }

    // 3. التشييك الذكي: هل المستخدم موجود بالإيميل ده فعلاً (سواء سجل بجوجل أو عادي قبل كده)؟
    let developer = await findUserByEmail(userEmail);

    // تجهيز بيانات جيت هاب وتشفير التوكن عشان الفيتشرات الـ جوه الأبلكيشن متضربش
    const { encryptToken } = require("../../../utils/crypto.helper"); // تأكد من المسار الصح عندك
    const encryptedToken = encryptToken(accessToken);
    
    const githubData = {
      githubId: String(id),
      githubToken: encryptedToken,
      githubLogin: login,
    };

    if (!developer) {
      // مستخدم جديد تماماً -> كريت حسابه واربط جيت هاب فوراً
      const randomPassword = Math.random().toString(36).slice(-10);
      const hashedPassword = await bcrypt.hash(randomPassword, 10);

      // هنا بنعمل ونشغل الـ trial بالمرة لو أول مرة يربط جيت هاب
      const { startProTrial } = require("../../../utils/trial.helper");

      developer = new Developer({
        name: name || login,
        email: userEmail,
        password: hashedPassword,
        isVerified: true,
        github: githubData
      });

      startProTrial(developer); // تشغيل الـ 30 يوم الـ Pro للجديد
      await developer.save();
    } else {
      // 🔥 دمج الحسابات (Account Merging): المستخدم مسجل بجوجل مثلاً، حدث بيانات جيت هاب جواه عشان ميتعملش أكونت تاني!
      developer.github = {
        ...developer.github?.toObject(),
        ...githubData
      };
      
      // لو معندوش trial شغاله شغلها له
      if (!developer.github.proTrialEndDate) {
        const { startProTrial } = require("../../../utils/trial.helper");
        startProTrial(developer);
      }

      await developer.save();
    }

    // 4. توقيع الـ JWT بتاع الـ DevTracker للدخول
    const token = jwt.sign(
      { id: developer._id, email: developer.email, role: developer.role },
      process.env.JWT_SECRET,
      { expiresIn: "24h" }
    );

    return { developer, token };
  } catch (error) {

    console.error("[GitHub Auth Error]:", error);
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, `GitHub Authentication Failed: ${error.message}`);
  }
};
const logindev = async (email, password) => {
  const developer = await findUserByEmail(email);
  if (!developer) throw new ApiError(401, "Invalid email or password");
  const isMatch = await bcrypt.compare(password, developer.password);
  if (!isMatch) throw new ApiError(401, "Invalid email or password");
  const token = jwt.sign(
    { id: developer._id, email: developer.email, role: developer.role },
    process.env.JWT_SECRET,
    { expiresIn: "24h" },
  );
  return { developer, token };

};

const forgotPasswordDev = async (email) => {
  if (!email) {
    throw new ApiError(400, "Email is required");
  }

  const user = await findUserByEmail(email);
  if (!user) {
    return {
      message: "If the email exists, an OTP was sent.",
    };
  }
  const otp = generateOTP();
  const hashedOtp = await hashOtp(otp);

  const expiresInMin = Number(process.env.OTP_EXPIRES_MIN || 15);
  const otpExpires = new Date(Date.now() + expiresInMin * 60 * 1000);

  user.resetOTP = hashedOtp;
  user.resetOTPExpires = otpExpires;
  await user.save();

  const html = `
      <p>Hi ${user.name},</p>
      <p>Your password reset code is:</p>
      <h2>${otp}</h2>
      <p>This code will expire in ${expiresInMin} minutes.</p>
      <p>If you didn't request this, ignore this email.</p>
    `;

  await sendMail(user.email, "Password Reset Code", html);

  return {
    message: "If the email exists, an OTP was sent.",
  };
};

const changeDeveloperPassword = async (email, otp, newPassword) => {
  if (!email || !otp || !newPassword) throw new ApiError(400, "otp is requierd");
  const user = await findUserByEmail(email);
  if (!user) throw new ApiError(404, "User not Found");
  const isValidOtp = await compareOtp(otp, user.resetOTP);
  if (!isValidOtp) {
    throw new ApiError(401, "Invalid OTP");
  }
  const saltt = await bcrypt.genSalt(10);
  user.password = await bcrypt.hash(newPassword, saltt);
  user.resetOTP = null;
  user.resetOTPExpires = null;
  await user.save();
  return { message: "Password changed successfully" };
};

module.exports = { registerdev, logindev, otpToCreatAcc, forgotPasswordDev, changeDeveloperPassword, googleLoginDev, githubLoginDev };
