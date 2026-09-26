const fs = require('fs');
const path = require('path');
const pagesDir = path.join(__dirname, 'src/pages');

const files = fs.readdirSync(pagesDir);
files.forEach(file => {
  let content = fs.readFileSync(path.join(pagesDir, file), 'utf8');
  
  // Find <main> and </main>
  const mainStartMatch = content.match(/<main[^>]*>/i);
  const mainEndMatch = content.match(/<\/main>/i);
  
  if (mainStartMatch && mainEndMatch) {
    const mainContent = content.substring(
      mainStartMatch.index + mainStartMatch[0].length,
      mainEndMatch.index
    );
    
    const name = file.replace('.jsx', '');
    const jsxFile = `export default function ${name}() {
  return (
    <>
      ${mainContent.trim()}
    </>
  );
}`;
    fs.writeFileSync(path.join(pagesDir, file), jsxFile);
  }
});
