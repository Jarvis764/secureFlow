import mongoose from 'mongoose';

const scanSchema = new mongoose.Schema(
  {
    projectName: { type: String, required: true },
    source: { type: String, enum: ['upload', 'github', 'api'], required: true },
    repoUrl: { type: String },
    totalDependencies: { type: Number, default: 0 },
    directDependencies: { type: Number, default: 0 },
    transitiveDependencies: { type: Number, default: 0 },
    vulnerabilityCount: {
      critical: { type: Number, default: 0 },
      high: { type: Number, default: 0 },
      medium: { type: Number, default: 0 },
      low: { type: Number, default: 0 },
      total: { type: Number, default: 0 },
    },
    riskScore: { type: Number, default: 0 },
    status: { type: String, enum: ['scanning', 'complete', 'error'], default: 'scanning' },
  },
  { timestamps: true }
);

export default mongoose.model('Scan', scanSchema);
