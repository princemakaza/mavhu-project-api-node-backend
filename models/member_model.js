const mongoose = require("mongoose");
const { Schema: Schema2 } = mongoose;

const MemberSchema = new Schema2({
  company: { type: Schema2.Types.ObjectId, ref: "Company", required: true },
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, required: true, trim: true },
  email: { type: String, required: true, trim: true, lowercase: true },
  title: { type: String, trim: true },
  role: { type: String, enum: ["admin", "member"], default: "member" },
  department: { type: String, trim: true }, // department the member works in
  phone: { type: String, trim: true }, // contact number
  // add to schema
  password_hash: { type: String, select: false },
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    unique: true,
  },

  status: { type: String, enum: ["active", "inactive"], default: "active" }, // member status
  joinedAt: { type: Date, default: Date.now },
});

MemberSchema.methods.getFullName = function () {
  return `${this.firstName} ${this.lastName}`;
};

module.exports = mongoose.model("Member", MemberSchema);
