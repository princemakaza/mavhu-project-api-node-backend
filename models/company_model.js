// File: models/company.model.js
const mongoose = require("mongoose");
const { Schema } = mongoose;


const CompanySchema = new Schema({
name: { type: String, required: true, trim: true },
registrationNumber: { type: String, trim: true },
email: { type: String, trim: true, lowercase: true },
phone: { type: String, trim: true },
address: { type: String, trim: true },
website: { type: String, trim: true },
country: { type: String, trim: true }, // company location
industry: { type: String, trim: true }, // business sector
description: { type: String, trim: true }, // short summary about the company
createdAt: { type: Date, default: Date.now },
});


CompanySchema.methods.getMembers = function () {
return mongoose.model("Member").find({ company: this._id });
};


module.exports = mongoose.model("Company", CompanySchema);