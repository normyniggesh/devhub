const fs = require('fs');
const path = require('path');

const templatesDir = path.join(__dirname, '../templates');
const pagesDir = path.join(__dirname, 'src/pages');

if (!fs.existsSync(pagesDir)) {
  fs.mkdirSync(pagesDir, { recursive: true });
}

const files = fs.readdirSync(templatesDir).filter(f => f.endsWith('.html'));

function htmlToJsx(html) {
  // A basic conversion of HTML to JSX
  let jsx = html
    .replace(/class=/g, 'className=')
    .replace(/for=/g, 'htmlFor=')
    .replace(/<!--([\s\S]*?)-->/g, '{/* $1 */}')
    .replace(/<img(.*?)>/g, (match, p1) => {
       if(p1.endsWith('/')) return match;
       return `<img${p1} />`;
    })
    .replace(/<input(.*?)>/g, (match, p1) => {
       if(p1.endsWith('/')) return match;
       return `<input${p1} />`;
    })
    .replace(/<hr(.*?)>/g, (match, p1) => {
       if(p1.endsWith('/')) return match;
       return `<hr${p1} />`;
    })
    .replace(/<br(.*?)>/g, (match, p1) => {
       if(p1.endsWith('/')) return match;
       return `<br${p1} />`;
    })
    // inline styles handling is tricky, but let's try a simple regex for style="width: 78%" -> style={{ width: '78%' }}
    .replace(/style="([^"]+)"/g, (match, p1) => {
      const styles = p1.split(';').filter(Boolean).map(s => {
        const [key, value] = s.split(':').map(str => str.trim());
        if(!key) return '';
        const camelKey = key.replace(/-([a-z])/g, g => g[1].toUpperCase());
        return `${camelKey}: '${value}'`;
      }).filter(Boolean).join(', ');
      return `style={{ ${styles} }}`;
    });
    
    // fix some unclosed tags like <circle> <path> if they don't have closing tags? SVG paths usually have closing tags.
    // wait, input and img are the main ones in these files.
  
  return jsx;
}

files.forEach(file => {
  const content = fs.readFileSync(path.join(templatesDir, file), 'utf8');
  
  // Extract content between <main> and </main> or something similar.
  // Actually, some files might use <main>, some might use something else.
  // Let's just extract the main content. Usually it's after </aside> or <aside ...> ... </aside>
  let mainContent = '';
  const asideEnd = content.indexOf('</aside>');
  if (asideEnd !== -1) {
    mainContent = content.substring(asideEnd + '</aside>'.length);
    // remove </body></html>
    mainContent = mainContent.replace(/<\/body>\s*<\/html>/i, '');
  } else {
    // If no aside, just grab body
    const bodyMatch = content.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    mainContent = bodyMatch ? bodyMatch[1] : content;
  }
  
  const jsxContent = htmlToJsx(mainContent.trim());
  const name = file.replace('.htm.html', '').replace('.html', '');
  const componentName = name.charAt(0).toUpperCase() + name.slice(1).replace(/[^a-zA-Z0-9]/g, '');
  
  const jsxFile = `export default function ${componentName}() {
  return (
    <>
      ${jsxContent}
    </>
  );
}`;

  fs.writeFileSync(path.join(pagesDir, `${componentName}.jsx`), jsxFile);
  console.log(`Created ${componentName}.jsx`);
});
