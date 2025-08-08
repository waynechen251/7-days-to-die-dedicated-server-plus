function formatBytes(size) {
  if (size >= 1024 ** 3) return `${(size / 1024 ** 3).toFixed(2)} GB`;
  if (size >= 1024 ** 2) return `${(size / 1024 ** 2).toFixed(2)} MB`;
  if (size >= 1024) return `${(size / 1024).toFixed(2)} KB`;
  return `${size} B`;
}
module.exports = { formatBytes };
