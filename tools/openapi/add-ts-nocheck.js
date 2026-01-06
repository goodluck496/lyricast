const fs = require('fs');
const path = require('path');

const directories = [
  path.join(__dirname, '../../libs/openapi/client'),
  path.join(__dirname, '../../libs/openapi/backend')
];

directories.forEach(dir => {
  if (fs.existsSync(dir)) {
    processDirectory(dir);
  }
});

function processDirectory(dir) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      processDirectory(filePath);
    } else if (file.endsWith('.ts')) {
      const content = fs.readFileSync(filePath, 'utf8');
      if (!content.startsWith('// @ts-nocheck')) {
        fs.writeFileSync(filePath, '// @ts-nocheck\n' + content);
      }
    }
  });
}
