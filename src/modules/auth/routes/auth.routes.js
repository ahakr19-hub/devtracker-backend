const express = require("express");
const {register  , creatAccount }= require("../controllers/authcontrollers/register");
const {login, googleLogin} = require("../controllers/authcontrollers/login");
const regRouter = express.Router();
regRouter.post('/dev/register/registerdevs', register);
regRouter.post('/dev/register/creatdevacc' ,  creatAccount)
regRouter.post('/dev/login/logindevs' , login)
regRouter.post("/google-login",googleLogin);
module.exports = regRouter; 
