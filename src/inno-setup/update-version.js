const fs = require('fs');
const path = require('path');

// 讀取 package.json 版本
const packageJsonPath = path.join(__dirname, '..', 'web', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const version = packageJson.version;

// 產生 version.iss 檔案
const versionIssContent = `; 此檔案由 update-version.js 自動產生，請勿手動編輯
#define AppVersion "${version}"
`;

const outputPath = path.join(__dirname, 'version.iss');
fs.writeFileSync(outputPath, versionIssContent, 'utf8');

console.log(`版本設定檔已更新: ${version}`);
