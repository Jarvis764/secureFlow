import mongoose from 'mongoose';

const dependencySchema = new mongoose.Schema({
  scanId: { type: mongoose.Schema.Types.ObjectId, ref: 'Scan', required: true, index: true },
  name: { type: String, required: true },
  version: { type: String, required: true },
  depth: { type: Number, default: 0 },
  isDevDependency: { type: Boolean, default: false },
  parent: { type: String },
  vulnerabilities: [
    {
      id: { type: String },
      summary: { type: String },
      severity: { type: String, enum: ['critical', 'high', 'medium', 'low'] },
      cvssScore: { type: Number },
      fixedVersion: { type: String },
      references: [String],
    },
  ],
  riskScore: { type: Number, default: 0 },
  modulePath: { type: String, default: '' },
  license: { type: String, default: '' },
  licenseCategory: { type: String, enum: ['permissive', 'copyleft', 'unknown', ''], default: '' },
});

export default mongoose.model('Dependency', dependencySchema);
