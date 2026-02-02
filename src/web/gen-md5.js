const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const packageJson = require('./package.json');

const version = packageJson.version;
const filename = `7DTD-DS-P-Setup(${version}).exe`;
const filePath = path.join(__dirname, filename);
const outputPath = path.join(__dirname, 'md5.txt');

if (!fs.existsSync(filePath)) {
    console.error('File not found:', filePath);
    process.exit(1);
}

const hash = crypto.createHash('md5');
const stream = fs.createReadStream(filePath);

stream.on('data', data => {
    hash.update(data);
});

stream.on('end', () => {
    const fileHash = hash.digest('hex').toUpperCase(); // UpperCase to match PowerShell default
    fs.writeFileSync(outputPath, fileHash, 'utf8');
    console.log(`MD5 generated: ${fileHash}`);
});

stream.on('error', err => {
    console.error('Error reading file:', err);
    process.exit(1);
});
