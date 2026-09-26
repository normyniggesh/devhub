const fs = require('fs');
const path = require('path');
const pagesDir = path.join(__dirname, 'src/pages');

const files = fs.readdirSync(pagesDir);
files.forEach(file => {
  let content = fs.readFileSync(path.join(pagesDir, file), 'utf8');
  content = content
    .replace(/stroke-width=/g, 'strokeWidth=')
    .replace(/stroke-dasharray=/g, 'strokeDasharray=')
    .replace(/stroke-dashoffset=/g, 'strokeDashoffset=')
    .replace(/stroke-linecap=/g, 'strokeLinecap=')
    .replace(/stroke-linejoin=/g, 'strokeLinejoin=')
    .replace(/fill-opacity=/g, 'fillOpacity=')
    // Check if <circle> or <path> lack closing tags
    // Usually they are like <circle cx="50" cy="50" ... ></circle> in my HTML. 
    // Let's do a quick check if they compile.
  fs.writeFileSync(path.join(pagesDir, file), content);
});
