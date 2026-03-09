import mongoose from 'mongoose';

const vulnCacheSchema = new mongoose.Schema({
  packageName: { type: String, required: true },
  packageVersion: { type: String, required: true },
  ecosystem: { type: String, default: 'npm' },
  vulnerabilities: { type: [mongoose.Schema.Types.Mixed], default: [] },
  cachedAt: { type: Date, default: Date.now },
});

vulnCacheSchema.index({ cachedAt: 1 }, { expireAfterSeconds: 86400 });
vulnCacheSchema.index({ packageName: 1, packageVersion: 1, ecosystem: 1 });

export default mongoose.model('VulnCache', vulnCacheSchema);
