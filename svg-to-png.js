import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, 'public', 'og');
const OUTPUT_SIZE = { width: 1200, height: 630 };

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

async function convertSvgToPng(svgPath) {
  try {
    const gameName = path.basename(path.dirname(svgPath));
    const outputPath = path.join(OUTPUT_DIR, `${gameName}.png`);

    // Read SVG file
    const svgBuffer = fs.readFileSync(svgPath);

    // Convert SVG to PNG with specified dimensions
    await sharp(svgBuffer)
      .resize(OUTPUT_SIZE.width, OUTPUT_SIZE.height, {
        fit: 'contain',
        background: { r: 243, g: 234, b: 217, alpha: 1 } // Paper tone from wrong-note design
      })
      .png({ quality: 90 })
      .toFile(outputPath);

    console.log(`✓ ${gameName} → ${outputPath}`);
    return true;
  } catch (error) {
    console.error(`✗ Failed to convert ${svgPath}:`, error.message);
    return false;
  }
}

async function main() {
  const svgFiles = [];

  // Find all icon.svg files
  function findSvgFiles(dir) {
    const entries = fs.readdirSync(dir);
    for (const entry of entries) {
      const fullPath = path.join(dir, entry);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory() && !entry.startsWith('.')) {
        const iconPath = path.join(fullPath, 'icon.svg');
        if (fs.existsSync(iconPath)) {
          svgFiles.push(iconPath);
        }
      }
    }
  }

  findSvgFiles(__dirname);

  if (svgFiles.length === 0) {
    console.log('No icon.svg files found');
    return;
  }

  console.log(`Found ${svgFiles.length} SVG files. Converting...`);
  let succeeded = 0;
  for (const svgFile of svgFiles) {
    if (await convertSvgToPng(svgFile)) {
      succeeded++;
    }
  }

  console.log(`\nCompleted: ${succeeded}/${svgFiles.length} files converted`);
}

main();
