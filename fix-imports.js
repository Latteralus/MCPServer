/**
 * This script fixes import paths in service files
 * Run it before starting the server to correct any path issues
 */
const fs = require('fs');
const path = require('path');

// List of directories to check for files with import issues
const dirsToCheck = [
  './services',
  './websocket',
  './models'
];

// Count of fixes
let totalFixes = 0;

console.log('Checking for incorrect import paths...');

// Process each directory
dirsToCheck.forEach(dir => {
  if (!fs.existsSync(dir)) {
    console.log(`Directory ${dir} does not exist. Skipping.`);
    return;
  }

  // Read all JavaScript files in the directory
  const files = fs.readdirSync(dir).filter(file => file.endsWith('.js'));
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Check for incorrect import paths
    let updatedContent = content;
    
    // Fix common path issues
    updatedContent = updatedContent.replace(/require\('\.\.\.\/config'\)/g, "require('../config')");
    updatedContent = updatedContent.replace(/require\('\.\.\.\/models\//g, "require('../models/");
    updatedContent = updatedContent.replace(/require\('\.\.\.\/services\//g, "require('../services/");
    updatedContent = updatedContent.replace(/require\('\.\.\.\/websocket\//g, "require('../websocket/");
    
    // If content was updated, save the changes
    if (content !== updatedContent) {
      fs.writeFileSync(filePath, updatedContent);
      console.log(`Fixed import paths in ${filePath}`);
      totalFixes++;
    }
  });
});

if (totalFixes > 0) {
  console.log(`Fixed ${totalFixes} files with incorrect import paths.`);
} else {
  console.log('No import path issues found.');
}

console.log('\nNow you can run the server with:');
console.log('node chatServer.js');